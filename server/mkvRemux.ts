import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * MKV is just a container — browsers refuse to open it regardless of what's
 * inside. If the actual codecs inside are already browser-friendly (e.g.
 * H.264 + AAC), we can remux — repackage the same streams into MP4 without
 * touching quality — using ffmpeg's `-c copy`, which is a fast repackage,
 * not a re-encode. HEVC video or DTS/AC3/TrueHD audio inside the MKV can't
 * be fixed this way; those still fall back to the download prompt.
 *
 * ffmpeg is an optional system dependency — if it's missing, every function
 * here degrades to "not available" rather than throwing, so the app works
 * identically to before this feature existed.
 */

const CACHE_DIR = join(process.cwd(), '.goflix-cache', 'remux');

const REMUXABLE_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1']);
const REMUXABLE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le']);

let ffmpegAvailable: boolean | null = null;

function run(cmd: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch {
      resolve({ code: -1, stdout: '', stderr: 'spawn failed' });
      return;
    }
    child.stdout?.on('data', (d) => (stdout += d));
    child.stderr?.on('data', (d) => (stderr += d));
    child.on('error', () => resolve({ code: -1, stdout, stderr }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

export async function isFfmpegAvailable(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  const [ff, probe] = await Promise.all([run('ffmpeg', ['-version']), run('ffprobe', ['-version'])]);
  ffmpegAvailable = ff.code === 0 && probe.code === 0;
  return ffmpegAvailable;
}

function headerArg(headers: Record<string, string>): string {
  return (
    Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n') + '\r\n'
  );
}

interface ProbeResult {
  video?: string;
  audio?: string;
}

async function probeCodecs(url: string, headers: Record<string, string>): Promise<ProbeResult | null> {
  const { code, stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_streams',
    '-headers',
    headerArg(headers),
    url,
  ]);
  if (code !== 0) return null;
  try {
    const parsed = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string; codec_name?: string }> };
    const streams = parsed.streams ?? [];
    const video = streams.find((s) => s.codec_type === 'video')?.codec_name;
    const audio = streams.find((s) => s.codec_type === 'audio')?.codec_name;
    return { video, audio };
  } catch {
    return null;
  }
}

export async function checkRemuxable(
  url: string,
  headers: Record<string, string>,
): Promise<{ remuxable: boolean; reason: string }> {
  if (!(await isFfmpegAvailable())) {
    return { remuxable: false, reason: 'ffmpeg is not available on this server.' };
  }
  const codecs = await probeCodecs(url, headers);
  if (!codecs) {
    return { remuxable: false, reason: 'Could not read this file’s codecs.' };
  }
  const videoOk = !codecs.video || REMUXABLE_VIDEO.has(codecs.video);
  const audioOk = !codecs.audio || REMUXABLE_AUDIO.has(codecs.audio);
  if (videoOk && audioOk) return { remuxable: true, reason: 'ok' };
  return {
    remuxable: false,
    reason: `Uses ${codecs.video ?? 'unknown'}/${codecs.audio ?? 'unknown'}, which browsers can't decode even after remuxing.`,
  };
}

type JobStatus = 'working' | 'ready' | 'error';
interface Job {
  status: JobStatus;
  error?: string;
}

const jobs = new Map<string, Job>();

function cachePath(fileId: string): string {
  return join(CACHE_DIR, `${fileId}.mp4`);
}

export function remuxedFilePath(fileId: string): string | null {
  const p = cachePath(fileId);
  return existsSync(p) ? p : null;
}

export function getJobStatus(fileId: string): JobStatus {
  if (remuxedFilePath(fileId)) return 'ready';
  return jobs.get(fileId)?.status ?? 'error';
}

export function getJobError(fileId: string): string | undefined {
  return jobs.get(fileId)?.error;
}

/** Fire-and-forget: starts a background remux if one isn't already
 * cached or in flight. Callers poll getJobStatus() for progress. */
export function startRemuxJob(fileId: string, url: string, headers: Record<string, string>): void {
  if (remuxedFilePath(fileId)) return;
  const existing = jobs.get(fileId);
  if (existing?.status === 'working') return;

  jobs.set(fileId, { status: 'working' });
  mkdirSync(CACHE_DIR, { recursive: true });
  const tempPath = join(CACHE_DIR, `${fileId}.${process.pid}.tmp.mp4`);

  const child = spawn(
    'ffmpeg',
    [
      '-headers',
      headerArg(headers),
      '-i',
      url,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      '-y',
      tempPath,
    ],
    { windowsHide: true },
  );

  let stderr = '';
  child.stderr?.on('data', (d) => {
    stderr += d;
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
  });

  child.on('error', (err) => {
    jobs.set(fileId, { status: 'error', error: err.message });
    rmSync(tempPath, { force: true });
  });

  child.on('close', (code) => {
    if (code === 0 && existsSync(tempPath)) {
      try {
        renameSync(tempPath, cachePath(fileId));
        jobs.set(fileId, { status: 'ready' });
      } catch (err) {
        jobs.set(fileId, { status: 'error', error: err instanceof Error ? err.message : 'rename failed' });
      }
    } else {
      jobs.set(fileId, { status: 'error', error: stderr.slice(-500) || `ffmpeg exited ${code}` });
      rmSync(tempPath, { force: true });
    }
  });
}

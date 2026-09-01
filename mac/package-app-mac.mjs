#!/usr/bin/env node
// Builds GoFlix.app — a standalone macOS app (Node single-executable app
// wrapped in a proper .app bundle) — into mac/release-mac/.
//
// Fully separate from scripts/package-exe.mjs (the Windows build): nothing
// in here touches that script or its output, and nothing in that script
// touches this one. Run this ON macOS — Node's SEA feature injects into
// the actual platform's node binary, so it can't be cross-built from
// Windows or Linux.
//
// NOTE: written and reasoned through carefully against Node's documented
// SEA + postject support for macOS, but never actually run on real macOS
// hardware (none was available while writing it). Treat the first run as
// a test, not a known-good build — if something in Node/postject's macOS
// path doesn't match what's assumed here, expect to debug it on the day.
import { execSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  console.error(
    `This script builds a macOS app and must run on macOS (current platform: ${process.platform}). ` +
      'The Windows build is scripts/package-exe.mjs — this file is intentionally separate from it.',
  );
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..'); // project root — same source as the Windows build
const buildDir = join(here, 'build-mac');
const releaseDir = join(here, 'release-mac');
const appDir = join(releaseDir, 'GoFlix.app');
const contentsDir = join(appDir, 'Contents');
const macosDir = join(contentsDir, 'MacOS');
const exePath = join(macosDir, 'GoFlix');
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function run(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root });
}

console.log('[1/6] Building frontend (vite build)...');
run('npx vite build');

console.log('[2/6] Bundling server into a single CJS file (esbuild)...');
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });
run(
  `npx esbuild server/index.ts --bundle --platform=node --format=cjs ` +
    `--target=node22 --outfile="${join(buildDir, 'server.cjs')}"`,
);

console.log('[3/6] Generating SEA blob...');
writeFileSync(
  join(buildDir, 'sea-config.json'),
  JSON.stringify(
    {
      main: join(buildDir, 'server.cjs'),
      output: join(buildDir, 'sea-prep.blob'),
      disableExperimentalSEAWarning: true,
    },
    null,
    2,
  ),
);
run(`node --experimental-sea-config "${join(buildDir, 'sea-config.json')}"`);

console.log('[4/6] Assembling the .app bundle...');
rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(macosDir, { recursive: true });
copyFileSync(process.execPath, exePath);
chmodSync(exePath, 0o755);

// postject/Node's SEA injection can't handle a universal ("fat") binary —
// it finds the fuse sentinel once per architecture slice and aborts with
// "Multiple occurences of sentinel ... found in the binary". macOS's
// official Node.js installer (and Homebrew) ship node as a universal
// binary covering both Intel and Apple Silicon, so this hits by default
// on a real Mac. Thin it down to just the current machine's architecture
// first — harmless no-op if it's already single-arch.
{
  const archs = execSync(`lipo -archs "${exePath}"`, { cwd: root }).toString().trim().split(/\s+/);
  if (archs.length > 1) {
    const targetArch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
    console.log(
      `  Universal binary detected (${archs.join(', ')}) — thinning to ${targetArch} ` +
        '(postject/SEA only supports a single architecture)...',
    );
    run(`lipo -thin ${targetArch} -output "${exePath}" "${exePath}"`);
    chmodSync(exePath, 0o755);
  }
}

// A .app bundle launched by double-click (Finder → LaunchServices) never
// attaches a Terminal, regardless of whether the binary is a "console"
// program — unlike Windows there's no PE-subsystem-style flag to patch.
// The bundle wrapper itself is what gets you the silent launch.
writeFileSync(
  join(contentsDir, 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>GoFlix</string>
  <key>CFBundleDisplayName</key>
  <string>GoFlix</string>
  <key>CFBundleIdentifier</key>
  <string>com.goflix.app</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>GoFlix</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`,
);

console.log('[5/6] Injecting app blob into the executable (postject)...');
run(
  `npx postject "${exePath}" NODE_SEA_BLOB "${join(buildDir, 'sea-prep.blob')}" ` +
    `--sentinel-fuse ${SEA_FUSE} --macho-segment-name NODE_SEA`,
);

// Unsigned macOS binaries get Gatekeeper's "unidentified developer" warning
// on first launch (right-click → Open bypasses it once) — the real fix is
// a paid Apple Developer ID + `codesign`/notarization, out of scope for a
// personal build. Ad-hoc signing at least keeps the binary from being
// flagged as *modified* after this script edits it with postject.
try {
  run(`codesign --force --deep --sign - "${appDir}"`);
} catch {
  console.warn(
    '  (codesign failed or unavailable — app will still run, but macOS may warn more ' +
      'insistently about an unidentified developer on first launch.)',
  );
}

console.log('[6/6] Copying static assets + writing the Stop helper...');
cpSync(join(root, 'dist'), join(macosDir, 'dist'), { recursive: true });
if (existsSync(join(root, '.env.example'))) {
  copyFileSync(join(root, '.env.example'), join(releaseDir, '.env.example'));
}

// Double-clickable in Finder. Terminal briefly opens for this one (unlike
// the app itself) since .command files always run in Terminal — that's
// normal/expected for this kind of helper script on macOS.
const stopCommand = `#!/bin/bash
# GoFlix — stop the server (kills whatever is listening on port 3001).
# Prefer the in-app "Stop" button when you can reach the UI.
PID=$(lsof -ti tcp:3001)
if [ -n "$PID" ]; then
  kill -9 $PID
  echo "GoFlix stopped."
else
  echo "GoFlix was not running."
fi
read -p "Press Enter to close..."
`;
writeFileSync(join(releaseDir, 'Stop GoFlix.command'), stopCommand);
chmodSync(join(releaseDir, 'Stop GoFlix.command'), 0o755);

console.log(`\nDone. → ${appDir}`);
console.log('Copy the whole "release-mac" folder to any Mac. Double-click GoFlix.app to launch');
console.log('(first launch: right-click → Open, to get past the unidentified-developer warning —');
console.log('only needed once). It opens your browser automatically, same as the Windows build.');
console.log('Use the in-app "⏻ Stop" button, or "Stop GoFlix.command", to shut it down.');
console.log('Optional: drop a .env with GOFILE_TOKEN=... next to GoFlix.app for a saved account token.');

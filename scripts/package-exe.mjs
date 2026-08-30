#!/usr/bin/env node
// Builds a standalone GoFlix.exe (Node single-executable app) + a release/
// folder you can copy to any Windows machine — no Node.js install required.
import { execSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const buildDir = join(root, 'build');
const releaseDir = join(root, 'release');
const exeName = process.platform === 'win32' ? 'GoFlix.exe' : 'GoFlix';
const exePath = join(releaseDir, exeName);
// Fixed sentinel Node expects to find in the binary before injecting the blob.
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function run(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root });
}

// A packaged SEA binary is a straight copy of node.exe, which Windows
// always links as a "console" subsystem app — that's the visible cmd box
// on double-click. Node itself never touches stdio unless something needs
// it (we don't), so flipping the PE header's Subsystem field to "Windows
// GUI" (2) removes the console entirely with zero runtime cost — no
// wrapper process, no launcher script required to get a silent launch.
// This only touches that one word in the Optional Header; postject's
// injected SEA blob lives in a separate section and is unaffected.
function patchSubsystemToWindowsGui(exePath) {
  const IMAGE_SUBSYSTEM_WINDOWS_GUI = 2;
  const IMAGE_SUBSYSTEM_WINDOWS_CUI = 3;
  const PE32_PLUS_MAGIC = 0x20b;

  const buf = readFileSync(exePath);
  if (buf.readUInt16LE(0) !== 0x5a4d) {
    throw new Error('patchSubsystemToWindowsGui: missing "MZ" DOS header — not a PE file?');
  }
  const peOffset = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(peOffset) !== 0x00004550) {
    throw new Error('patchSubsystemToWindowsGui: missing "PE\\0\\0" signature at e_lfanew.');
  }
  const optHeaderOffset = peOffset + 4 + 20; // PE signature + COFF file header
  const magic = buf.readUInt16LE(optHeaderOffset);
  if (magic !== PE32_PLUS_MAGIC) {
    throw new Error(
      `patchSubsystemToWindowsGui: expected PE32+ (0x20b), got 0x${magic.toString(16)} — ` +
        'offset table differs for 32-bit PE and this script only knows the 64-bit layout.',
    );
  }
  const subsystemOffset = optHeaderOffset + 68;
  const current = buf.readUInt16LE(subsystemOffset);
  if (current !== IMAGE_SUBSYSTEM_WINDOWS_CUI) {
    console.warn(
      `  (unexpected existing subsystem value ${current}, expected ${IMAGE_SUBSYSTEM_WINDOWS_CUI} — patching anyway)`,
    );
  }
  buf.writeUInt16LE(IMAGE_SUBSYSTEM_WINDOWS_GUI, subsystemOffset);
  writeFileSync(exePath, buf);
  console.log('  Patched Subsystem: CONSOLE → WINDOWS_GUI (no cmd box on launch).');
}

console.log('[1/7] Building frontend (vite build)...');
run('npx vite build');

console.log('[2/7] Bundling server into a single CJS file (esbuild)...');
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });
run(
  'npx esbuild server/index.ts --bundle --platform=node --format=cjs ' +
    '--target=node22 --outfile=build/server.cjs',
);

console.log('[3/7] Generating SEA blob...');
writeFileSync(
  join(buildDir, 'sea-config.json'),
  JSON.stringify(
    {
      main: 'build/server.cjs',
      output: 'build/sea-prep.blob',
      disableExperimentalSEAWarning: true,
    },
    null,
    2,
  ),
);
run('node --experimental-sea-config build/sea-config.json');

console.log('[4/7] Assembling release folder...');
rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });
copyFileSync(process.execPath, exePath);

if (process.platform === 'win32') {
  try {
    run(`signtool remove /s "${exePath}"`);
  } catch {
    console.warn(
      '  (signtool not available — skipping signature removal; the exe will run but ' +
        'may show an "unknown publisher" warning on first launch, which is expected for ' +
        'an unsigned personal build.)',
    );
  }
}

console.log('[5/8] Injecting app blob into the executable (postject)...');
const postjectExtra =
  process.platform === 'darwin'
    ? ' --macho-segment-name NODE_SEA'
    : process.platform === 'win32'
      ? ''
      : '';
run(
  `npx postject "${exePath}" NODE_SEA_BLOB "${join(buildDir, 'sea-prep.blob')}" ` +
    `--sentinel-fuse ${SEA_FUSE}${postjectExtra}`,
);

console.log('[6/8] Hiding the console window (patching PE subsystem)...');
if (process.platform === 'win32') {
  patchSubsystemToWindowsGui(exePath);
}

console.log('[7/8] Copying static assets next to the executable...');
cpSync(join(root, 'dist'), join(releaseDir, 'dist'), { recursive: true });
if (existsSync(join(root, '.env.example'))) {
  copyFileSync(join(root, '.env.example'), join(releaseDir, '.env.example'));
}

console.log('[8/8] Writing hidden-window launcher scripts (Windows)...');
if (process.platform === 'win32') {
  // The plain exe always shows a console window (Node console-subsystem
  // default) — these launchers hide it, the same trick the dev
  // Start/Stop GoFlix.vbs scripts already use. They discover the exe by
  // extension rather than a hardcoded name, since a personalized copy gets
  // renamed (e.g. GoFlix-Admin.exe).
  const startVbs = `' GoFlix — double-click to start with no visible console window.
Option Explicit
Dim shell, fso, scriptDir, exePath, f, folder, isRunning, probe

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

exePath = ""
Set folder = fso.GetFolder(scriptDir)
For Each f In folder.Files
  If LCase(fso.GetExtensionName(f.Name)) = "exe" Then
    exePath = f.Path
    Exit For
  End If
Next

If exePath = "" Then
  MsgBox "Could not find a GoFlix .exe next to this script.", vbCritical, "GoFlix"
  WScript.Quit 1
End If

' Skip starting a second copy if the server's already up.
Set probe = shell.Exec("cmd /c netstat -ano | findstr /R /C:"":3001 .*LISTENING""")
Do While probe.Status = 0
  WScript.Sleep 50
Loop
isRunning = (Len(Trim(probe.StdOut.ReadAll())) > 0)

If isRunning Then
  shell.Run "http://localhost:3001/", 1, False
Else
  shell.CurrentDirectory = scriptDir
  shell.Run """" & exePath & """", 0, False
End If
`;

  const stopVbs = `' GoFlix — double-click to stop (kills whatever is listening on port 3001).
' Prefer the in-app "Stop" button when you can reach the UI — this is the
' fallback for when the window is hidden and you can't get to it.
Option Explicit
Dim shell, probe, out, lines, i, line, parts, pid, killed

Set shell = CreateObject("WScript.Shell")
killed = 0

Set probe = shell.Exec("cmd /c netstat -ano | findstr /R /C:"":3001 .*LISTENING""")
Do While probe.Status = 0
  WScript.Sleep 50
Loop
out = probe.StdOut.ReadAll()

If Len(Trim(out)) > 0 Then
  lines = Split(out, vbCrLf)
  For i = 0 To UBound(lines)
    line = Trim(lines(i))
    If Len(line) > 0 Then
      Do While InStr(line, "  ") > 0
        line = Replace(line, "  ", " ")
      Loop
      parts = Split(line, " ")
      pid = parts(UBound(parts))
      If IsNumeric(pid) Then
        shell.Run "taskkill /F /PID " & pid, 0, True
        killed = killed + 1
      End If
    End If
  Next
End If

If killed > 0 Then
  MsgBox "GoFlix stopped.", vbInformation, "GoFlix"
Else
  MsgBox "GoFlix was not running.", vbInformation, "GoFlix"
End If
`;

  writeFileSync(join(releaseDir, 'Start GoFlix (hidden).vbs'), startVbs);
  writeFileSync(join(releaseDir, 'Stop GoFlix.vbs'), stopVbs);
}

console.log(`\nDone. → ${exePath}`);
console.log('Copy the whole "release" folder (exe + dist/) to any Windows machine.');
console.log(`Double-click ${exeName} to launch — no console window, it just opens your`);
console.log('browser straight to the app. "Start GoFlix (hidden).vbs" does the same but');
console.log('also skips launching a second copy if one is already running. Use the');
console.log('in-app "⏻ Stop" button, or "Stop GoFlix.vbs", to shut it down.');
console.log('Optional: drop a .env with GOFILE_TOKEN=... next to the exe for a saved account token.');

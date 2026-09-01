#!/usr/bin/env node
// Bundles the real GoFlix server + frontend into app/src/main/assets/ —
// same source, same esbuild step as the Windows/Mac builds, just a
// different destination. Run this before building the APK (gradlew
// picks these assets up automatically once they're in place).
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const assetsDir = join(here, 'app', 'src', 'main', 'assets', 'nodejs-project');

function run(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: root });
}

console.log('[1/3] Building frontend (vite build)...');
run('npx vite build');

console.log('[2/3] Bundling server into a single CJS file (esbuild)...');
rmSync(assetsDir, { recursive: true, force: true });
mkdirSync(assetsDir, { recursive: true });
run(
  `npx esbuild server/index.ts --bundle --platform=node --format=cjs ` +
    `--target=node18 --outfile="${join(assetsDir, 'server.cjs')}"`,
);

console.log('[2b/3] Patching a nodejs-mobile ICU limitation in the bundled server...');
// path-to-regexp (Express 5's router) validates route-param names with a
// regex using \p{ID_Start}/\p{ID_Continue} Unicode property escapes. Those
// need full ICU data, which nodejs-mobile's Android build doesn't ship
// (it crashes at startup with "Invalid property name in character class"
// — this is what "opens then closes immediately" was). GoFlix's own
// routes only ever use plain ASCII param names (:id, :fileId), so an
// ASCII approximation is functionally identical for us. This only
// touches this Android build's copy of the bundle — the actual
// node_modules/path-to-regexp used by the Windows/Mac builds (running on
// full desktop Node, which has full ICU) is untouched.
{
  const serverPath = join(assetsDir, 'server.cjs');
  let code = readFileSync(serverPath, 'utf8');
  const before = code;
  code = code.replaceAll('\\p{ID_Start}', 'a-zA-Z');
  code = code.replaceAll('\\p{ID_Continue}', 'a-zA-Z0-9');
  code = code.replaceAll(/\/\^\[\$_a-zA-Z\]\$\/u/g, '/^[$_a-zA-Z]$/');
  code = code.replaceAll(/\/\^\[\$\\u200c\\u200da-zA-Z0-9\]\$\/u/g, '/^[$\\u200c\\u200da-zA-Z0-9]$/');
  code = code.replaceAll(
    /\/\^\[\$_a-zA-Z\]\[\$\\u200c\\u200da-zA-Z0-9\]\*\$\/u/g,
    '/^[$_a-zA-Z][$\\u200c\\u200da-zA-Z0-9]*$/',
  );
  if (code === before) {
    console.warn(
      '  (no \\p{ID_Start}/\\p{ID_Continue} found to patch — path-to-regexp may have changed; ' +
        'verify the Android build still starts.)',
    );
  } else {
    writeFileSync(serverPath, code);
    console.log('  Patched.');
  }
}

console.log('[2b-2/3] Patching resolveHereDir() for embedded (non-executable) Node...');
// resolveHereDir() falls back to dirname(process.execPath) when
// import.meta.url is stripped by CJS bundling (true on every platform).
// On Windows/Mac that's correct — process.execPath IS the packaged exe,
// sitting right next to dist/. On Android, Node is embedded via JNI
// (node::Start() inside the app's own process), so process.execPath does
// NOT point at nodejs-project/ — it pointed at nothing usable, which is
// why dist/ was never found and Express served nothing but 404s. Android's
// MainActivity.kt passes server.cjs's real absolute path as argv[1] to
// node::Start(), so process.argv[1] is the reliable source of truth here.
{
  const serverPath = join(assetsDir, 'server.cjs');
  const code = readFileSync(serverPath, 'utf8');
  const before = code;
  const patched = code.replace(
    /return \(0, (import_node_path\d*)\.dirname\)\(process\.execPath\);/,
    'return (0, $1.dirname)(process.argv[1] || process.execPath);',
  );
  if (patched === before) {
    throw new Error(
      'Could not find the resolveHereDir() execPath fallback to patch — esbuild output shape may have changed.',
    );
  }
  writeFileSync(serverPath, patched);
  console.log('  Patched.');
}

console.log('[2b-3/3] Surfacing fetch() cause detail for on-device diagnosis...');
// Node's fetch() (undici) collapses every network failure into the generic
// message "fetch failed" — the actually useful detail (DNS failure, TLS
// failure, connection refused, etc.) lives in err.cause, which
// gofileClient's catch block discards before logging. On desktop this
// rarely matters since the terminal/DevTools shows the real cause anyway;
// on Android nothing does, so this is the only way to see it.
{
  const serverPath = join(assetsDir, 'server.cjs');
  const code = readFileSync(serverPath, 'utf8');
  const before = code;
  const patched = code.replace(
    'console.error("[gofile] network error", msg);',
    'console.error("[gofile] network error", msg, err && err.cause ? String(err.cause) : "");',
  );
  if (patched === before) {
    throw new Error('Could not find the [gofile] network error log line to patch.');
  }
  writeFileSync(serverPath, patched);
  console.log('  Patched.');
}

console.log('[2c/3] Adding a boot-error log so real device crashes are diagnosable...');
// nodejs-mobile doesn't pipe Node's stdout/stderr to logcat, so a failure
// here previously just looked like "app opens and closes, nothing happens"
// with zero information. This writes any startup exception to a file next
// to server.cjs (readable via `adb shell run-as com.goflix.app cat
// files/nodejs-project/boot-error.log`) instead of dying silently.
{
  const serverPath = join(assetsDir, 'server.cjs');
  const code = readFileSync(serverPath, 'utf8');
  const bootstrap = `
const __bootLogPath = __dirname + '/boot-error.log';
function __writeBootLog(label, err) {
  try {
    require('fs').appendFileSync(
      __bootLogPath,
      '[' + new Date().toISOString() + '] ' + label + ': ' + (err && err.stack ? err.stack : String(err)) + '\\n',
    );
  } catch (e) {}
}
process.on('uncaughtException', (err) => __writeBootLog('uncaughtException', err));
process.on('unhandledRejection', (err) => __writeBootLog('unhandledRejection', err));
// Every outbound Gofile request was hanging with ConnectTimeoutError — a
// raw TCP connect timeout, not a DNS or TLS failure. Classic symptom of a
// network whose IPv6 is advertised but doesn't actually route: normal
// Android apps race IPv4/IPv6 (Happy Eyeballs) via the OS's own networking
// stack, but Node's embedded resolver doesn't, so it can pick the dead
// IPv6 address and just hang until timeout. Forcing IPv4-first sidesteps it.
try {
  require('dns').setDefaultResultOrder('ipv4first');
} catch (e) {}
// nodejs-mobile doesn't pipe stdout/stderr to logcat, so console.error calls
// (like gofileClient's own network-error logging) were invisible on-device.
// Mirror them into the same file instead of guessing at causes blind.
for (const level of ['log', 'warn', 'error']) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    orig(...args);
    __writeBootLog('console.' + level, args.map((a) => (a && a.stack) || String(a)).join(' '));
  };
}
`;
  writeFileSync(serverPath, bootstrap + code);
  console.log('  Added.');
}

console.log('[3/3] Copying built frontend into assets...');
cpSync(join(root, 'dist'), join(assetsDir, 'dist'), { recursive: true });
if (existsSync(join(root, '.env.example'))) {
  // Not loaded on Android (no filesystem .env to drop next to an APK) —
  // kept only so the assets folder is self-documenting about what
  // GOFILE_TOKEN etc. would do if this were ever wired up to a settings
  // screen instead.
}

console.log('\nDone. Assets are in app/src/main/assets/nodejs-project/');
console.log('Now run the Gradle build (see README.md) to produce the APK.');

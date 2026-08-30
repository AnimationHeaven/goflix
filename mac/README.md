# GoFlix — macOS build

Separate from the Windows build (`scripts/package-exe.mjs` at the project
root) — nothing in here touches that script, and nothing there touches
this. Same app source either way; only the packaging differs.

## Why this has to run on an actual Mac

Node's single-executable (SEA) feature injects your app into a real copy of
the `node` binary for whatever platform you're building on. There's no
cross-compiling it from Windows or Linux — the macOS build has to run
where a real macOS `node` binary exists: on a Mac, or a macOS CI runner
(e.g. a GitHub Actions `macos-latest` job).

**Untested against real hardware.** This was written and reasoned through
against Node's documented SEA + postject support for macOS, but there was
no Mac available to actually run it while building it. Treat the first
run as a test, not a known-good build.

## Building it

On a Mac, with Node.js installed:

```bash
cd mac
npm install --prefix .. # if you haven't already, from the project root
node package-app-mac.mjs
```

Output lands in `mac/release-mac/GoFlix.app` (+ a `Stop GoFlix.command`
helper). Copy the whole `release-mac` folder to any Mac.

## First launch

The app is unsigned (no paid Apple Developer ID), so Gatekeeper will
refuse a normal double-click the first time with an "unidentified
developer" warning. Right-click `GoFlix.app` → **Open** → **Open** once —
after that, it opens normally like any other app.

## Account token (admin build)

Drop a `.env` file next to `GoFlix.app` (inside `release-mac/`, same level
as the `.app`) with:

```
GOFILE_TOKEN=your_token_here
GOFILE_WT_SALT=9844d94d963d30
```

Same as the Windows admin build — the app with no `.env` is the guest
build, the app with one is the admin build. Identical codebase either way.

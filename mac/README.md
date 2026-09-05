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

**Verified working** on real Apple Silicon hardware. One real issue turned
up and is already handled: macOS ships `node` as a universal (fat) binary,
and postject's SEA injection can't handle that — it finds the injection
marker once per architecture slice and aborts with "Multiple occurences of
sentinel ... found in the binary". The script thins the binary to the
current machine's architecture first to work around it.

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
refuse a normal double-click the first time. Which warning you get depends
on how you got the file:

- **Built it yourself** (ran `node package-app-mac.mjs` locally) — you'll
  get the milder "unidentified developer" warning. Right-click
  `GoFlix.app` → **Open** → **Open** once, and it opens normally from then
  on.
- **Downloaded the zip through a browser** (e.g. from a GitHub Release) —
  the browser tags it with a quarantine flag, and Gatekeeper instead
  refuses with **"GoFlix is damaged and can't be opened."** This is not
  actual corruption and right-click → Open won't fix it — the quarantine
  flag needs to be stripped first:
  ```bash
  xattr -cr /path/to/GoFlix.app
  ```
  (type `xattr -cr ` in Terminal, then drag `GoFlix.app` into the window
  to fill in the path). After that it opens normally.

## Account token (admin build)

Drop a `.env` file next to `GoFlix.app` (inside `release-mac/`, same level
as the `.app`) with:

```
GOFILE_TOKEN=your_token_here
GOFILE_WT_SALT=9844d94d963d30
```

Same as the Windows admin build — the app with no `.env` is the guest
build, the app with one is the admin build. Identical codebase either way.

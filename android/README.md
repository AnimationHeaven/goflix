# GoFlix — Android build

Separate from the Windows (`scripts/package-exe.mjs`) and macOS (`mac/`)
builds — nothing in here touches those, and nothing there touches this.
Same app source either way; only the packaging differs. Unlike a WebView
that just points at a remote server, this embeds a real Node.js runtime on
the device itself via [nodejs-mobile](https://github.com/JaneaSystems/nodejs-mobile),
so the whole app runs standalone on the phone — no PC required.

## One-time setup: nodejs-mobile

`android/app/libnode/` (the prebuilt Node runtime + headers for Android)
isn't committed — it's ~127MB of third-party binaries, not something that
belongs in git history. Download it once:

1. Grab `nodejs-mobile-v18.20.4-android.zip` from
   [nodejs-mobile's releases page](https://github.com/JaneaSystems/nodejs-mobile/releases)
   (must match the version above — a different version won't line up with
   the JNI bridge in `app/src/main/cpp/native-lib.cpp`).
2. Extract it so you end up with:
   - `android/app/libnode/include/node/` (headers)
   - `android/app/libnode/bin/arm64-v8a/libnode.so`
   - `android/app/libnode/bin/armeabi-v7a/libnode.so`

## Toolchain

JDK 17, Android SDK (`platforms;android-34`, `build-tools;34.0.0`),
NDK `26.1.10909125`, CMake `3.22.1`, Gradle 8.4. `local.properties`
(machine-specific SDK path, also gitignored) needs:

```
sdk.dir=/path/to/your/Android/Sdk
```

## Building it

```bash
cd android
node package-assets.mjs   # builds the frontend + bundles the server into app/src/main/assets/
./gradlew assembleDebug   # or gradle.bat on Windows if gradlew isn't set up
```

Output APK lands at `app/build/outputs/apk/debug/app-debug.apk`. Install
with `adb install -r` or copy it to the phone directly.

## Why some patches live in `package-assets.mjs` instead of the shared source

A few small, Android-only issues get patched into the bundled server
output after esbuild, rather than changed in `server/index.ts` itself —
each is commented in `package-assets.mjs` at the point it's applied:

- **ICU/regex**: nodejs-mobile's Android build lacks full ICU data, so
  Express 5's router (`path-to-regexp`) throws on its
  `\p{ID_Start}`/`\p{ID_Continue}` Unicode-property regexes at startup.
  Patched to ASCII-only equivalents — fine here since GoFlix's own routes
  only ever use plain ASCII param names.
- **`resolveHereDir()`**: falls back to `dirname(process.execPath)` when
  bundled to CJS. That's correct for the Windows/Mac SEA builds
  (`process.execPath` really is the packaged exe), but Node here is
  embedded via JNI rather than run as its own process, so it's patched to
  prefer `process.argv[1]` (the real on-device path to `server.cjs`,
  passed in by `MainActivity.kt`).
- **IPv4-first DNS**: some networks advertise IPv6 that doesn't actually
  route; Node's resolver doesn't race IPv4/IPv6 the way Android's own
  networking stack does, so it can pick the dead address and hang until
  timeout. `dns.setDefaultResultOrder('ipv4first')` sidesteps it.
- **Boot-error log**: nodejs-mobile doesn't pipe Node's stdout/stderr to
  logcat, so a startup failure otherwise looks like "app opens and closes,
  nothing happens" with zero information. Uncaught exceptions and
  `console.*` calls get mirrored to
  `files/nodejs-project/boot-error.log` (readable via
  `adb shell run-as com.goflix.app cat files/nodejs-project/boot-error.log`)
  instead of vanishing.

None of these touch the Windows/Mac builds or `node_modules` — they only
rewrite this build's own copy of the bundled output.

## Account token (admin build)

Android doesn't read a `.env` file next to an APK the way the desktop
builds do (there's no "next to the exe" — assets live inside the APK
package). For now, enter your account token in-app via **Token** /
**Account settings** instead; it's saved in the WebView's local storage
and persists across launches.

# AGENTS.md — Android (Areton)

## Architecture

This is the **Android native shell** for a React Native + Expo managed app (`id.areton.app`). It lives inside a monorepo at `apps/mobile/android/`. The JS bundle, navigation, and UI logic live outside this directory — this folder only contains Android-specific build config, native entry points, and resources.

- **Expo autolinking** handles native module registration — do NOT manually add packages to `MainApplication.kt` unless a library explicitly requires it. Check `build/generated/autolinking/autolinking.json` for currently linked modules.
- **Hermes** is the JS engine (`hermesEnabled=true`). JSC is a fallback but not active.
- **New Architecture** (Fabric/TurboModules) is **disabled** (`newArchEnabled=false`).

## Key Files

| File | Purpose |
|---|---|
| `app/build.gradle` | App-level config — namespace `id.areton.app`, SDK versions, Expo/RN plugin setup |
| `build.gradle` | Root — custom `getNodeBinary` resolution, repo configuration |
| `settings.gradle` | Plugin management, Expo autolinking wiring |
| `gradle.properties` | Feature flags: Hermes, New Arch, image format support, architecture list |
| `app/src/main/AndroidManifest.xml` | Permissions, deep link scheme (`areton://`), FCM notification config |
| `app/src/main/java/id/areton/app/` | `MainActivity.kt` and `MainApplication.kt` — thin wrappers, rarely need editing |

## Build & Run

```sh
# From this directory (android/):
./gradlew assembleDebug          # Debug APK
./gradlew assembleRelease        # Release APK (uses debug keystore — NOT production-ready)
./gradlew clean                  # Full clean

# Typically invoked from monorepo root via Expo CLI instead:
# npx expo run:android
```

- Gradle 8.13 (`gradle/wrapper/gradle-wrapper.properties`).
- Node binary is resolved dynamically in build scripts (checks `NODE_BINARY` env var, then `/usr/local/bin/node`, `/opt/homebrew/bin/node`, `/usr/bin/node`). Set `NODE_BINARY` if builds can't find node.

### Running debug on device/emulator

Debug builds do **not** bundle JS — they require Metro bundler running on the host:

```sh
# 1. From apps/mobile/ — start Metro
npx expo start --port 8081 --offline

# 2. If using a physical device over USB, forward the port:
adb reverse tcp:8081 tcp:8081

# 3. Launch the app (or just tap the icon)
adb shell am start -n id.areton.app/.MainActivity
```

Without Metro, the app will show a blank/white screen and logcat will show `Failed to connect to localhost/127.0.0.1:8081`.

## Conventions & Patterns

- **Monorepo dependency hoisting**: Some native deps resolve from `<root>/node_modules/` (e.g., `react-native-reanimated`), others from `apps/mobile/node_modules/` (e.g., `react-native-maps`, `react-native-screens`). Always check `autolinking.json` for actual resolution paths.
- **ProGuard**: Rules in `app/proguard-rules.pro` — currently keeps `react-native-reanimated` classes. Add keep rules here when introducing native libraries that use reflection.
- **Deep linking**: Scheme `areton://` is registered in `AndroidManifest.xml`. Add new intent filters there for additional link patterns.
- **Splash screen**: Managed by `expo-splash-screen`. Theme `Theme.App.SplashScreen` in `styles.xml` references `ic_launcher_background`. Background color: `#0b1120`.
- **Notifications**: Firebase Cloud Messaging is integrated. Notification icon is `@drawable/notification_icon` (provided in hdpi–xxxhdpi). Accent color is `#c9a96e` (`notification_icon_color`).
- **Dark theme**: `values-night/colors.xml` is empty — dark mode colors are not overridden at the Android resource level; theming is handled in JS.

## Gotchas

- Release builds currently use `debug.keystore` — a real signing config is needed before Play Store deployment.
- `local.properties` is machine-specific (SDK path) and must not be committed.
- The `bundleCommand` is `"export:embed"` (Expo CLI), not the default RN CLI command — don't switch to `npx react-native bundle`.
- `MainActivity.onCreate` passes `null` to `super.onCreate()` (not `savedInstanceState`) — this is intentional for expo-splash-screen compatibility.


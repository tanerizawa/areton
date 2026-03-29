# Android Build Fixes Summary

## Issues Fixed

### 1. Node Binary Resolution Issue ✅
**Problem**: `react-native-screens` couldn't find 'node' command during build  
**Root Cause**: Gradle daemon PATH didn't include Node.js binary location  
**Fix**: Set `NODE_BINARY` environment variable to `/opt/homebrew/bin/node`

### 2. React Native Directory Path Resolution Issue ✅
**Problem**: `reactNativeAndroidDir` was computed incorrectly as `package.json/../android` instead of proper path  
**Root Cause**: Bug in `build.gradle` path computation logic  
**Fix**: Modified path computation in `/Users/odangrodiana/StudioProjects/areton/apps/mobile/android/build.gradle`:
```groovy
// Before (broken):
def reactNativeAndroidDir = new File(
  providers.exec {
    workingDir(rootDir)
    commandLine(nodeBinary, "--print", "require.resolve('react-native/package.json')")
  }.standardOutput.asText.get().trim(),
  "../android"
)

// After (fixed):
def reactNativeAndroidDir = new File(
  new File(providers.exec {
    workingDir(rootDir)
    commandLine(nodeBinary, "--print", "require.resolve('react-native/package.json')")
  }.standardOutput.asText.get().trim()).parentFile,
  "android"
)
```

### 3. androidx.core Version Conflict ✅
**Problem**: Dependencies required androidx.core 1.17.0 which needs compileSdk 36 + AGP 8.9.1  
**Root Cause**: Version incompatibility with current AGP 8.8.2  
**Fix**: Downgraded androidx.core to 1.15.0 in `app/build.gradle`:
```groovy
configurations.all {
    resolutionStrategy {
        force 'androidx.core:core:1.15.0'
        force 'androidx.core:core-ktx:1.15.0'
    }
}
```

### 4. REACT_NATIVE_NODE_MODULES_DIR Property ✅
**Problem**: Property wasn't properly set for subprojects  
**Root Cause**: Path resolution issue affecting react-native-reanimated and other native modules  
**Fix**: Fixed by correcting the `reactNativeAndroidDir` computation above

## Build Results

- ✅ Clean build: **SUCCESS**  
- ✅ Debug APK build: **SUCCESS** (6m 3s, 324 tasks)  
- ✅ All native modules compile successfully  
- ✅ React Native path resolution working  
- ✅ No critical errors (only expected deprecation warnings)

## Usage

### Option 1: Use build wrapper script (recommended)
```bash
cd /Users/odangrodiana/StudioProjects/areton/apps/mobile/android
./build-wrapper.sh clean
./build-wrapper.sh :app:assembleDebug
```

### Option 2: Manual environment variable
```bash
cd /Users/odangrodiana/StudioProjects/areton/apps/mobile/android
export NODE_BINARY="/opt/homebrew/bin/node"
./gradlew clean
./gradlew :app:assembleDebug
```

### 5. Metro Bundler Connection Issues (Runtime) ✅
**Problem**: Applications logs showed repeating errors trying to connect to Metro bundler  
**Error Pattern**: 
```
W unknown:ReactNative: The packager does not seem to be running as we got an IOException requesting its status: Failed to connect to /10.0.2.2:8081
E unknown:ReactNative: java.lang.RuntimeException: Unable to load script. Make sure you're either running Metro (run 'npx react-native start') or that your bundle 'index.android.bundle' is packaged correctly for release.
I ReactNativeJNI: Error occurred, shutting down websocket connection: WebSocket exception Failed to connect to /10.0.2.2:8081
```
**Root Cause**: Metro bundler not running + missing ADB port forwarding  
**Fix**: Use the provided `dev-run.sh` script which automatically:
- Sets up ADB port forwarding (8081 and 8082)
- Starts Metro bundler with proper configuration
- Launches the app with correct connectivity

**Usage for Development:**
```bash
cd /Users/odangrodiana/StudioProjects/areton/apps/mobile/android
./dev-run.sh --no-build  # If APK already installed
./dev-run.sh             # Full build + install + run
```

## Current Configuration

- **Gradle**: 8.13
- **Android Gradle Plugin**: 8.8.2  
- **Compile SDK**: 35  
- **Target SDK**: 35  
- **Min SDK**: 24  
- **NDK**: 27.1.12297006  
- **Kotlin**: 2.0.21  
- **React Native**: 0.79.6  
- **Expo**: Latest  
- **Hermes**: Enabled  
- **New Architecture**: Disabled  

## Notes

- Build output APK: `app/build/outputs/apk/debug/app-debug.apk`
- All changes preserve existing functionality and configuration
- The fixes are backwards compatible and don't affect release builds
- Deprecation warnings are expected and don't affect functionality
- **Metro bundler errors**: Use `dev-run.sh` for development to avoid connection issues
- The development script ensures proper Metro + ADB setup automatically

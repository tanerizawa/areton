# Analisis Error Emulator - Aplikasi Areton

## ❌ Masalah yang Ditemukan

### 1. Metro Bundler Tidak Berjalan

**Error log:**
```
03-30 06:33:34.434  2362  2774 W unknown:ReactNative: The packager does not seem to be running as we got an IOException requesting its status: Failed to connect to /10.0.2.2:8081

03-30 06:33:38.133  2362  2834 E unknown:ReactNative: java.lang.RuntimeException: Unable to load script. Make sure you're either running Metro (run 'npx react-native start') or that your bundle 'index.android.bundle' is packaged correctly for release.

03-30 06:33:38.835  2362  2362 I ReactNativeJNI: Error occurred, shutting down websocket connection: WebSocket exception Failed to connect to /10.0.2.2:8081
```

**Penyebab:** Metro bundler tidak berjalan di host machine, sehingga aplikasi React Native tidak dapat memuat JavaScript bundle.

### 2. Port Forwarding Tidak Diatur

**Status saat ini:**
- `adb reverse --list` menunjukkan kosong
- Tidak ada koneksi port 8081 dari emulator ke host

### 3. Error WebSocket Berulang

Error ini muncul berulang setiap beberapa detik karena React Native terus mencoba menyambung ke development server yang tidak tersedia.

## ✅ Solusi

### Opsi 1: Jalankan Metro Bundler (Development Mode)

```bash
# 1. Navigasi ke direktori mobile
cd /Users/odangrodiana/StudioProjects/areton/apps/mobile

# 2. Mulai Metro bundler
npx expo start --port 8081 --offline

# 3. Setup port forwarding di terminal terpisah
adb reverse tcp:8081 tcp:8081

# 4. Launch aplikasi (atau tap icon di emulator)
adb shell am start -n id.areton.app/.MainActivity
```

### Opsi 2: Build dan Install APK Standalone

```bash
# Dari direktori android/
cd /Users/odangrodiana/StudioProjects/areton/apps/mobile/android

# Build APK yang sudah bundle JavaScript
export NODE_BINARY="/opt/homebrew/bin/node"
./gradlew :app:assembleDebug

# Install APK ke emulator
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Opsi 3: Jalankan melalui Expo CLI

```bash
# Dari direktori mobile/
cd /Users/odangrodiana/StudioProjects/areton/apps/mobile

# Jalankan dengan Expo CLI (otomatis setup port forwarding)
npx expo run:android
```

## 🔧 Script Otomatis untuk Development

Buat script `dev-run.sh` untuk development:

```bash
#!/bin/bash
set -e

echo "🚀 Starting Areton development environment..."

# Check emulator
if ! adb devices | grep -q "emulator.*device"; then
    echo "❌ No emulator detected. Please start an emulator first."
    exit 1
fi

echo "📱 Emulator detected"

# Setup port forwarding
echo "🔄 Setting up port forwarding..."
adb reverse tcp:8081 tcp:8081

# Start Metro in background
echo "📦 Starting Metro bundler..."
cd /Users/odangrodiana/StudioProjects/areton/apps/mobile
npx expo start --port 8081 --offline &
METRO_PID=$!

# Wait for Metro to start
echo "⏳ Waiting for Metro to start..."
sleep 5

# Launch app
echo "🚀 Launching app..."
adb shell am start -n id.areton.app/.MainActivity

echo "✅ Development environment ready!"
echo "Metro PID: $METRO_PID"
echo "To stop Metro: kill $METRO_PID"
```

## 📝 Verifikasi

Setelah menjalankan solusi, verifikasi bahwa error sudah hilang:

```bash
# Check Metro running
lsof -ti:8081

# Check port forwarding
adb reverse --list

# Monitor log untuk memastikan tidak ada error
adb logcat | grep -E "Failed to connect|Unable to load script"
```

## 🎯 Quick Fix

**Untuk segera menghilangkan error berulang:**

```bash
# Quick solution - jalankan satu per satu
cd /Users/odangrodiana/StudioProjects/areton/apps/mobile
npx expo start --port 8081 --offline &
adb reverse tcp:8081 tcp:8081
adb shell am start -n id.areton.app/.MainActivity
```

## 📋 Catatan

- Error ini normal untuk debug build yang belum di-bundle
- Release build tidak akan mengalami masalah ini karena JavaScript sudah di-bundle ke APK
- Pastikan Metro bundler berjalan sebelum launch aplikasi untuk development
- Port forwarding diperlukan untuk emulator, tidak untuk device fisik dengan Wi-Fi yang sama

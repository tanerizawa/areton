#!/usr/bin/env zsh
# ============================================
# dev-run.sh — Foolproof debug run for Areton
# ============================================
# Ensures Metro + ADB reverse + build + install
# all happen in the correct order, every time.
#
# Usage:
#   ./dev-run.sh              # Build & run debug on USB device
#   ./dev-run.sh --clean      # Clean build first
#   ./dev-run.sh --no-build   # Skip build, just reconnect Metro & launch
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ANDROID_DIR="$SCRIPT_DIR"
MOBILE_DIR="$(dirname "$ANDROID_DIR")"
METRO_PORT=${METRO_PORT:-8081}
PACKAGE_NAME="id.areton.app"

# ── Colors ───────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()   { echo "${GREEN}[✓]${NC} $1" }
warn()  { echo "${YELLOW}[!]${NC} $1" }
err()   { echo "${RED}[✗]${NC} $1" >&2 }
info()  { echo "${BLUE}[→]${NC} $1" }

# ── Parse flags ──────────────────────────────
DO_CLEAN=false
SKIP_BUILD=false
for arg in "$@"; do
    case "$arg" in
        --clean)    DO_CLEAN=true ;;
        --no-build) SKIP_BUILD=true ;;
        --help|-h)
            echo "Usage: $0 [--clean] [--no-build]"
            echo "  --clean     Full Gradle clean before building"
            echo "  --no-build  Skip build, just reconnect + launch"
            exit 0
            ;;
    esac
done

# ── 1. Check ADB & device ───────────────────
info "Checking ADB connection..."
if ! command -v adb &>/dev/null; then
    err "adb not found. Make sure Android SDK platform-tools is in PATH."
    exit 1
fi

DEVICE_COUNT=$(adb devices 2>/dev/null | grep -cw "device$" || true)
if [ "$DEVICE_COUNT" -eq 0 ]; then
    err "No device connected via ADB."
    err "  1. Enable USB debugging on your Xiaomi: Settings → Additional Settings → Developer Options"
    err "  2. On MIUI: also enable 'Install via USB' and 'USB debugging (Security settings)'"
    err "  3. Connect USB cable and accept the prompt on the phone"
    exit 1
fi

DEVICE_ID=$(adb devices | grep -w "device$" | head -1 | awk '{print $1}')
log "Device connected: $DEVICE_ID"

# ── 2. ADB reverse (the #1 cause of "Unable to load script") ─────
info "Setting up adb reverse for port $METRO_PORT..."
adb reverse tcp:$METRO_PORT tcp:$METRO_PORT 2>/dev/null || {
    warn "adb reverse failed — trying with specific device..."
    adb -s "$DEVICE_ID" reverse tcp:$METRO_PORT tcp:$METRO_PORT
}
log "adb reverse tcp:$METRO_PORT → tcp:$METRO_PORT ✓"

# Also reverse the Expo DevTools port if using dev client
adb reverse tcp:8082 tcp:8082 2>/dev/null || true

# ── 3. Check / start Metro bundler ──────────
info "Checking if Metro is running on port $METRO_PORT..."
METRO_RUNNING=false
if curl -s "http://localhost:$METRO_PORT/status" 2>/dev/null | grep -q "packager-status:running"; then
    METRO_RUNNING=true
    log "Metro bundler already running on port $METRO_PORT ✓"
else
    warn "Metro not running. Starting Metro in background..."
    cd "$MOBILE_DIR"

    # Kill any zombie Metro process
    lsof -ti:$METRO_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
    sleep 1

    # Start Metro in a new terminal tab (macOS)
    if command -v osascript &>/dev/null; then
        osascript -e "
            tell application \"Terminal\"
                do script \"cd '$MOBILE_DIR' && npx expo start --port $METRO_PORT --offline --no-dev 2>&1 | head -50\"
                activate
            end tell
        " 2>/dev/null || {
            # Fallback: start in background
            nohup npx expo start --port $METRO_PORT --offline > /tmp/areton-metro.log 2>&1 &
            warn "Metro started in background. Logs: /tmp/areton-metro.log"
        }
    else
        nohup npx expo start --port $METRO_PORT --offline > /tmp/areton-metro.log 2>&1 &
        warn "Metro started in background. Logs: /tmp/areton-metro.log"
    fi

    # Wait for Metro to be ready
    info "Waiting for Metro to start..."
    for i in {1..30}; do
        if curl -s "http://localhost:$METRO_PORT/status" 2>/dev/null | grep -q "packager-status:running"; then
            METRO_RUNNING=true
            break
        fi
        sleep 2
        printf "."
    done
    echo ""

    if [ "$METRO_RUNNING" = true ]; then
        log "Metro bundler started ✓"
    else
        err "Metro failed to start within 60 seconds."
        err "Try manually: cd $MOBILE_DIR && npx expo start --port $METRO_PORT --offline"
        exit 1
    fi
fi

# ── 4. Re-verify adb reverse after Metro is up ──
# (Sometimes ADB drops the reverse on device reconnect)
adb reverse tcp:$METRO_PORT tcp:$METRO_PORT 2>/dev/null || true
log "adb reverse re-confirmed ✓"

# ── 5. Verify Metro is reachable from device ─
info "Verifying device can reach Metro bundler..."
DEVICE_CHECK=$(adb shell "curl -s http://localhost:$METRO_PORT/status 2>/dev/null" 2>/dev/null || echo "")
if echo "$DEVICE_CHECK" | grep -q "packager-status:running"; then
    log "Device can reach Metro ✓"
else
    warn "Device curl check inconclusive (curl may not exist on device — this is usually OK)"
fi

# ── 6. Build (unless --no-build) ─────────────
if [ "$SKIP_BUILD" = false ]; then
    cd "$ANDROID_DIR"

    if [ "$DO_CLEAN" = true ]; then
        info "Running Gradle clean..."
        ./gradlew clean
        log "Clean done ✓"
    fi

    info "Building debug APK..."
    ./gradlew assembleDebug -x lint --warning-mode=none 2>&1 | tail -5

    APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
    if [ ! -f "$APK_PATH" ]; then
        err "Build failed — APK not found at $APK_PATH"
        exit 1
    fi
    log "Build successful: $APK_PATH"

    # ── 7. Install APK ──────────────────────
    info "Installing on device..."
    adb install -r -d "$APK_PATH" 2>&1 | tail -3
    log "APK installed ✓"
else
    log "Skipping build (--no-build)"
fi

# ── 8. Launch the app ───────────────────────
info "Launching $PACKAGE_NAME..."
adb shell am force-stop "$PACKAGE_NAME" 2>/dev/null || true
sleep 1
adb shell am start -n "$PACKAGE_NAME/.MainActivity" 2>/dev/null
log "App launched ✓"

# ── 9. Show logcat for connection issues ─────
echo ""
echo "${GREEN}════════════════════════════════════════════${NC}"
echo "${GREEN}  Areton running on device $DEVICE_ID${NC}"
echo "${GREEN}  Metro: http://localhost:$METRO_PORT${NC}"
echo "${GREEN}════════════════════════════════════════════${NC}"
echo ""
info "Watching logcat for JS errors (Ctrl+C to stop)..."
adb logcat -s "ReactNativeJS:*" "ReactNative:*" "ExpoModulesCore:*" 2>/dev/null | head -50


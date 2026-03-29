#!/bin/bash
# Expo React Native Android Build Script
# This script ensures proper environment variables are set for building the Android app

# Set NODE_BINARY to the correct path for consistent builds
export NODE_BINARY="/opt/homebrew/bin/node"

# Run gradle command with proper node binary
cd "$(dirname "$0")"
./gradlew "$@"

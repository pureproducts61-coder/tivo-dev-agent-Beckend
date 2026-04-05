#!/bin/bash
# TIVO DEV AGENT — APK Build Script
# Usage: ./build-apk.sh <project-dir> <output-path> [app-name] [package-name]

set -e

PROJECT_DIR="$1"
OUTPUT_PATH="$2"
APP_NAME="${3:-TivoApp}"
PACKAGE_NAME="${4:-com.tivo.app}"

echo "🤖 TIVO Build Engine — APK Build"
echo "================================="

cd "$PROJECT_DIR"

# Check if native Android project
if [ -d "android" ] && [ -f "android/build.gradle" ]; then
  echo "📱 Native Android project detected"
  cd android
  chmod +x gradlew 2>/dev/null || true
  ./gradlew assembleRelease --no-daemon
  APK=$(find . -name "*.apk" -path "*/release/*" | head -1)
  cp "$APK" "$OUTPUT_PATH"
  echo "✅ APK built: $OUTPUT_PATH"
  exit 0
fi

# Web project → Capacitor wrapper
echo "🌐 Web project → Capacitor APK"

# Build web
if [ -f "package.json" ]; then
  npm install
  npm run build 2>/dev/null || true
fi

# Determine web output dir
WEB_DIR="dist"
[ -d "build" ] && WEB_DIR="build"
[ -d "out" ] && WEB_DIR="out"
[ -d ".next/out" ] && WEB_DIR=".next/out"

# Init Capacitor
npx @capacitor/cli init "$APP_NAME" "$PACKAGE_NAME" --web-dir "$WEB_DIR" 2>/dev/null || true
npm install @capacitor/core @capacitor/android
npx cap add android 2>/dev/null || true
npx cap sync android

# Build APK
cd android
chmod +x gradlew
./gradlew assembleRelease --no-daemon

APK=$(find . -name "*.apk" -path "*/release/*" | head -1)
if [ -z "$APK" ]; then
  APK=$(find . -name "*.apk" | head -1)
fi

cp "$APK" "$OUTPUT_PATH"
echo "✅ APK built: $OUTPUT_PATH"

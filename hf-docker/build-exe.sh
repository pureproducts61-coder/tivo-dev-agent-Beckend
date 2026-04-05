#!/bin/bash
# TIVO DEV AGENT — EXE Build Script (Electron Packager)
# Usage: ./build-exe.sh <project-dir> <output-path> [app-name]

set -e

PROJECT_DIR="$1"
OUTPUT_PATH="$2"
APP_NAME="${3:-TivoApp}"

echo "🤖 TIVO Build Engine — Windows EXE Build"
echo "=========================================="

cd "$PROJECT_DIR"

# Install deps & build web
if [ -f "package.json" ]; then
  npm install
  npm run build 2>/dev/null || true
fi

# Create Electron main if not exists
if [ ! -f "electron-main.cjs" ] && [ ! -f "main.js" ]; then
  cat > electron-main.cjs << 'ELECTRON'
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });

  // Try dist, build, or root index.html
  const tryPaths = ['dist/index.html', 'build/index.html', 'index.html'];
  for (const p of tryPaths) {
    if (require('fs').existsSync(path.join(__dirname, p))) {
      win.loadFile(path.join(__dirname, p));
      return;
    }
  }
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
ELECTRON

  # Update package.json main
  node -e "
    const pkg = require('./package.json');
    pkg.main = 'electron-main.cjs';
    require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));
  "
fi

# Package
npx @electron/packager . "$APP_NAME" \
  --platform=win32 --arch=x64 \
  --out=/tmp/exe-out --overwrite \
  --ignore='node_modules' \
  --ignore='^/src' --ignore='^/public'

# Zip output
cd /tmp/exe-out
zip -r "$OUTPUT_PATH" "${APP_NAME}-win32-x64/"

echo "✅ EXE package built: $OUTPUT_PATH"

// TIVO DEV AGENT BACKEND — HF Space Build Server
// Handles APK/EXE compilation requests from Supabase Edge Functions

const http = require("http");
const { execSync, exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = 7861; // Internal API port, nginx proxies /api/* here
const BUILDS_DIR = "/tmp/builds";
const OUTPUT_DIR = "/usr/share/nginx/html/downloads";

// Ensure directories
fs.mkdirSync(BUILDS_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

// Write project files to disk
function writeProjectFiles(buildDir, files) {
  for (const file of files) {
    const filePath = path.join(buildDir, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content || "", "utf-8");
  }
}

// === APK BUILD ===
async function buildApk(buildId, files, config) {
  const buildDir = path.join(BUILDS_DIR, buildId);
  const outputPath = path.join(OUTPUT_DIR, `${buildId}.apk`);
  
  fs.mkdirSync(buildDir, { recursive: true });
  writeProjectFiles(buildDir, files);

  // If it's a web project, wrap in Capacitor/Cordova
  const hasAndroidDir = files.some(f => f.path.includes("android/") || f.path.includes("AndroidManifest.xml"));
  
  if (!hasAndroidDir) {
    // Web project → wrap with Capacitor
    const appName = config.app_name || "TivoApp";
    const packageName = config.package_name || "com.tivo.app";
    
    // Build web first
    if (fs.existsSync(path.join(buildDir, "package.json"))) {
      execSync("npm install && npm run build", { cwd: buildDir, timeout: 120000, stdio: "pipe" });
    }

    // Init Capacitor
    execSync(`npx @capacitor/cli init "${appName}" "${packageName}" --web-dir dist`, {
      cwd: buildDir, timeout: 60000, stdio: "pipe"
    });
    execSync("npm install @capacitor/core @capacitor/android", {
      cwd: buildDir, timeout: 60000, stdio: "pipe"
    });
    execSync("npx cap add android", {
      cwd: buildDir, timeout: 120000, stdio: "pipe"
    });
    execSync("npx cap sync android", {
      cwd: buildDir, timeout: 120000, stdio: "pipe"
    });
  }

  // Gradle build
  const androidDir = path.join(buildDir, "android");
  execSync("chmod +x gradlew && ./gradlew assembleRelease --no-daemon", {
    cwd: androidDir, timeout: 300000, stdio: "pipe",
    env: { ...process.env, ANDROID_HOME: "/opt/android-sdk", JAVA_HOME: "/usr/lib/jvm/java-17-openjdk-amd64" }
  });

  // Find APK
  const apkPath = findFile(androidDir, ".apk");
  if (apkPath) {
    fs.copyFileSync(apkPath, outputPath);
    return { success: true, path: outputPath, download_url: `/downloads/${buildId}.apk` };
  }
  throw new Error("APK build completed but output file not found");
}

// === EXE BUILD (Electron) ===
async function buildExe(buildId, files, config) {
  const buildDir = path.join(BUILDS_DIR, buildId);
  const outputPath = path.join(OUTPUT_DIR, `${buildId}-win32-x64.zip`);
  
  fs.mkdirSync(buildDir, { recursive: true });
  writeProjectFiles(buildDir, files);

  const appName = config.app_name || "TivoApp";

  // Ensure package.json has main entry
  const pkgPath = path.join(buildDir, "package.json");
  let pkg = {};
  if (fs.existsSync(pkgPath)) {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  }
  
  // Create electron main file if not present
  const electronMain = path.join(buildDir, "electron-main.cjs");
  if (!fs.existsSync(electronMain)) {
    fs.writeFileSync(electronMain, `
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
`, "utf-8");
  }

  pkg.main = pkg.main || "electron-main.cjs";
  pkg.name = pkg.name || appName.toLowerCase().replace(/\s+/g, "-");
  pkg.version = pkg.version || "1.0.0";
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  // Install deps & build
  execSync("npm install", { cwd: buildDir, timeout: 120000, stdio: "pipe" });
  
  // Build web if vite/webpack exists
  if (pkg.scripts?.build) {
    execSync("npm run build", { cwd: buildDir, timeout: 120000, stdio: "pipe" });
  }

  // Package with electron-packager
  execSync(
    `npx @electron/packager "${buildDir}" "${appName}" --platform=win32 --arch=x64 --out="${BUILDS_DIR}/${buildId}-out" --overwrite --no-prune`,
    { timeout: 300000, stdio: "pipe" }
  );

  // Zip the output
  const outDir = `${BUILDS_DIR}/${buildId}-out/${appName}-win32-x64`;
  if (fs.existsSync(outDir)) {
    execSync(`cd "${BUILDS_DIR}/${buildId}-out" && zip -r "${outputPath}" "${appName}-win32-x64/"`, {
      timeout: 120000, stdio: "pipe"
    });
    return { success: true, path: outputPath, download_url: `/downloads/${buildId}-win32-x64.zip` };
  }
  throw new Error("EXE build completed but output not found");
}

// Find file by extension recursively
function findFile(dir, ext) {
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        const found = findFile(fullPath, ext);
        if (found) return found;
      } else if (item.name.endsWith(ext)) {
        return fullPath;
      }
    }
  } catch {}
  return null;
}

// Cleanup old builds (keep last 20)
function cleanupBuilds() {
  try {
    const dirs = fs.readdirSync(BUILDS_DIR)
      .map(d => ({ name: d, time: fs.statSync(path.join(BUILDS_DIR, d)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);
    for (const dir of dirs.slice(20)) {
      fs.rmSync(path.join(BUILDS_DIR, dir.name), { recursive: true, force: true });
    }
  } catch {}
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    });
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === "/api/health") {
    const checks = {
      java: false, gradle: false, android_sdk: false, node: false, electron: false
    };
    try { execSync("java -version 2>&1"); checks.java = true; } catch {}
    try { execSync("gradle --version 2>&1"); checks.gradle = true; } catch {}
    try { execSync("sdkmanager --version 2>&1"); checks.android_sdk = true; } catch {}
    try { execSync("node --version"); checks.node = true; } catch {}
    try { execSync("npx @electron/packager --version 2>&1"); checks.electron = true; } catch {}

    return sendJson(res, {
      status: "online",
      service: "TIVO DEV AGENT — HF Build Engine",
      capabilities: { apk_build: checks.java && checks.android_sdk, exe_build: checks.electron },
      tools: checks,
    });
  }

  // Build APK
  if (url.pathname === "/api/build-apk" && req.method === "POST") {
    const body = await readBody(req);
    const buildId = `apk-${crypto.randomBytes(8).toString("hex")}`;
    
    try {
      const result = await buildApk(buildId, body.files || [], body.config || {});
      cleanupBuilds();
      return sendJson(res, { success: true, build_id: buildId, ...result });
    } catch (err) {
      return sendJson(res, { success: false, error: err.message, build_id: buildId }, 500);
    }
  }

  // Build EXE
  if (url.pathname === "/api/build-exe" && req.method === "POST") {
    const body = await readBody(req);
    const buildId = `exe-${crypto.randomBytes(8).toString("hex")}`;
    
    try {
      const result = await buildExe(buildId, body.files || [], body.config || {});
      cleanupBuilds();
      return sendJson(res, { success: true, build_id: buildId, ...result });
    } catch (err) {
      return sendJson(res, { success: false, error: err.message, build_id: buildId }, 500);
    }
  }

  // Build status
  if (url.pathname === "/api/builds" && req.method === "GET") {
    try {
      const downloads = fs.readdirSync(OUTPUT_DIR).map(f => ({
        file: f,
        size: fs.statSync(path.join(OUTPUT_DIR, f)).size,
        url: `/downloads/${f}`,
        created: fs.statSync(path.join(OUTPUT_DIR, f)).mtime.toISOString(),
      }));
      return sendJson(res, { builds: downloads });
    } catch {
      return sendJson(res, { builds: [] });
    }
  }

  sendJson(res, { error: "Not found" }, 404);
});

server.listen(PORT, () => {
  console.log(`[TIVO Build Engine] Running on port ${PORT}`);
});

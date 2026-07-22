// TIVO DEV AGENT BACKEND — HF Space Build Server
// Handles APK/EXE compilation requests from Supabase Edge Functions

const http = require("http");
const { execSync, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = 7861; // Internal API port, nginx proxies /api/* here
const BUILDS_DIR = "/tmp/builds";
const OUTPUT_DIR = "/usr/share/nginx/html/downloads";
const MASTER_SECRET = process.env.MASTER_SECRET || "";

// Ensure directories
fs.mkdirSync(BUILDS_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Allow-list validators for values interpolated into commands / package.json
function sanitizeAppName(name) {
  const s = String(name || "TivoApp").replace(/[^A-Za-z0-9 _-]/g, "").trim().slice(0, 40);
  return s || "TivoApp";
}
function sanitizePackageName(pkg) {
  const s = String(pkg || "com.tivo.app").replace(/[^A-Za-z0-9._]/g, "").slice(0, 80);
  return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(s) ? s : "com.tivo.app";
}
function sanitizeTenant(t) {
  return String(t || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}
function authorize(req) {
  if (!MASTER_SECRET) return { ok: false, code: 503, error: "Build server not configured" };
  const provided = req.headers["x-master-secret"] || "";
  const a = Buffer.from(String(provided));
  const b = Buffer.from(MASTER_SECRET);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }
  const tenant = sanitizeTenant(req.headers["x-tenant-id"]);
  if (!tenant) return { ok: false, code: 400, error: "Missing x-tenant-id" };
  return { ok: true, tenant };
}


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
async function buildApk(buildId, files, config, tenant) {
  const buildDir = path.join(BUILDS_DIR, buildId);
  const tenantOutDir = path.join(OUTPUT_DIR, tenant);
  fs.mkdirSync(tenantOutDir, { recursive: true });
  const outputPath = path.join(tenantOutDir, `${buildId}.apk`);

  fs.mkdirSync(buildDir, { recursive: true });
  writeProjectFiles(buildDir, files);

  // If it's a web project, wrap in Capacitor/Cordova
  const hasAndroidDir = files.some(f => f.path.includes("android/") || f.path.includes("AndroidManifest.xml"));

  if (!hasAndroidDir) {
    // Web project → wrap with Capacitor
    const appName = sanitizeAppName(config.app_name);
    const packageName = sanitizePackageName(config.package_name);

    // Build web first — ignore user-supplied lifecycle scripts to prevent RCE via package.json
    if (fs.existsSync(path.join(buildDir, "package.json"))) {
      execFileSync("npm", ["install", "--ignore-scripts"], { cwd: buildDir, timeout: 120000, stdio: "pipe" });
      execFileSync("npm", ["run", "build", "--if-present", "--ignore-scripts"], { cwd: buildDir, timeout: 120000, stdio: "pipe" });
    }

    // Init Capacitor — pass sanitized values as argv, never shell-interpolated
    execFileSync("npx", ["@capacitor/cli", "init", appName, packageName, "--web-dir", "dist"], {
      cwd: buildDir, timeout: 60000, stdio: "pipe"
    });
    execFileSync("npm", ["install", "--ignore-scripts", "@capacitor/core", "@capacitor/android"], {
      cwd: buildDir, timeout: 60000, stdio: "pipe"
    });
    execFileSync("npx", ["cap", "add", "android"], { cwd: buildDir, timeout: 120000, stdio: "pipe" });
    execFileSync("npx", ["cap", "sync", "android"], { cwd: buildDir, timeout: 120000, stdio: "pipe" });
  }

  // Gradle build
  const androidDir = path.join(buildDir, "android");
  execFileSync("chmod", ["+x", "gradlew"], { cwd: androidDir, stdio: "pipe" });
  execFileSync("./gradlew", ["assembleRelease", "--no-daemon"], {
    cwd: androidDir, timeout: 300000, stdio: "pipe",
    env: { ...process.env, ANDROID_HOME: "/opt/android-sdk", JAVA_HOME: "/usr/lib/jvm/java-17-openjdk-amd64" }
  });

  // Find APK
  const apkPath = findFile(androidDir, ".apk");
  if (apkPath) {
    fs.copyFileSync(apkPath, outputPath);
    return { success: true, path: outputPath, download_url: `/downloads/${tenant}/${buildId}.apk` };
  }
  throw new Error("APK build completed but output file not found");
}

// === EXE BUILD (Electron) ===
async function buildExe(buildId, files, config, tenant) {
  const buildDir = path.join(BUILDS_DIR, buildId);
  const tenantOutDir = path.join(OUTPUT_DIR, tenant);
  fs.mkdirSync(tenantOutDir, { recursive: true });
  const appName = sanitizeAppName(config.app_name);
  const outputPath = path.join(tenantOutDir, `${buildId}-win32-x64.zip`);

  fs.mkdirSync(buildDir, { recursive: true });
  writeProjectFiles(buildDir, files);

  // Ensure package.json has main entry
  const pkgPath = path.join(buildDir, "package.json");
  let pkg = {};
  if (fs.existsSync(pkgPath)) {
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")); } catch { pkg = {}; }
  }

  // Strip any user-supplied lifecycle scripts to prevent RCE via `npm install`
  pkg.scripts = pkg.scripts && typeof pkg.scripts === "object" ? { ...pkg.scripts } : {};
  const userBuild = typeof pkg.scripts.build === "string" ? pkg.scripts.build : null;
  for (const k of Object.keys(pkg.scripts)) {
    if (k.startsWith("pre") || k.startsWith("post") || ["install", "prepare", "prepublish", "prepack"].includes(k)) {
      delete pkg.scripts[k];
    }
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

  // Install deps (no lifecycle scripts) & build
  execFileSync("npm", ["install", "--ignore-scripts"], { cwd: buildDir, timeout: 120000, stdio: "pipe" });
  if (userBuild) {
    execFileSync("npm", ["run", "build", "--if-present", "--ignore-scripts"], { cwd: buildDir, timeout: 120000, stdio: "pipe" });
  }

  const outParent = `${BUILDS_DIR}/${buildId}-out`;
  // Package with electron-packager — sanitized appName passed as argv
  execFileSync("npx", ["@electron/packager", buildDir, appName, "--platform=win32", "--arch=x64", `--out=${outParent}`, "--overwrite", "--no-prune"], {
    timeout: 300000, stdio: "pipe"
  });

  const outDir = `${outParent}/${appName}-win32-x64`;
  if (fs.existsSync(outDir)) {
    execFileSync("zip", ["-r", outputPath, `${appName}-win32-x64/`], { cwd: outParent, timeout: 120000, stdio: "pipe" });
    return { success: true, path: outputPath, download_url: `/downloads/${tenant}/${buildId}-win32-x64.zip` };
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
    const auth = authorize(req);
    if (!auth.ok) return sendJson(res, { error: auth.error }, auth.code);
    const body = await readBody(req);
    const buildId = `apk-${crypto.randomBytes(8).toString("hex")}`;

    try {
      const result = await buildApk(buildId, body.files || [], body.config || {}, auth.tenant);
      cleanupBuilds();
      return sendJson(res, { success: true, build_id: buildId, ...result });
    } catch (err) {
      return sendJson(res, { success: false, error: "Build failed", build_id: buildId }, 500);
    }
  }

  // Build EXE
  if (url.pathname === "/api/build-exe" && req.method === "POST") {
    const auth = authorize(req);
    if (!auth.ok) return sendJson(res, { error: auth.error }, auth.code);
    const body = await readBody(req);
    const buildId = `exe-${crypto.randomBytes(8).toString("hex")}`;

    try {
      const result = await buildExe(buildId, body.files || [], body.config || {}, auth.tenant);
      cleanupBuilds();
      return sendJson(res, { success: true, build_id: buildId, ...result });
    } catch (err) {
      return sendJson(res, { success: false, error: "Build failed", build_id: buildId }, 500);
    }
  }

  // Build status — tenant-scoped listing only
  if (url.pathname === "/api/builds" && req.method === "GET") {
    const auth = authorize(req);
    if (!auth.ok) return sendJson(res, { error: auth.error }, auth.code);
    const tenantDir = path.join(OUTPUT_DIR, auth.tenant);
    try {
      if (!fs.existsSync(tenantDir)) return sendJson(res, { builds: [] });
      const downloads = fs.readdirSync(tenantDir).map(f => ({
        file: f,
        size: fs.statSync(path.join(tenantDir, f)).size,
        url: `/downloads/${auth.tenant}/${f}`,
        created: fs.statSync(path.join(tenantDir, f)).mtime.toISOString(),
      }));
      return sendJson(res, { builds: downloads });
    } catch {
      return sendJson(res, { builds: [] });
    }
  }

  // Signed short-lived download URL — issue only for the caller's tenant
  if (url.pathname === "/api/build-download-url" && req.method === "GET") {
    const auth = authorize(req);
    if (!auth.ok) return sendJson(res, { error: auth.error }, auth.code);
    const file = url.searchParams.get("file") || "";
    if (!/^[A-Za-z0-9._-]+$/.test(file)) return sendJson(res, { error: "Invalid file" }, 400);
    const abs = path.join(OUTPUT_DIR, auth.tenant, file);
    if (!fs.existsSync(abs)) return sendJson(res, { error: "Not found" }, 404);
    const exp = Math.floor(Date.now() / 1000) + 300; // 5 min
    const payload = `${auth.tenant}:${file}:${exp}`;
    const sig = crypto.createHmac("sha256", MASTER_SECRET).update(payload).digest("hex");
    return sendJson(res, { url: `/downloads/${auth.tenant}/${file}?exp=${exp}&sig=${sig}` });
  }

  // Verify signed download (nginx should proxy /downloads/* to this if possible)
  if (url.pathname.startsWith("/downloads/") && req.method === "GET") {
    const rest = url.pathname.slice("/downloads/".length);
    const [tenant, file] = rest.split("/", 2);
    const exp = parseInt(url.searchParams.get("exp") || "0", 10);
    const sig = url.searchParams.get("sig") || "";
    if (!tenant || !file || !exp || !sig) return sendJson(res, { error: "Signed URL required" }, 403);
    if (Date.now() / 1000 > exp) return sendJson(res, { error: "Link expired" }, 403);
    const expected = crypto.createHmac("sha256", MASTER_SECRET).update(`${tenant}:${file}:${exp}`).digest("hex");
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return sendJson(res, { error: "Invalid signature" }, 403);
    const abs = path.join(OUTPUT_DIR, tenant, file);
    if (!fs.existsSync(abs)) return sendJson(res, { error: "Not found" }, 404);
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${file}"` });
    fs.createReadStream(abs).pipe(res);
    return;
  }


  sendJson(res, { error: "Not found" }, 404);
});

server.listen(PORT, () => {
  console.log(`[TIVO Build Engine] Running on port ${PORT}`);
});

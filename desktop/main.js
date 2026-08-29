/**
 * ZaloCRM desktop wrapper — Electron main process (ESM).
 *
 * Responsibilities:
 *   1. Load desktop-specific `.env`, then spawn the compiled backend
 *      (`node backend/dist/app.js`) as a child process.
 *   2. Wait for the backend to become ready (HTTP health route, with a TCP
 *      port-check fallback), then open a BrowserWindow:
 *        - production: load the built frontend served by Fastify
 *          (http://127.0.0.1:<PORT>)
 *        - dev (`npm run dev`): load the Vite dev server (http://localhost:5173)
 *          while the backend keeps running.
 *   3. Clean shutdown: terminate the backend child on quit (SIGTERM, then
 *      SIGKILL fallback).
 *
 * A minimal preload bridge lets notification clicks restore the native window;
 * backend API calls still run same-origin in a sandboxed renderer.
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = 3000;
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 500;
const HTTP_PROBE_TIMEOUT_MS = 2_000;
const TCP_PROBE_TIMEOUT_MS = 1_500;
const KILL_GRACE_MS = 3_000;

let backendProcess = null;
let mainWindow = null;
let backendReady = false;
let shuttingDown = false;
let currentPort = DEFAULT_PORT;

// Must be set before userData is first accessed so it resolves under "ZaloCRM".
app.setName('ZaloCRM');
app.setAppUserModelId('com.zalocrm.desktop');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── .env loading (dependency-free dotenv-style parser) ──────────────────────

function parseEnvText(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

function loadEnvFile() {
  const candidates = [];
  // Dev: desktop/.env sits next to main.js. Packaged: resources/.env or userData/.env.
  if (!app.isPackaged) candidates.push(path.join(__dirname, '.env'));
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, '.env'));
  candidates.push(path.join(app.getPath('userData'), '.env'));

  for (const file of candidates) {
    if (!file || !fs.existsSync(file)) continue;
    try {
      console.log(`[desktop] loading env from ${file}`);
      return parseEnvText(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      console.error(`[desktop] failed to read ${file}:`, err);
    }
  }
  console.log('[desktop] no .env found — using built-in defaults');
  return {};
}

// ── Backend layout resolution ───────────────────────────────────────────────

function resolveBackendDir() {
  if (app.isPackaged) {
    // Packaged: resources/backend (see extraResources in package.json).
    return path.join(process.resourcesPath, 'backend');
  }
  // Dev: main.js lives in desktop/, backend is a sibling of desktop/.
  return path.join(__dirname, '..', 'backend');
}

function buildBackendEnv(fileEnv, port) {
  // UPLOAD_DIR defaults to a writable userData subfolder.
  const userDataUploads = path.join(app.getPath('userData'), 'uploads');
  try {
    fs.mkdirSync(userDataUploads, { recursive: true });
  } catch (err) {
    console.error('[desktop] failed to create upload dir:', err);
  }

  return {
    ...process.env, // keep PATH etc. so `node`/native modules resolve
    ...fileEnv, // desktop/.env overrides host environment
    NODE_ENV: fileEnv.NODE_ENV || 'production',
    PORT: String(port),
    APP_URL: fileEnv.APP_URL || `http://127.0.0.1:${port}`,
    UPLOAD_DIR: fileEnv.UPLOAD_DIR || userDataUploads,
  };
}

// ── Backend spawn ───────────────────────────────────────────────────────────

function spawnBackend(env, backendDir) {
  return new Promise((resolve, reject) => {
    const entry = path.join(backendDir, 'dist', 'app.js');
    const nodeBin = process.env.ZALOCRM_NODE_BIN || 'node';

    if (!fs.existsSync(entry)) {
      reject(
        new Error(
          `Backend build not found: ${entry}\n` +
            'Run "npm run build" inside backend/ first.',
        ),
      );
      return;
    }

    console.log(`[desktop] spawning backend: ${nodeBin} ${entry}`);

    const child = spawn(nodeBin, [entry], {
      cwd: backendDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      windowsHide: true,
    });

    backendProcess = child;

    let stderrBuf = '';
    child.stdout?.on('data', (chunk) => process.stdout.write(`[backend] ${chunk}`));
    child.stderr?.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      process.stderr.write(`[backend] ${chunk}`);
    });

    child.once('spawn', () => resolve(child));
    child.once('error', (err) => {
      reject(new Error(`Failed to start backend process: ${err.message}`));
    });

    child.on('exit', (code, signal) => {
      console.log(`[desktop] backend exited (code=${code}, signal=${signal})`);
      backendProcess = null;
      if (!shuttingDown && !backendReady) {
        showErrorPage(
          stderrBuf.trim() ||
            `Backend exited unexpectedly (code=${code}, signal=${signal ?? 'none'}).`,
        );
      }
    });
  });
}

// ── Readiness probing (HTTP health + TCP fallback) ──────────────────────────

async function httpReached(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_PROBE_TIMEOUT_MS) });
    // Any HTTP response (even 404/500) means the server is listening.
    return { reached: true, status: res.status };
  } catch {
    return { reached: false };
  }
}

function tcpReached(host, port, timeoutMs = TCP_PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function isBackendReady(baseUrl, port) {
  // Primary: Fastify defines GET /health; /api/v1/health kept as a fallback.
  for (const p of ['/health', '/api/v1/health']) {
    if ((await httpReached(`${baseUrl}${p}`)).reached) return true;
  }
  // Fallback: raw TCP port check (covers "route missing" scenarios).
  return tcpReached('127.0.0.1', port);
}

async function waitForBackend(baseUrl, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isBackendReady(baseUrl, port)) return true;
    await sleep(HEALTH_POLL_MS);
  }
  return false;
}

// ── Window & error page ─────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function showErrorPage(message) {
  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>ZaloCRM — Lỗi khởi động</title>
<style>
  body{font-family:system-ui,Segoe UI,sans-serif;background:#14171c;color:#e6e8ea;padding:40px;max-width:860px;margin:0 auto;line-height:1.6}
  h1{color:#ff6b6b}
  pre{background:#23272e;padding:16px;border:1px solid #333a44;border-radius:8px;overflow:auto;white-space:pre-wrap;word-break:break-word}
  code{background:#23272e;padding:2px 6px;border-radius:4px}
</style>
</head>
<body>
<h1>Không thể khởi động ZaloCRM</h1>
<p>Backend không khởi động được. Chi tiết lỗi:</p>
<pre>${escapeHtml(message)}</pre>
<p>Vui lòng kiểm tra:</p>
<ul>
  <li>PostgreSQL 16 đang chạy và <code>DATABASE_URL</code> trong <code>desktop/.env</code> đúng.</li>
  <li>Backend đã được build: <code>npm run build</code> trong thư mục <code>backend/</code>.</li>
  <li>Node.js 20+ đã cài đặt và nằm trong <code>PATH</code>.</li>
</ul>
</body>
</html>`;

  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = new BrowserWindow({
      width: 900,
      height: 700,
      autoHideMenuBar: true,
      title: 'ZaloCRM',
    });
  }
  mainWindow.loadURL(dataUrl).catch(() => {});
}

function createWindow(targetUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'ZaloCRM',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  console.log(`[desktop] opening window at ${targetUrl}`);
  mainWindow.loadURL(targetUrl).catch((err) => {
    console.error(`[desktop] failed to load ${targetUrl}:`, err);
    showErrorPage(String(err));
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop();
}

ipcMain.on('zalocrm:show-main-window', showMainWindow);

// ── Shutdown ────────────────────────────────────────────────────────────────

function shutdownBackend() {
  return new Promise((resolve) => {
    const child = backendProcess;
    if (!child) return resolve();

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(forceKillTimer);
      resolve();
    };

    const forceKillTimer = setTimeout(() => {
      if (backendProcess) {
        try {
          backendProcess.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }
      finish();
    }, KILL_GRACE_MS);

    child.once('exit', finish);
    try {
      child.kill('SIGTERM');
    } catch {
      finish();
    }
  });
}

let isQuitting = false;
app.on('before-quit', (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  shuttingDown = true;
  console.log('[desktop] quitting — stopping backend...');
  shutdownBackend().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && backendReady) {
    createWindow(`http://127.0.0.1:${currentPort}`);
  }
});

process.on('SIGINT', () => app.quit());
process.on('SIGTERM', () => app.quit());

// ── Boot ────────────────────────────────────────────────────────────────────

async function boot() {
  const fileEnv = loadEnvFile();
  currentPort = parseInt(fileEnv.PORT || String(DEFAULT_PORT), 10) || DEFAULT_PORT;

  const baseUrl = `http://127.0.0.1:${currentPort}`;
  const devUrl = 'http://localhost:5173';
  const isDev =
    !app.isPackaged &&
    (process.env.npm_lifecycle_event === 'dev' || process.argv.includes('--dev'));

  console.log('[desktop] ZaloCRM starting');
  console.log(`[desktop] backend dir: ${resolveBackendDir()}`);
  console.log(`[desktop] mode: ${isDev ? 'dev (Vite dev server)' : 'production (built frontend)'}`);

  try {
    await spawnBackend(buildBackendEnv(fileEnv, currentPort), resolveBackendDir());
  } catch (err) {
    console.error('[desktop]', err);
    showErrorPage(err.message);
    return;
  }

  const ready = await waitForBackend(baseUrl, currentPort, HEALTH_TIMEOUT_MS);
  if (!ready) {
    showErrorPage(
      `Backend không phản hồi sau ${HEALTH_TIMEOUT_MS / 1000}s tại ${baseUrl}.`,
    );
    return;
  }
  backendReady = true;
  console.log(`[desktop] backend ready at ${baseUrl}`);

  createWindow(isDev ? devUrl : baseUrl);
}

app.whenReady().then(boot);

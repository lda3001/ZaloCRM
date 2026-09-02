/**
 * ZaloCRM desktop shell.
 *
 * The backend is an independent service. This process never bundles, starts,
 * restarts, or stops it; Electron only waits for BACKEND_URL and loads the web
 * application served from that origin.
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:3001';
const HEALTH_TIMEOUT_MS = 15_000;
const HEALTH_POLL_MS = 500;
const HTTP_PROBE_TIMEOUT_MS = 2_000;

let mainWindow = null;
let backendUrl = DEFAULT_BACKEND_URL;
let windowTargetUrl = DEFAULT_BACKEND_URL;

app.setName('ZaloCRM');
app.setAppUserModelId('com.zalocrm.desktop');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

function loadEnvFile() {
  const candidates = [
    !app.isPackaged ? path.join(__dirname, '.env') : null,
    app.isPackaged ? path.join(path.dirname(process.execPath), '.env') : null,
    path.join(app.getPath('userData'), '.env'),
  ].filter(Boolean);

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      console.log(`[desktop] loading config from ${file}`);
      return parseEnvText(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      console.error(`[desktop] failed to read ${file}:`, err);
    }
  }
  console.log(`[desktop] no .env found; using ${DEFAULT_BACKEND_URL}`);
  return {};
}

function normalizeHttpUrl(value, fallback) {
  try {
    const parsed = new URL(value || fallback);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return fallback;
  }
}

async function backendReached(baseUrl) {
  for (const pathname of ['/health', '/api/v1/health']) {
    try {
      await fetch(`${baseUrl}${pathname}`, {
        signal: AbortSignal.timeout(HTTP_PROBE_TIMEOUT_MS),
      });
      return true;
    } catch {
      // Try the next health endpoint.
    }
  }
  return false;
}

async function waitForBackend(baseUrl) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await backendReached(baseUrl)) return true;
    await sleep(HEALTH_POLL_MS);
  }
  return false;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function showBackendError(baseUrl) {
  const safeUrl = escapeHtml(baseUrl);
  const retryUrl = JSON.stringify(baseUrl).replaceAll('<', '\\u003c');
  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>ZaloCRM — Backend chưa chạy</title>
<style>
  body{font-family:system-ui,Segoe UI,sans-serif;background:#14171c;color:#e6e8ea;padding:40px;max-width:760px;margin:0 auto;line-height:1.6}
  h1{color:#ffb454} code{background:#23272e;padding:3px 7px;border-radius:5px}
  button{margin-top:16px;border:0;border-radius:9px;padding:10px 16px;background:#2f80ed;color:white;font-weight:600;cursor:pointer}
</style>
</head>
<body>
<h1>Backend ZaloCRM chưa sẵn sàng</h1>
<p>Desktop hiện chạy độc lập và không tự khởi động backend.</p>
<p>Hãy chạy backend trước, rồi kiểm tra địa chỉ <code>${safeUrl}</code>.</p>
<button onclick='location.href=${retryUrl}'>Kết nối lại</button>
</body>
</html>`;

  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  if (!mainWindow || mainWindow.isDestroyed()) createWindow(dataUrl);
  else mainWindow.loadURL(dataUrl).catch(() => {});
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
  mainWindow.loadURL(targetUrl).catch((err) => {
    console.error(`[desktop] failed to load ${targetUrl}:`, err);
    showBackendError(backendUrl);
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

app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow(windowTargetUrl);
});
process.on('SIGINT', () => app.quit());
process.on('SIGTERM', () => app.quit());

async function boot() {
  const fileEnv = loadEnvFile();
  backendUrl = normalizeHttpUrl(
    fileEnv.BACKEND_URL || fileEnv.APP_URL,
    DEFAULT_BACKEND_URL,
  );
  const isDev = !app.isPackaged
    && (process.env.npm_lifecycle_event === 'dev' || process.argv.includes('--dev'));
  windowTargetUrl = isDev
    ? normalizeHttpUrl(fileEnv.FRONTEND_URL, 'http://127.0.0.1:5173')
    : backendUrl;

  console.log(`[desktop] backend URL: ${backendUrl}`);
  console.log(`[desktop] mode: ${isDev ? 'development' : 'production'}`);

  if (!(await waitForBackend(backendUrl))) {
    showBackendError(backendUrl);
    return;
  }
  createWindow(windowTargetUrl);
}

app.whenReady().then(boot);

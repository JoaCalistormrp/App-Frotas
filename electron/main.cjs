/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, shell, Menu, dialog, safeStorage, ipcMain } = require("electron");
const path = require("path");
const net  = require("net");
const fs   = require("fs");

const logFile = path.join(app.getPath("userData"), "electron-debug.log");
const log = (...args) => {
  const msg = `[${new Date().toISOString()}] ${args.join(" ")}\n`;
  try { fs.appendFileSync(logFile, msg); } catch {}
  console.log(...args);
};

const PORT  = 3131;
const isDev = !app.isPackaged;
const isConfigureCredentials = process.argv.includes("--configure-oracle") || process.argv.includes("--configure-credentials");

// Ficheiro cifrado com os segredos que só podem viver nesta máquina/conta
// Windows (via safeStorage/DPAPI): credenciais Oracle + a chave service_role
// do Supabase. Fora da pasta da app — nunca vai para o instalador nem para o git.
const CREDENTIALS_PATH = path.join(app.getPath("userData"), "app-credentials.enc");

// Valores públicos (URL + chave publishable do Supabase) — não são segredo,
// já vão embutidos no bundle do site também. Gerados em build time por
// scripts/post-build.cjs a partir do .env, para a app arrancar sem precisar
// de configuração nenhuma; só Oracle e a chave service_role exigem o passo
// `--configure-credentials`.
function loadPublicEnv() {
  // Ficheiro pequeno, lido direto de dentro do asar — Electron suporta isso nativamente.
  const p = path.join(__dirname, "public-env.generated.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

// ─── Credenciais cifradas (Oracle + Supabase service_role) ─────────────────
function saveCredentials({ oracleConnectString, oracleUser, oraclePassword, supabaseServiceRoleKey }) {
  if (!oracleConnectString || !oracleUser || !oraclePassword) {
    return { ok: false, error: "Preencha host, utilizador e password do Oracle." };
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: "A criptografia nativa do sistema (DPAPI) não está disponível nesta conta Windows." };
  }
  const payload = JSON.stringify({
    oracle: { connectString: oracleConnectString, user: oracleUser, password: oraclePassword },
    supabaseServiceRoleKey: supabaseServiceRoleKey || null,
  });
  const encrypted = safeStorage.encryptString(payload);
  fs.mkdirSync(path.dirname(CREDENTIALS_PATH), { recursive: true });
  fs.writeFileSync(CREDENTIALS_PATH, encrypted);
  return { ok: true, path: CREDENTIALS_PATH };
}

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) return null;
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const decrypted = safeStorage.decryptString(fs.readFileSync(CREDENTIALS_PATH));
    return JSON.parse(decrypted);
  } catch (e) {
    log("[credentials] Falha ao ler/decifrar:", e.message);
    return null;
  }
}

// ─── Modo de configuração: `"Checklist Frota.exe" --configure-credentials` ─
// Corre uma vez por máquina (ou sempre que as credenciais precisarem de ser
// trocadas). Abre uma janela mínima e independente — não é a app normal — e
// grava tudo cifrado com o DPAPI do Windows. O handler IPC só existe
// enquanto esta janela existe, nunca durante o uso normal da app.
function configureCredentials() {
  return new Promise((resolve) => {
    const existing = loadCredentials();
    ipcMain.handle("save-app-credentials", (_event, creds) => saveCredentials(creds));
    ipcMain.handle("load-app-credentials", () => existing);

    const win = new BrowserWindow({
      width: 480,
      height: 620,
      resizable: false,
      title: "Configurar credenciais — Checklist Frota",
      icon: path.join(__dirname, "../public/icons/icon.ico"),
      webPreferences: {
        preload: path.join(__dirname, "configure-oracle-preload.cjs"),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    Menu.setApplicationMenu(null);
    win.loadFile(path.join(__dirname, "configure-oracle.html"));
    win.on("closed", () => {
      ipcMain.removeHandler("save-app-credentials");
      ipcMain.removeHandler("load-app-credentials");
      resolve();
    });
  });
}

// Função auxiliar para mapear corretamente o caminho de ficheiros para URLs do V8/import()
function pathToFileURL(p) {
  let pathName = path.resolve(p).replace(/\\/g, "/");
  if (pathName[0] !== "/") pathName = "/" + pathName;
  return new URL("file://" + pathName);
}

function resolveUnpacked(p) {
  if (p.includes("app.asar") && !p.includes("app.asar.unpacked")) {
    return p.replace("app.asar", "app.asar.unpacked");
  }
  return p;
}

// ─── Servidor integrado ──────────────────────────────────────────────────
// dist/server/server.js (Cloudflare Workers) foi descontinuado em favor do
// output padrão do preset "node" do Nitro (.output/server/index.mjs) — um
// servidor Node autónomo de verdade, que já serve os estáticos (.output/public)
// e roda o mesmo código de servidor (incl. Oracle, autenticado) usado no site.
async function startServer() {
  log("=== startServer ===");

  const appDir = app.getAppPath();
  const serverEntry = resolveUnpacked(path.join(appDir, ".output", "server", "index.mjs"));
  log("serverEntry:", serverEntry, "existe:", fs.existsSync(serverEntry));
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Servidor não encontrado: ${serverEntry}`);
  }

  // Credenciais (Oracle + Supabase service_role) — decifradas em memória, nunca em disco.
  const creds = loadCredentials();
  if (creds?.oracle) {
    process.env.ORACLE_DB_USER     = creds.oracle.user;
    process.env.ORACLE_DB_PASSWORD = creds.oracle.password;
    process.env.ORACLE_DB_HOST     = creds.oracle.connectString;
  } else {
    log("Credenciais Oracle não configuradas — corra --configure-credentials para habilitar o módulo financeiro.");
  }
  if (creds?.supabaseServiceRoleKey) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = creds.supabaseServiceRoleKey;
  } else {
    log("Chave service_role do Supabase não configurada — funções administrativas (usuários, licitações) ficarão indisponíveis.");
  }

  // Valores públicos (não secretos) do Supabase, gerados em build time.
  const publicEnv = loadPublicEnv();
  if (publicEnv.SUPABASE_URL) process.env.SUPABASE_URL = publicEnv.SUPABASE_URL;
  if (publicEnv.SUPABASE_PUBLISHABLE_KEY) process.env.SUPABASE_PUBLISHABLE_KEY = publicEnv.SUPABASE_PUBLISHABLE_KEY;

  process.env.PORT = String(PORT);

  // O entrypoint do Nitro arranca-se sozinho ao ser importado (lê PORT do env).
  await import(pathToFileURL(serverEntry).href);

  await pollPort(PORT, 8000);
}

function pollPort(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const attempt = () => {
      const sock = new net.Socket();
      sock.once("connect", () => { sock.destroy(); resolve(); });
      sock.once("error",   () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Porta ${port} não abriu em ${timeoutMs}ms`));
        } else {
          setTimeout(attempt, 200);
        }
      });
      sock.connect(port, "127.0.0.1");
    };
    attempt();
  });
}

// ─── Janela ────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Checklist Frota – Grupo Tomaz",
    icon: path.join(__dirname, "../public/icons/icon-512.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    backgroundColor: "#ffffff",
    show: false,
  });

  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`) && !url.includes("supabase.co")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || "http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadURL(`http://127.0.0.1:${PORT}`);
  }

  return win;
}

// ─── App lifecycle ─────────────────────────────────────────────────────────
if (!isDev) {
  Menu.setApplicationMenu(null);
}

app.whenReady().then(async () => {
  if (isConfigureCredentials) {
    await configureCredentials();
    app.quit();
    return;
  }

  log("=== App ready ===");
  log("isPackaged:", app.isPackaged, "isDev:", isDev);
  log("appPath:", app.getAppPath());
  log("userData:", app.getPath("userData"));

  if (!isDev) {
    const splash = new BrowserWindow({
      width: 420, height: 280,
      frame: false, transparent: true, alwaysOnTop: true,
      icon: path.join(__dirname, "../public/icons/icon.ico"),
    });
    splash.loadURL(`data:text/html,
      <html><body style="margin:0;background:#1a1a4d;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#fff">
        <img src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'><rect x='1' y='3' width='15' height='13'/><polygon points='16 8 20 8 23 11 23 16 16 16 16 8'/><circle cx='5.5' cy='18.5' r='2.5'/><circle cx='18.5' cy='18.5' r='2.5'/></svg>" style="margin-bottom:16px"/>
        <div style="font-size:18px;font-weight:bold">Checklist Frota</div>
        <div style="font-size:13px;opacity:.7;margin-top:8px">A iniciar…</div>
      </body></html>
    `);

    try {
      log("A iniciar servidor integrado...");
      await startServer();
      log("Servidor pronto na porta", PORT);
      splash.close();
      const win = createWindow();
      win.once("ready-to-show", () => win.focus());
    } catch (err) {
      log("ERRO FATAL:", String(err));
      if (splash && !splash.isDestroyed()) splash.close();
      dialog.showErrorBox(
        "Erro ao iniciar servidor",
        `${String(err.stack || err)}\n\nLog em:\n${logFile}`
      );
      app.quit();
    }
  } else {
    createWindow();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

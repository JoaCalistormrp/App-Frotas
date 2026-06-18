/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, shell, Menu, dialog } = require("electron");
const path      = require("path");
const net        = require("net");
const fs         = require("fs");

const logFile = path.join(app.getPath("userData"), "electron-debug.log");
const log = (...args) => {
  const msg = `[${new Date().toISOString()}] ${args.join(" ")}\n`;
  try { fs.appendFileSync(logFile, msg); } catch {}
  console.log(...args);
};

const PORT  = 3131;
const isDev = !app.isPackaged;

let serverInstance = null;

// Função auxiliar para mapear corretamente o caminho de ficheiros para URLs do V8/import()
function pathToFileURL(p) {
  let pathName = path.resolve(p).replace(/\\/g, '/');
  if (pathName[0] !== '/') pathName = '/' + pathName;
  return new URL('file://' + pathName);
}

// ─── Servidor Integrado (Substitui o spawn do processo filho) ──────────
async function startPreviewServer() {
  log("=== startPreviewServer (Integrado no Main Process) ===");

  const appDir = app.getAppPath();
  let serverScript = path.join(appDir, "electron", "node-server.mjs");
  
  // Como descompactamos via asarUnpack, em produção o script estará na pasta .unpacked
  if (serverScript.includes("app.asar") && !serverScript.includes("app.asar.unpacked")) {
    serverScript = serverScript.replace("app.asar", "app.asar.unpacked");
  }
  
  log("serverScript:", serverScript, "existe:", fs.existsSync(serverScript));

  if (!fs.existsSync(serverScript)) {
    throw new Error(`Servidor não encontrado: ${serverScript}`);
  }

  // Importação dinâmica do ES Module dentro do CommonJS
  const { startIntegratedServer } = await import(pathToFileURL(serverScript).href);

  // Inicia o servidor HTTP nativo passando as propriedades necessárias
  serverInstance = await startIntegratedServer({
    appDir: appDir,
    port: PORT,
    logCallback: log
  });

  // Validação de segurança extra para garantir que a porta foi vinculada com sucesso
  await pollPort(PORT, 5000);
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
    
    // 👇 LINHA ADICIONADA: Força o DevTools a abrir em Produção 👇
    win.webContents.openDevTools({ mode: "detach" });
  }

  return win;
}

// ─── App lifecycle ─────────────────────────────────────────────────────────
if (!isDev) {
  Menu.setApplicationMenu(null);
}

app.whenReady().then(async () => {
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
      await startPreviewServer();
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
  // Encerra o servidor de forma limpa da memória RAM ao fechar as janelas do app
  if (serverInstance && typeof serverInstance.close === "function") {
    serverInstance.close();
    serverInstance = null;
  }
  if (process.platform !== "darwin") app.quit();
});
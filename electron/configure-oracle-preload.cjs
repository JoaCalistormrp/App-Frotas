/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

// Única API exposta a esta janela — nada além disto é acessível pelo HTML.
contextBridge.exposeInMainWorld("appSetup", {
  save: (creds) => ipcRenderer.invoke("save-app-credentials", creds),
  load: () => ipcRenderer.invoke("load-app-credentials"),
});

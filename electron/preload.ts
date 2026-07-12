// Placeholder de preload — NO se compila ni se usa todavía.
//
// La integración con el SO es mínima en esta fase: el renderer usa APIs de
// navegador (IndexedDB, blob URLs, file-saver, <input file>) que Electron
// soporta de forma nativa, así que no hace falta puente IPC.
//
// Para activarlo en el futuro (p. ej. diálogos nativos de guardar/abrir):
//  1) Registrar el preload en vite.config.ts con la Simple API de
//     vite-plugin-electron (genera preload.mjs correctamente para "type":"module").
//  2) Referenciarlo en webPreferences.preload de electron/main.ts.
//  3) Exponer el puente con contextBridge:
//
//   import { contextBridge, ipcRenderer } from 'electron';
//   contextBridge.exposeInMainWorld('electronAPI', { ... });

export {};

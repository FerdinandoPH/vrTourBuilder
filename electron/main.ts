import { app, BrowserWindow } from 'electron';
import path from 'node:path';

// El main se compila a CommonJS (.cjs), así que __dirname existe en runtime y
// `require('electron')` (al que se traduce este import) devuelve la API real.

// En desarrollo, el plugin inyecta la URL del dev server de Vite.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0f1117',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // En producción los assets van con base './' (ver vite.config.ts).
    void win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // En macOS la app sigue viva hasta que el usuario la cierra explícitamente.
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Textos del tour EXPORTADO (sitio estático). No pueden usar react-i18next en
// tiempo de ejecución: se resuelven al exportar según settings.lang y se
// inyectan tal cual en index.html y en los archivos de ayuda. Los que van al
// HTML pueden contener marcado (<strong>, <code>, <br>); es contenido fijo del
// generador, no entrada del usuario.

import type { ExportLang } from '../types';

export interface ExportStrings {
  // Nombres de archivo del paquete (localizados y usados de forma consistente
  // en el ZIP, en el aviso de index.html y en LEEME/README).
  readmeFile: string;
  batFile: string;
  shFile: string;

  // Overlay de instrucciones (index.html)
  instructionsTitle: string;
  instructionsMobile: string; // contiene <strong>
  instructionsMarkers: string; // contiene <strong>
  instructionsGallery: string; // contiene <strong> (solo si hay galería)
  dontShowAgain: string;
  gotIt: string;

  // Aviso de file:// (index.html)
  serverWarningTitle: string;
  serverWarningP1: string; // contiene <code>
  serverWarningP2: string;
  serverWarningOptions: string; // bloque HTML con <strong>/<code>/<br>
  serverWarningMore: string; // contiene <code>

  // Archivos de ayuda del ZIP
  readmeTxt: string;
  startBat: string;
  startSh: string;
}

const es: ExportStrings = {
  readmeFile: 'LEEME.txt',
  batFile: 'iniciar-servidor.bat',
  shFile: 'iniciar-servidor.sh',

  instructionsTitle: 'Antes de empezar',
  instructionsMobile:
    'Puedes ver el tour tanto con el móvil en <strong>vertical</strong> como en <strong>horizontal</strong>.',
  instructionsMarkers:
    'Pulsa los <strong>marcadores con flechas</strong> para avanzar por el tour de una zona a otra.',
  instructionsGallery:
    'Usa el botón de <strong>galería</strong> del menú inferior para saltar rápidamente entre las distintas zonas del tour.',
  dontShowAgain: 'No mostrar más',
  gotIt: 'Entendido',

  serverWarningTitle: 'Este tour necesita un servidor local',
  serverWarningP1:
    'Has abierto el archivo directamente (<code>file://</code>) y el navegador bloquea la carga por seguridad.',
  serverWarningP2: 'Sirve esta carpeta por HTTP. Opciones:',
  serverWarningOptions: `<strong>Windows:</strong> doble clic en <code>iniciar-servidor.bat</code><br>
      <strong>Mac/Linux:</strong> <code>sh iniciar-servidor.sh</code><br>
      <strong>Con Node:</strong> <code>npx serve</code><br>
      <strong>Con Python:</strong> <code>python -m http.server 8000</code>`,
  serverWarningMore: 'Más detalles en <code>LEEME.txt</code>.',

  readmeTxt: `COMO VER EL TOUR
================

Este tour usa Photo Sphere Viewer (ES modules), por lo que NO funciona
abriendo index.html con doble clic: el navegador bloquea los archivos
locales por seguridad (veras un error CORS / "origin null").

Hay que servir esta carpeta por HTTP. Elige UNA opcion:

WINDOWS
-------
  Haz doble clic en:  iniciar-servidor.bat
  (requiere tener Python instalado; abre http://localhost:8000)

MAC / LINUX
-----------
  En una terminal, dentro de esta carpeta:
      sh iniciar-servidor.sh

CON NODE (cualquier sistema)
----------------------------
  En una terminal, dentro de esta carpeta:
      npx serve
  y abre la URL que muestre (p. ej. http://localhost:3000).

CON PYTHON (manual)
-------------------
      python -m http.server 8000
  y abre http://localhost:8000

SUBIR A INTERNET
----------------
  Sube el contenido de esta carpeta a cualquier hosting estatico
  (Netlify, GitHub Pages, tu servidor...) y funcionara directamente.
`,

  startBat: `@echo off
cd /d "%~dp0"
echo Iniciando servidor local en http://localhost:8000
echo Cierra esta ventana para detenerlo.
start "" http://localhost:8000
py -m http.server 8000
if errorlevel 1 python -m http.server 8000
pause
`,

  startSh: `#!/bin/sh
cd "$(dirname "$0")"
echo "Iniciando servidor local en http://localhost:8000 (Ctrl+C para detener)"
( python3 -m http.server 8000 || python -m http.server 8000 ) &
SRV=$!
sleep 1
( open http://localhost:8000 || xdg-open http://localhost:8000 ) 2>/dev/null
wait $SRV
`,
};

const en: ExportStrings = {
  readmeFile: 'README.txt',
  batFile: 'start-server.bat',
  shFile: 'start-server.sh',

  instructionsTitle: 'Before you start',
  instructionsMobile:
    'You can view the tour with your phone in <strong>portrait</strong> or <strong>landscape</strong>.',
  instructionsMarkers:
    'Tap the <strong>arrow markers</strong> to move through the tour from one area to another.',
  instructionsGallery:
    'Use the <strong>gallery</strong> button in the bottom menu to quickly jump between the different areas of the tour.',
  dontShowAgain: "Don't show again",
  gotIt: 'Got it',

  serverWarningTitle: 'This tour needs a local server',
  serverWarningP1:
    'You opened the file directly (<code>file://</code>) and the browser blocks loading for security reasons.',
  serverWarningP2: 'Serve this folder over HTTP. Options:',
  serverWarningOptions: `<strong>Windows:</strong> double-click <code>start-server.bat</code><br>
      <strong>Mac/Linux:</strong> <code>sh start-server.sh</code><br>
      <strong>With Node:</strong> <code>npx serve</code><br>
      <strong>With Python:</strong> <code>python -m http.server 8000</code>`,
  serverWarningMore: 'More details in <code>README.txt</code>.',

  readmeTxt: `HOW TO VIEW THE TOUR
====================

This tour uses Photo Sphere Viewer (ES modules), so it does NOT work by
opening index.html with a double-click: the browser blocks local files
for security reasons (you'll see a CORS / "origin null" error).

You need to serve this folder over HTTP. Choose ONE option:

WINDOWS
-------
  Double-click:  start-server.bat
  (requires Python installed; opens http://localhost:8000)

MAC / LINUX
-----------
  In a terminal, inside this folder:
      sh start-server.sh

WITH NODE (any system)
----------------------
  In a terminal, inside this folder:
      npx serve
  and open the URL it shows (e.g. http://localhost:3000).

WITH PYTHON (manual)
--------------------
      python -m http.server 8000
  and open http://localhost:8000

PUBLISH ONLINE
--------------
  Upload the contents of this folder to any static hosting
  (Netlify, GitHub Pages, your own server...) and it will work directly.
`,

  startBat: `@echo off
cd /d "%~dp0"
echo Starting local server at http://localhost:8000
echo Close this window to stop it.
start "" http://localhost:8000
py -m http.server 8000
if errorlevel 1 python -m http.server 8000
pause
`,

  startSh: `#!/bin/sh
cd "$(dirname "$0")"
echo "Starting local server at http://localhost:8000 (Ctrl+C to stop)"
( python3 -m http.server 8000 || python -m http.server 8000 ) &
SRV=$!
sleep 1
( open http://localhost:8000 || xdg-open http://localhost:8000 ) 2>/dev/null
wait $SRV
`,
};

const STRINGS: Record<ExportLang, ExportStrings> = { es, en };

export function getExportStrings(lang: ExportLang): ExportStrings {
  return STRINGS[lang] ?? STRINGS.es;
}

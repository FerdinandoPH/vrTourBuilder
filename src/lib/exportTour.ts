import {
  linkVisibleFrom,
  posFrom,
  type TourLink,
  type TourNode,
  type TourSettings,
} from '../types';
import { getExportStrings } from './exportI18n';

// Versiones fijadas de la librería para el tour exportado.
const THREE_VERSION = '0.184.0';
const PSV_VERSION = '5.14.3';

interface ExportNode {
  id: string;
  name: string;
  panorama: string;
  thumbnail?: string;
  links: { nodeId: string; position: { yaw: number; pitch: number } }[];
}

// Nombre del archivo de miniatura dentro de ./pano/thumbs (siempre .jpg).
export function thumbFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') + '.jpg';
}

// Construye la estructura de nodos que espera el VirtualTourPlugin en modo manual.
// Con `withThumbnails`, añade la ruta de miniatura para el plugin de galería.
export function buildExportNodes(
  nodes: TourNode[],
  links: TourLink[],
  withThumbnails = false,
): ExportNode[] {
  return nodes.map((node) => {
    const nodeLinks = links
      .filter(
        (l) =>
          (l.aNodeId === node.id || l.bNodeId === node.id) &&
          linkVisibleFrom(l, node.id),
      )
      .map((l) => {
        const other = l.aNodeId === node.id ? l.bNodeId : l.aNodeId;
        const pos = posFrom(l, node.id);
        return pos
          ? { nodeId: other, position: { yaw: pos.yaw, pitch: pos.pitch } }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return {
      id: node.id,
      name: node.name,
      panorama: `./pano/${node.fileName}`,
      ...(withThumbnails
        ? { thumbnail: `./pano/thumbs/${thumbFileName(node.fileName)}` }
        : {}),
      links: nodeLinks,
    };
  });
}

export function getStartNodeId(nodes: TourNode[]): string {
  return (nodes.find((n) => n.startNode) ?? nodes[0])?.id ?? '';
}

// Genera el contenido de tour.js (módulo ES que usa el importmap del index.html).
export function generateTourJs(
  nodes: TourNode[],
  links: TourLink[],
  settings: TourSettings,
): string {
  const gallery = settings.gallery;
  const exportNodes = buildExportNodes(nodes, links, gallery);
  const startNodeId = getStartNodeId(nodes);

  const galleryImport = gallery
    ? `import { GalleryPlugin } from '@photo-sphere-viewer/gallery-plugin';\n`
    : '';
  const galleryPlugin = gallery
    ? `\n    [GalleryPlugin, { thumbnailSize: { width: 150, height: 75 } }],`
    : '';

  return `import { Viewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { VirtualTourPlugin } from '@photo-sphere-viewer/virtual-tour-plugin';
${galleryImport}
// Nodos generados por VRTourBuilder. Las fotos están en ./pano
const nodes = ${JSON.stringify(exportNodes, null, 2)};

new Viewer({
  container: document.getElementById('viewer'),
  plugins: [
    MarkersPlugin,${galleryPlugin}
    [VirtualTourPlugin, {
      positionMode: 'manual',
      renderMode: '2d',
      nodes,
      startNodeId: ${JSON.stringify(startNodeId)},
    }],
  ],
});
`;
}

// Genera el index.html del tour exportado (autocontenido salvo la librería, que
// se carga por CDN con versiones fijadas mediante importmap).
export function generateIndexHtml(title: string, settings: TourSettings): string {
  const cdn = 'https://cdn.jsdelivr.net/npm';
  const s = getExportStrings(settings.lang);
  const galleryCss = settings.gallery
    ? `\n  <link rel="stylesheet" href="${cdn}/@photo-sphere-viewer/gallery-plugin@${PSV_VERSION}/index.css" />`
    : '';
  const galleryImport = settings.gallery
    ? `,\n      "@photo-sphere-viewer/gallery-plugin": "${cdn}/@photo-sphere-viewer/gallery-plugin@${PSV_VERSION}/index.module.js"`
    : '';
  const galleryInstruction = settings.gallery
    ? `
        <li>${s.instructionsGallery}</li>`
    : '';
  return `<!doctype html>
<html lang="${settings.lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${cdn}/@photo-sphere-viewer/core@${PSV_VERSION}/index.css" />
  <link rel="stylesheet" href="${cdn}/@photo-sphere-viewer/markers-plugin@${PSV_VERSION}/index.css" />
  <link rel="stylesheet" href="${cdn}/@photo-sphere-viewer/virtual-tour-plugin@${PSV_VERSION}/index.css" />${galleryCss}
  <style>
    html, body { margin: 0; height: 100%; }
    /* 100vh incluye el chrome del navegador en móvil y empuja la navbar
       (galería, menú) fuera de la pantalla; 100dvh usa el viewport real. */
    #viewer { width: 100vw; height: 100vh; height: 100dvh; }
    #file-warning {
      display: none; position: fixed; inset: 0; z-index: 9999;
      background: #0f1117; color: #e6e8ee; padding: 8vh 24px; box-sizing: border-box;
      font-family: system-ui, sans-serif; text-align: center;
    }
    #file-warning code {
      background: #1f232f; padding: 2px 8px; border-radius: 5px;
      display: inline-block; margin: 4px;
    }
    #instructions {
      display: none; position: fixed; inset: 0; z-index: 9998;
      background: rgba(15, 17, 23, 0.82); box-sizing: border-box;
      align-items: center; justify-content: center; padding: 24px;
      font-family: system-ui, sans-serif;
    }
    #instructions.show { display: flex; }
    #instructions .panel {
      background: #171a22; color: #e6e8ee; max-width: 460px; width: 100%;
      border-radius: 14px; padding: 28px 26px; box-sizing: border-box;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5); max-height: 90dvh; overflow-y: auto;
    }
    #instructions h2 { margin: 0 0 16px; font-size: 1.35rem; }
    #instructions ul { margin: 0 0 20px; padding-left: 22px; line-height: 1.55; }
    #instructions li { margin-bottom: 12px; }
    #instructions .dont-show {
      display: flex; align-items: center; gap: 8px; margin-bottom: 20px;
      font-size: 0.9rem; color: #b9bdca; cursor: pointer; user-select: none;
    }
    #instructions .dont-show input { width: 16px; height: 16px; cursor: pointer; }
    #instructions button {
      width: 100%; padding: 12px 16px; border: 0; border-radius: 9px;
      background: #4f7cff; color: #fff; font-size: 1rem; font-weight: 600;
      cursor: pointer;
    }
    #instructions button:hover { background: #3f68e0; }
  </style>
  <script type="importmap">
  {
    "imports": {
      "three": "${cdn}/three@${THREE_VERSION}/build/three.module.js",
      "@photo-sphere-viewer/core": "${cdn}/@photo-sphere-viewer/core@${PSV_VERSION}/index.module.js",
      "@photo-sphere-viewer/markers-plugin": "${cdn}/@photo-sphere-viewer/markers-plugin@${PSV_VERSION}/index.module.js",
      "@photo-sphere-viewer/virtual-tour-plugin": "${cdn}/@photo-sphere-viewer/virtual-tour-plugin@${PSV_VERSION}/index.module.js"${galleryImport}
    }
  }
  </script>
</head>
<body>
  <div id="viewer"></div>
  <div id="instructions">
    <div class="panel">
      <h2>${s.instructionsTitle}</h2>
      <ul>
        <li>${s.instructionsMobile}</li>
        <li>${s.instructionsMarkers}</li>${galleryInstruction}
      </ul>
      <label class="dont-show">
        <input type="checkbox" id="dont-show-again" />
        ${s.dontShowAgain}
      </label>
      <button id="instructions-ok" type="button">${s.gotIt}</button>
    </div>
  </div>
  <div id="file-warning">
    <h2>${s.serverWarningTitle}</h2>
    <p>${s.serverWarningP1}</p>
    <p>${s.serverWarningP2}</p>
    <p>
      ${s.serverWarningOptions}
    </p>
    <p>${s.serverWarningMore}</p>
  </div>
  <script>
    // Aviso si se abre con doble clic (los ES modules de abajo no cargarán).
    if (location.protocol === 'file:') {
      document.getElementById('file-warning').style.display = 'block';
    }

    // Instrucciones iniciales, salvo que se hayan ocultado con "No mostrar más".
    (function () {
      var HIDE_KEY = 'vrtour-hide-instructions';
      var overlay = document.getElementById('instructions');
      var hidden = false;
      try { hidden = localStorage.getItem(HIDE_KEY) === '1'; } catch (e) {}
      if (!hidden) overlay.classList.add('show');
      document.getElementById('instructions-ok').addEventListener('click', function () {
        if (document.getElementById('dont-show-again').checked) {
          try { localStorage.setItem(HIDE_KEY, '1'); } catch (e) {}
        }
        overlay.classList.remove('show');
      });
    })();
  </script>
  <script type="module" src="./tour.js"></script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

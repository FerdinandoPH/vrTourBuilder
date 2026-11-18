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

// Foto troceada en teselas (ver lib/tiles): carpeta y rejilla dentro de ./pano_tiles.
export interface TiledPanorama {
  dir: string; // p.ej. "./pano_tiles/salon"
  width: number; // ancho completo de la panorámica (alto = width / 2)
  cols: number;
  rows: number;
}

interface ExportNode {
  id: string;
  name: string;
  panorama: string | (TiledPanorama & { baseUrl: string });
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

// Carpeta de teselas de cada nodo: el nombre de su foto sin extensión, desambiguado
// si dos fotos comparten nombre base (p.ej. salon.jpg y salon.png).
export function tileDirs(nodes: TourNode[]): Map<string, string> {
  const used = new Set<string>();
  const dirs = new Map<string, string>();
  for (const node of nodes) {
    const stem = node.fileName.replace(/\.[^.]+$/, '') || node.id;
    let name = stem;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${stem}-${i}`;
    used.add(name.toLowerCase());
    dirs.set(node.id, `./pano_tiles/${name}`);
  }
  return dirs;
}

export function getStartNodeId(nodes: TourNode[]): string {
  return (nodes.find((n) => n.startNode) ?? nodes[0])?.id ?? '';
}

// Genera el contenido de tour.js (módulo ES que usa el importmap del index.html).
// Con `tiled` (nodo -> teselas), las fotos se cargan por teselas con el
// EquirectangularTilesAdapter en lugar de como una imagen entera.
export function generateTourJs(
  nodes: TourNode[],
  links: TourLink[],
  settings: TourSettings,
  tiled?: Map<string, TiledPanorama>,
): string {
  const gallery = settings.gallery;
  const exportNodes = buildExportNodes(nodes, links, gallery);
  if (tiled) {
    for (const n of exportNodes) {
      const t = tiled.get(n.id);
      if (t) n.panorama = { baseUrl: `${t.dir}/base.jpg`, ...t };
    }
  }
  const startNodeId = getStartNodeId(nodes);

  // Vista inicial del nodo de arranque (yaw/pitch en radianes), aplicada como
  // orientación por defecto del visor. PSV ya armoniza el ángulo al navegar entre
  // nodos, por lo que no hace falta reorientar en cada nodo.
  const startView = nodes.find((n) => n.id === startNodeId)?.initView;
  const defaultViewConfig = startView
    ? `\n  defaultYaw: ${startView.yaw},\n  defaultPitch: ${startView.pitch},`
    : '';

  const galleryImport = gallery
    ? `import { GalleryPlugin } from '@photo-sphere-viewer/gallery-plugin';\n`
    : '';
  const galleryPlugin = gallery
    ? `\n    [GalleryPlugin, { thumbnailSize: { width: 150, height: 75 } }],`
    : '';

  const tilesImport = tiled
    ? `import { EquirectangularTilesAdapter } from '@photo-sphere-viewer/equirectangular-tiles-adapter';\n`
    : '';
  const tilesSetup = tiled
    ? `
// Cada foto está troceada en teselas (./pano_tiles/<foto>/<col>_<fila>.jpg): el
// visor muestra primero base.jpg (reducida) y después descarga, a resolución
// completa, solo las teselas de la zona que se está mirando.
for (const node of nodes) {
  const { dir, ...panorama } = node.panorama;
  node.panorama = { ...panorama, tileUrl: (col, row) => \`\${dir}/\${col}_\${row}.jpg\` };
}
`
    : '';
  const tilesAdapter = tiled ? `\n  adapter: EquirectangularTilesAdapter,` : '';
  const photosComment = tiled ? './pano_tiles' : './pano';

  return `import { Viewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { VirtualTourPlugin } from '@photo-sphere-viewer/virtual-tour-plugin';
${galleryImport}${tilesImport}
// Nodos generados por VRTourBuilder. Las fotos están en ${photosComment}
const nodes = ${JSON.stringify(exportNodes, null, 2)};
${tilesSetup}
new Viewer({
  container: document.getElementById('viewer'),${tilesAdapter}
  plugins: [
    MarkersPlugin,${galleryPlugin}
    [VirtualTourPlugin, {
      positionMode: 'manual',
      renderMode: '2d',
      nodes,
      startNodeId: ${JSON.stringify(startNodeId)},
    }],
  ],${defaultViewConfig}
});
`;
}

// Genera el index.html del tour exportado (autocontenido salvo la librería, que
// se carga por CDN con versiones fijadas mediante importmap).
export function generateIndexHtml(
  title: string,
  settings: TourSettings,
  tiled = false,
): string {
  const cdn = 'https://cdn.jsdelivr.net/npm';
  const s = getExportStrings(settings.lang);
  const galleryCss = settings.gallery
    ? `\n  <link rel="stylesheet" href="${cdn}/@photo-sphere-viewer/gallery-plugin@${PSV_VERSION}/index.css" />`
    : '';
  const galleryImport = settings.gallery
    ? `,\n      "@photo-sphere-viewer/gallery-plugin": "${cdn}/@photo-sphere-viewer/gallery-plugin@${PSV_VERSION}/index.module.js"`
    : '';
  const tilesImport = tiled
    ? `,\n      "@photo-sphere-viewer/equirectangular-tiles-adapter": "${cdn}/@photo-sphere-viewer/equirectangular-tiles-adapter@${PSV_VERSION}/index.module.js"`
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
      "@photo-sphere-viewer/virtual-tour-plugin": "${cdn}/@photo-sphere-viewer/virtual-tour-plugin@${PSV_VERSION}/index.module.js"${galleryImport}${tilesImport}
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

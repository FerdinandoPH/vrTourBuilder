import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  DEFAULT_SETTINGS,
  type TourLink,
  type TourNode,
  type TourProject,
  type TourSettings,
} from '../types';
import { generateIndexHtml, generateTourJs, thumbFileName } from './exportTour';
import { getExportStrings } from './exportI18n';
import { getImage, getThumb } from '../store/persistence';
import { makeThumbnail } from './thumbnails';
import i18n from '../i18n';

export type ProgressFn = (fraction: number, label: string) => void;

// Título por defecto si el proyecto no tiene nombre.
const DEFAULT_TITLE = 'VRTour';

function tourTitle(settings: TourSettings): string {
  return settings.name.trim() || DEFAULT_TITLE;
}

// Construye y descarga el paquete ejecutable: index.html + tour.js + ./pano/*
// Reparte el progreso: leer fotos 0→50 %, comprimir 50→100 %.
export async function downloadTourZip(
  nodes: TourNode[],
  links: TourLink[],
  settings: TourSettings,
  onProgress?: ProgressFn,
): Promise<void> {
  const zip = new JSZip();
  const ex = getExportStrings(settings.lang);
  zip.file('index.html', generateIndexHtml(tourTitle(settings), settings));
  zip.file('tour.js', generateTourJs(nodes, links, settings));
  // Ayudas para servir el tour por HTTP (no funciona con doble clic / file://).
  // Nombres de archivo localizados según el idioma del tour.
  zip.file(ex.readmeFile, ex.readmeTxt);
  zip.file(ex.batFile, ex.startBat);
  zip.file(ex.shFile, ex.startSh, {
    unixPermissions: 0o755, // ejecutable en mac/linux
  });

  const pano = zip.folder('pano')!;
  const thumbs = settings.gallery ? pano.folder('thumbs')! : null;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const blob = await getImage(node.imageId);
    if (blob) pano.file(node.fileName, blob);
    // Miniatura para la galería (usa la cacheada o la genera al vuelo).
    if (thumbs) {
      let thumb = await getThumb(node.imageId);
      if (!thumb && blob) {
        try {
          thumb = await makeThumbnail(blob);
        } catch {
          thumb = blob;
        }
      }
      if (thumb) thumbs.file(thumbFileName(node.fileName), thumb);
    }
    onProgress?.(
      (nodes.length ? (i + 1) / nodes.length : 1) * 0.5,
      i18n.t('export.progress.addingPhotos', { current: i + 1, total: nodes.length }),
    );
  }

  const out = await zip.generateAsync(
    { type: 'blob' },
    (meta) =>
      onProgress?.(0.5 + (meta.percent / 100) * 0.5, i18n.t('export.progress.compressing')),
  );
  onProgress?.(1, i18n.t('export.progress.downloading'));
  saveAs(out, `${slug(tourTitle(settings))}.zip`);
}

// --- Proyecto (.vrtour.zip): modelo (project.json) + fotos como archivos ---
//
// Se empaqueta en un ZIP en vez de un único JSON con las fotos en base64: un
// proyecto con varias fotos 360º supera el límite máximo de string de V8 y
// `JSON.stringify` lanza «Invalid string length». Con el ZIP, el modelo va en
// un JSON pequeño y cada foto es un archivo binario aparte.

const PROJECT_JSON = 'project.json';
const IMAGES_DIR = 'images/';

// Formato antiguo (.vrtour.json): fotos embebidas en base64. Se sigue
// importando por compatibilidad con proyectos ya guardados.
interface LegacyProjectFile extends TourProject {
  images: Record<string, string>; // imageId -> dataURL
}

export async function downloadProject(
  nodes: TourNode[],
  links: TourLink[],
  settings: TourSettings,
  onProgress?: ProgressFn,
): Promise<void> {
  const zip = new JSZip();
  const doc: TourProject = { version: 1, nodes, links, settings };
  zip.file(PROJECT_JSON, JSON.stringify(doc));
  const imgFolder = zip.folder('images')!;
  for (let i = 0; i < nodes.length; i++) {
    const blob = await getImage(nodes[i].imageId);
    // Las fotos ya son JPEG comprimidos: STORE (sin DEFLATE) es mucho más rápido
    // y apenas cambia el tamaño.
    if (blob) imgFolder.file(nodes[i].imageId, blob, { compression: 'STORE' });
    onProgress?.(
      (nodes.length ? (i + 1) / nodes.length : 1) * 0.5,
      i18n.t('export.progress.addingPhotos', { current: i + 1, total: nodes.length }),
    );
  }
  const out = await zip.generateAsync(
    { type: 'blob' },
    (meta) =>
      onProgress?.(0.5 + (meta.percent / 100) * 0.5, i18n.t('export.progress.packaging')),
  );
  onProgress?.(1, i18n.t('export.progress.downloading'));
  saveAs(out, `${slug(tourTitle(settings))}.vrtour.zip`);
}

export interface ImportedProject {
  project: TourProject;
  images: Record<string, Blob>;
}

export async function readProjectFile(
  file: File,
  onProgress?: ProgressFn,
): Promise<ImportedProject> {
  // Los ZIP empiezan por la firma «PK»; si no, es el formato JSON antiguo.
  const header = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (header[0] === 0x50 && header[1] === 0x4b) {
    return readProjectZip(file, onProgress);
  }
  return readLegacyProjectJson(file, onProgress);
}

async function readProjectZip(
  file: File,
  onProgress?: ProgressFn,
): Promise<ImportedProject> {
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file(PROJECT_JSON);
  if (!entry) throw new Error(i18n.t('export.error.invalidProject'));
  const doc = JSON.parse(await entry.async('string')) as TourProject;
  if (doc.version !== 1 || !Array.isArray(doc.nodes)) {
    throw new Error(i18n.t('export.error.invalidProject'));
  }
  const images: Record<string, Blob> = {};
  const imgEntries = zip.file(new RegExp(`^${IMAGES_DIR}`));
  for (let i = 0; i < imgEntries.length; i++) {
    const id = imgEntries[i].name.slice(IMAGES_DIR.length);
    if (id) images[id] = await imgEntries[i].async('blob');
    onProgress?.(
      imgEntries.length ? (i + 1) / imgEntries.length : 1,
      i18n.t('export.progress.readingPhotos', {
        current: i + 1,
        total: imgEntries.length,
      }),
    );
  }
  return {
    project: {
      version: 1,
      nodes: doc.nodes,
      links: doc.links ?? [],
      settings: doc.settings ?? DEFAULT_SETTINGS,
    },
    images,
  };
}

async function readLegacyProjectJson(
  file: File,
  onProgress?: ProgressFn,
): Promise<ImportedProject> {
  const text = await file.text();
  const doc = JSON.parse(text) as LegacyProjectFile;
  if (doc.version !== 1 || !Array.isArray(doc.nodes)) {
    throw new Error(i18n.t('export.error.invalidProject'));
  }
  const images: Record<string, Blob> = {};
  const entries = Object.entries(doc.images ?? {});
  for (let i = 0; i < entries.length; i++) {
    const [id, dataUrl] = entries[i];
    images[id] = await dataUrlToBlob(dataUrl);
    onProgress?.(
      entries.length ? (i + 1) / entries.length : 1,
      i18n.t('export.progress.readingPhotos', {
        current: i + 1,
        total: entries.length,
      }),
    );
  }
  return {
    project: {
      version: 1,
      nodes: doc.nodes,
      links: doc.links ?? [],
      settings: doc.settings ?? DEFAULT_SETTINGS,
    },
    images,
  };
}

// --- helpers --------------------------------------------------------------

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'vrtour'
  );
}

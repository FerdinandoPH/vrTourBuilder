import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TourProject } from '../types';

interface VRTourDB extends DBSchema {
  // Blobs de las fotos 360º, indexados por imageId.
  images: {
    key: string;
    value: Blob;
  };
  // Documento del proyecto (una sola clave "current").
  project: {
    key: string;
    value: TourProject;
  };
}

const DB_NAME = 'vrtourbuilder';
const DB_VERSION = 1;
const PROJECT_KEY = 'current';

let dbPromise: Promise<IDBPDatabase<VRTourDB>> | null = null;

function getDB(): Promise<IDBPDatabase<VRTourDB>> {
  if (!dbPromise) {
    dbPromise = openDB<VRTourDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images');
        }
        if (!db.objectStoreNames.contains('project')) {
          db.createObjectStore('project');
        }
      },
    });
  }
  return dbPromise;
}

// --- Imágenes -------------------------------------------------------------

// Las miniaturas se guardan en el mismo store con la clave del original + sufijo.
const THUMB_SUFFIX = '::thumb';
const thumbKey = (imageId: string) => imageId + THUMB_SUFFIX;

export async function putImage(imageId: string, blob: Blob): Promise<void> {
  const db = await getDB();
  await db.put('images', blob, imageId);
}

export async function getImage(imageId: string): Promise<Blob | undefined> {
  const db = await getDB();
  return db.get('images', imageId);
}

export async function putThumb(imageId: string, blob: Blob): Promise<void> {
  const db = await getDB();
  await db.put('images', blob, thumbKey(imageId));
}

export async function getThumb(imageId: string): Promise<Blob | undefined> {
  const db = await getDB();
  return db.get('images', thumbKey(imageId));
}

export async function deleteImage(imageId: string): Promise<void> {
  const db = await getDB();
  await db.delete('images', imageId);
  await db.delete('images', thumbKey(imageId));
}

// --- Proyecto -------------------------------------------------------------

export async function saveProject(project: TourProject): Promise<void> {
  const db = await getDB();
  await db.put('project', project, PROJECT_KEY);
}

export async function loadProject(): Promise<TourProject | undefined> {
  const db = await getDB();
  return db.get('project', PROJECT_KEY);
}

// Vacía por completo el proyecto: borra el documento y todas las imágenes.
export async function clearProject(): Promise<void> {
  const db = await getDB();
  await db.clear('images');
  await db.delete('project', PROJECT_KEY);
}

// Elimina imágenes que ya no están referenciadas por ningún nodo.
export async function pruneImages(keepImageIds: string[]): Promise<void> {
  const db = await getDB();
  const keys = await db.getAllKeys('images');
  const keep = new Set<string>();
  for (const id of keepImageIds) {
    keep.add(id);
    keep.add(thumbKey(id));
  }
  await Promise.all(
    keys.filter((k) => !keep.has(k)).map((k) => db.delete('images', k)),
  );
}

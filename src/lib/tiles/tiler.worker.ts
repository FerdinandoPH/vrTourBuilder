/// <reference lib="webworker" />
// Worker que trocea UNA foto 360º en teselas para EquirectangularTilesAdapter.
//
// 1. Si es un JPEG secuencial con dimensiones que encajan en bloques: recorte
//    SIN PÉRDIDA (mismos datos que el original, ver jpegLossless.ts).
// 2. Si no (PNG, JPEG progresivo, tamaño que no cuadra...): se decodifica y cada
//    tesela se recomprime a calidad alta.
// Además genera base.jpg, una versión pequeña que el visor muestra mientras
// llegan las teselas.
import {
  chooseGrid,
  losslessTiles,
  MAX_TILE,
  parseJpeg,
  UnsupportedJpegError,
  type TileGrid,
} from './jpegLossless';
import type { TileJob, TileJobResult } from './tileTypes';

const BASE_WIDTH = 2048;
const LOSSY_QUALITY = 0.95;
const BASE_QUALITY = 0.9;
// Margen de tolerancia para considerar una foto equirectangular completa (2:1).
const ASPECT_TOLERANCE = 0.01;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<TileJob>) => {
  const job = e.data;
  try {
    const result = await tilePhoto(job);
    const transfer = [...result.tiles.flat(), result.base];
    ctx.postMessage(result, transfer);
  } catch (err) {
    const fail: TileJobResult = {
      id: job.id,
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      tiles: [],
      base: new ArrayBuffer(0),
      cols: 0,
      rows: 0,
      width: 0,
      lossless: false,
    };
    ctx.postMessage(fail);
  }
};

async function tilePhoto(job: TileJob): Promise<TileJobResult> {
  const blob = new Blob([job.data], { type: job.type });
  let grid: TileGrid | null = null;
  let tiles: ArrayBuffer[][] | null = null;

  // 1) Sin pérdida.
  try {
    const bytes = new Uint8Array(job.data);
    const info = parseJpeg(bytes);
    grid = chooseGrid(info.width, info.height, Math.max(info.mcuW, info.mcuH));
    if (grid) {
      const res = losslessTiles(bytes, info, grid);
      tiles = res.tiles.map((col) => col.map((t) => t.buffer as ArrayBuffer));
    }
  } catch (err) {
    if (!(err instanceof UnsupportedJpegError)) {
      // JPEG dañado o raro: se intenta igualmente con el decodificador del navegador.
      console.warn('Troceado sin pérdida fallido, se recomprime:', err);
    }
    grid = null;
    tiles = null;
  }

  if (grid && tiles) {
    const base = await baseFromTiles(tiles, grid, grid.size * grid.cols, grid.size * grid.rows);
    return {
      id: job.id,
      ok: true,
      tiles,
      base,
      cols: grid.cols,
      rows: grid.rows,
      width: grid.size * grid.cols,
      lossless: true,
    };
  }

  // 2) Con recompresión.
  const bitmap = await createImageBitmap(blob);
  try {
    const { width: w, height: h } = bitmap;
    if (Math.abs(w / h - 2) > 2 * ASPECT_TOLERANCE) {
      throw new Error(`not-equirectangular ${w}x${h}`);
    }
    let cols = 2;
    while (w / cols > MAX_TILE && cols < 64) cols *= 2;
    const rows = cols / 2;
    // Teselas cuadradas de lado entero; si el tamaño no divide exacto, se escala
    // ligeramente (fracciones de píxel).
    const size = Math.round(w / cols);
    const out: ArrayBuffer[][] = [];
    const canvas = new OffscreenCanvas(size, size);
    const g = canvas.getContext('2d')!;
    for (let c = 0; c < cols; c++) {
      out.push([]);
      for (let r = 0; r < rows; r++) {
        g.clearRect(0, 0, size, size);
        g.drawImage(bitmap, (c * w) / cols, (r * h) / rows, w / cols, h / rows, 0, 0, size, size);
        const tb = await canvas.convertToBlob({ type: 'image/jpeg', quality: LOSSY_QUALITY });
        out[c].push(await tb.arrayBuffer());
      }
    }
    const base = await encodeBase(bitmap, size * cols, size * rows);
    return { id: job.id, ok: true, tiles: out, base, cols, rows, width: size * cols, lossless: false };
  } finally {
    bitmap.close();
  }
}

function baseSize(width: number, height: number): [number, number] {
  const bw = Math.min(BASE_WIDTH, width);
  return [bw, Math.round((bw * height) / width)];
}

// base.jpg a partir de las propias teselas: cada una se decodifica ya reducida, sin
// necesidad de decodificar la foto entera (que puede ocupar cientos de MB en memoria).
async function baseFromTiles(
  tiles: ArrayBuffer[][],
  grid: TileGrid,
  width: number,
  height: number,
): Promise<ArrayBuffer> {
  const [bw, bh] = baseSize(width, height);
  const canvas = new OffscreenCanvas(bw, bh);
  const g = canvas.getContext('2d')!;
  const tw = bw / grid.cols;
  const th = bh / grid.rows;
  for (let c = 0; c < grid.cols; c++) {
    for (let r = 0; r < grid.rows; r++) {
      const bmp = await createImageBitmap(new Blob([tiles[c][r]], { type: 'image/jpeg' }), {
        resizeWidth: Math.ceil(tw),
        resizeHeight: Math.ceil(th),
        resizeQuality: 'high',
      });
      g.drawImage(bmp, c * tw, r * th, tw, th);
      bmp.close();
    }
  }
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: BASE_QUALITY });
  return blob.arrayBuffer();
}

async function encodeBase(bitmap: ImageBitmap, width: number, height: number): Promise<ArrayBuffer> {
  const [bw, bh] = baseSize(width, height);
  const small = await createImageBitmap(bitmap, {
    resizeWidth: bw,
    resizeHeight: bh,
    resizeQuality: 'high',
  });
  const canvas = new OffscreenCanvas(bw, bh);
  canvas.getContext('2d')!.drawImage(small, 0, 0);
  small.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: BASE_QUALITY });
  return blob.arrayBuffer();
}

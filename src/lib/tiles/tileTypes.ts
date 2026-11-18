// Mensajes entre el hilo principal y tiler.worker.ts.

export interface TileJob {
  id: number;
  data: ArrayBuffer; // bytes de la foto original
  type: string; // MIME de la foto
}

export interface TileJobResult {
  id: number;
  ok: boolean;
  reason?: string; // si !ok
  tiles: ArrayBuffer[][]; // tiles[col][row]
  base: ArrayBuffer; // base.jpg
  cols: number;
  rows: number;
  width: number; // ancho completo de la panorámica (alto = width / 2)
  lossless: boolean; // true si las teselas son un recorte exacto del original
}

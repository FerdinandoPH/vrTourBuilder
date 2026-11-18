// Trocea varias fotos en paralelo con un pequeño grupo de Workers.
import TilerWorker from './tiler.worker.ts?worker&inline';
import type { TileJob, TileJobResult } from './tileTypes';

export type TiledPhoto = TileJobResult;

export interface TileInput<K> {
  key: K;
  blob: Blob;
}

// Cada trabajo puede ocupar ~100-300 MB (foto + coeficientes + teselas), así que
// se limita el paralelismo aunque haya muchos núcleos.
function poolSize(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(4, cores - 1));
}

// Devuelve el resultado de cada foto (ok o con `reason`) en el mismo orden.
// `onDone(n)` se llama cada vez que termina una foto.
export async function tilePhotos<K>(
  inputs: TileInput<K>[],
  onDone?: (done: number, total: number) => void,
): Promise<Map<K, TiledPhoto>> {
  const results = new Map<K, TiledPhoto>();
  if (!inputs.length) return results;
  const workers = Array.from({ length: Math.min(poolSize(), inputs.length) }, () => new TilerWorker());
  let next = 0;
  let done = 0;

  const run = (worker: Worker): Promise<void> =>
    new Promise((resolve) => {
      const step = async () => {
        const i = next++;
        if (i >= inputs.length) {
          resolve();
          return;
        }
        const { key, blob } = inputs[i];
        const data = await blob.arrayBuffer();
        const job: TileJob = { id: i, data, type: blob.type || 'image/jpeg' };
        worker.onmessage = (e: MessageEvent<TileJobResult>) => {
          results.set(key, e.data);
          onDone?.(++done, inputs.length);
          void step();
        };
        worker.onerror = (e) => {
          results.set(key, {
            id: i,
            ok: false,
            reason: e.message || 'worker error',
            tiles: [],
            base: new ArrayBuffer(0),
            cols: 0,
            rows: 0,
            width: 0,
            lossless: false,
          });
          onDone?.(++done, inputs.length);
          void step();
        };
        worker.postMessage(job, [data]);
      };
      void step();
    });

  try {
    await Promise.all(workers.map(run));
  } finally {
    workers.forEach((w) => w.terminate());
  }
  return results;
}

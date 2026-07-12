import { useEffect, useState } from 'react';
import { getImage, getThumb, putThumb } from '../store/persistence';
import { makeThumbnail } from './thumbnails';

// Caché de object URLs por imageId, compartida en toda la app para no recrear
// (ni fugar) URLs de blobs pesados de 360º.
const urlCache = new Map<string, string>();
// Caché separada para las miniaturas.
const thumbCache = new Map<string, string>();

export async function resolveImageUrl(imageId: string): Promise<string | null> {
  const cached = urlCache.get(imageId);
  if (cached) return cached;
  const blob = await getImage(imageId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(imageId, url);
  return url;
}

// Devuelve el object URL de la MINIATURA. Si aún no existe (proyecto antiguo o
// importado), la genera al vuelo a partir del original y la persiste.
export async function resolveThumbUrl(imageId: string): Promise<string | null> {
  const cached = thumbCache.get(imageId);
  if (cached) return cached;

  let blob = await getThumb(imageId);
  if (!blob) {
    const full = await getImage(imageId);
    if (!full) return null;
    try {
      blob = await makeThumbnail(full);
      await putThumb(imageId, blob);
    } catch {
      blob = full; // respaldo: usa el original si no se puede miniaturizar
    }
  }
  const url = URL.createObjectURL(blob);
  thumbCache.set(imageId, url);
  return url;
}

// Invalida los URLs cacheados (p.ej. al borrar un nodo).
export function revokeImageUrl(imageId: string): void {
  for (const cache of [urlCache, thumbCache]) {
    const url = cache.get(imageId);
    if (url) {
      URL.revokeObjectURL(url);
      cache.delete(imageId);
    }
  }
}

// Hook genérico sobre un resolvedor + caché.
function useResolvedUrl(
  imageId: string | null | undefined,
  cache: Map<string, string>,
  resolver: (id: string) => Promise<string | null>,
): string | null {
  const [url, setUrl] = useState<string | null>(
    imageId ? cache.get(imageId) ?? null : null,
  );
  useEffect(() => {
    let alive = true;
    if (!imageId) {
      setUrl(null);
      return;
    }
    void resolver(imageId).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [imageId]);
  return url;
}

// Hook de React: object URL de la imagen a resolución completa (para el visor).
export function useImageUrl(imageId: string | null | undefined): string | null {
  return useResolvedUrl(imageId, urlCache, resolveImageUrl);
}

// Hook de React: object URL de la miniatura (para la galería de tarjetas).
export function useThumbUrl(imageId: string | null | undefined): string | null {
  return useResolvedUrl(imageId, thumbCache, resolveThumbUrl);
}

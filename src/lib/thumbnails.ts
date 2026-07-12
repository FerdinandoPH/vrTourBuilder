// Genera una miniatura reducida (JPEG) a partir del blob de una foto 360º, para
// no renderizar equirectangulares de varios MB en las tarjetas de la galería.
export async function makeThumbnail(
  source: Blob,
  maxWidth = 480,
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, maxWidth / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return source;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.75),
    );
    return blob ?? source;
  } finally {
    bitmap.close();
  }
}

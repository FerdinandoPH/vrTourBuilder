import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Viewer, type PluginConstructor } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { VirtualTourPlugin } from '@photo-sphere-viewer/virtual-tour-plugin';
import { GalleryPlugin } from '@photo-sphere-viewer/gallery-plugin';
import { useTourStore } from '../store/tourStore';
import { resolveImageUrl, resolveThumbUrl } from '../lib/imageUrls';
import { getStartNodeId } from '../lib/exportTour';
import { linkVisibleFrom, posFrom } from '../types';

export default function PreviewTour() {
  const { t } = useTranslation();
  const nodes = useTourStore((s) => s.nodes);
  const links = useTourStore((s) => s.links);
  const gallery = useTourStore((s) => s.settings.gallery);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return;
    let viewer: Viewer | null = null;
    let cancelled = false;

    (async () => {
      // Resuelve los blob URLs de todas las fotos y construye los nodos del plugin.
      const tourNodes = await Promise.all(
        nodes.map(async (n) => {
          const url = await resolveImageUrl(n.imageId);
          const thumb = gallery ? await resolveThumbUrl(n.imageId) : null;
          const nodeLinks = links
            .filter(
              (l) =>
                (l.aNodeId === n.id || l.bNodeId === n.id) &&
                linkVisibleFrom(l, n.id),
            )
            .map((l) => {
              const other = l.aNodeId === n.id ? l.bNodeId : l.aNodeId;
              const pos = posFrom(l, n.id);
              // En modo manual el enlace necesita posición: omite los incompletos.
              return pos
                ? { nodeId: other, position: { yaw: pos.yaw, pitch: pos.pitch } }
                : null;
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);
          return {
            id: n.id,
            name: n.name,
            panorama: url ?? '',
            ...(thumb ? { thumbnail: thumb } : {}),
            links: nodeLinks,
          };
        }),
      );

      if (cancelled || !containerRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plugins: any[] = [MarkersPlugin];
      if (gallery) {
        plugins.push([
          GalleryPlugin as PluginConstructor,
          { thumbnailSize: { width: 150, height: 75 } },
        ]);
      }
      plugins.push([
        VirtualTourPlugin,
        {
          positionMode: 'manual',
          renderMode: '2d',
          nodes: tourNodes,
          startNodeId: getStartNodeId(nodes),
        },
      ]);

      // Vista inicial del nodo de arranque, aplicada como orientación por defecto
      // del visor (PSV ya armoniza el ángulo al navegar entre nodos, así que no
      // hace falta reorientar en cada nodo).
      const startView = nodes.find((n) => n.id === getStartNodeId(nodes))?.initView;

      try {
        viewer = new Viewer({
          container: containerRef.current,
          plugins,
          ...(startView
            ? { defaultYaw: startView.yaw, defaultPitch: startView.pitch }
            : {}),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      viewer?.destroy();
    };
  }, [nodes, links, gallery]);

  if (nodes.length === 0) {
    return <div className="empty">{t('preview.empty')}</div>;
  }

  return (
    <div className="preview-wrap">
      <div ref={containerRef} className="preview-canvas" />
      {error && (
        <div className="viewer-hint">{t('preview.error', { error })}</div>
      )}
    </div>
  );
}

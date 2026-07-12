import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Viewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { useTourStore } from '../store/tourStore';
import { resolveImageUrl } from '../lib/imageUrls';
import { isLinkComplete, linkOtherNodeId, linkVisibleFrom, posFrom } from '../types';
import ConnectionPanel from './ConnectionPanel';

// Marcador visual simple (círculo) inyectado como HTML en PSV.
const markerHtml = (color: string) =>
  `<div style="width:26px;height:26px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.4);"></div>`;

export default function NodeEditor() {
  const { t } = useTranslation();
  const nodes = useTourStore((s) => s.nodes);
  const links = useTourStore((s) => s.links);
  const activeNodeId = useTourStore((s) => s.activeNodeId);
  const setActiveNode = useTourStore((s) => s.setActiveNode);
  const setLinkPos = useTourStore((s) => s.setLinkPos);

  const activeNode = nodes.find((n) => n.id === activeNodeId) ?? null;

  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const markersRef = useRef<MarkersPlugin | null>(null);
  // Enlace armado para capturar el próximo clic (o null). Ref para leerlo dentro
  // del handler de PSV sin recrear el listener.
  const [armedLinkId, setArmedLinkId] = useState<string | null>(null);
  const armedRef = useRef<string | null>(null);
  armedRef.current = armedLinkId;

  // Enlaces del nodo activo.
  const nodeLinks = useMemo(
    () =>
      activeNode
        ? links.filter(
            (l) => l.aNodeId === activeNode.id || l.bNodeId === activeNode.id,
          )
        : [],
    [links, activeNode],
  );

  // Crea el visor una sola vez.
  useEffect(() => {
    if (!containerRef.current) return;
    const viewer = new Viewer({
      container: containerRef.current,
      plugins: [MarkersPlugin],
      navbar: ['zoom', 'move', 'fullscreen'],
    });
    viewerRef.current = viewer;
    markersRef.current = viewer.getPlugin<MarkersPlugin>(MarkersPlugin);

    viewer.addEventListener('click', ({ data }) => {
      const linkId = armedRef.current;
      if (!linkId || !activeNodeIdRef.current) return;
      setLinkPos(linkId, activeNodeIdRef.current, {
        yaw: data.yaw,
        pitch: data.pitch,
      });
      setArmedLinkId(null);
    });

    return () => {
      viewer.destroy();
      viewerRef.current = null;
      markersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mantén el id del nodo activo accesible dentro del handler.
  const activeNodeIdRef = useRef<string | null>(activeNodeId);
  activeNodeIdRef.current = activeNodeId;

  // Cancela la colocación de marcador con la tecla Esc.
  useEffect(() => {
    if (!armedLinkId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setArmedLinkId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armedLinkId]);

  // Cambia el panorama solo cuando cambia la imagen activa. Dependemos de
  // `imageId` (no del objeto `activeNode`, que se recrea al renombrar) para no
  // recargar el panorama en cada pulsación de tecla.
  const activeImageId = activeNode?.imageId ?? null;
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !activeImageId) return;
    let cancelled = false;
    void resolveImageUrl(activeImageId).then((url) => {
      if (url && !cancelled) void viewer.setPanorama(url, { showLoader: true });
    });
    return () => {
      cancelled = true;
    };
  }, [activeImageId]);

  // Redibuja los marcadores existentes del nodo activo cada vez que cambian.
  useEffect(() => {
    const markers = markersRef.current;
    if (!markers || !activeNode) return;
    const list = nodeLinks
      .map((l) => {
        // Una conexión de solo ida dirigida hacia el nodo activo no se ve aquí.
        if (!linkVisibleFrom(l, activeNode.id)) return null;
        const pos = posFrom(l, activeNode.id);
        if (!pos) return null;
        return {
          id: l.id,
          position: { yaw: pos.yaw, pitch: pos.pitch },
          html: markerHtml('#4f8cff'),
          anchor: 'center center',
          tooltip: nodes.find((n) => n.id === linkOtherNodeId(l, activeNode.id))
            ?.name,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    try {
      markers.setMarkers(list);
    } catch {
      /* el visor aún no está listo */
    }
  }, [nodeLinks, activeNode, nodes]);

  if (nodes.length === 0) {
    return <div className="empty">{t('editor.emptyUpload')}</div>;
  }

  return (
    <div className="editor">
      <aside className="sidebar">
        <h3>{t('editor.nodesTitle')}</h3>
        {nodes.map((n) => {
          const nodeConnections = links.filter(
            (l) => l.aNodeId === n.id || l.bNodeId === n.id,
          );
          // Punto violeta si el nodo no tiene ninguna conexión (huérfano);
          // punto amarillo (aviso) si tiene marcadores pendientes.
          const noConn = nodeConnections.length === 0;
          const warn = nodeConnections.some((l) => !isLinkComplete(l));
          return (
            <div
              key={n.id}
              className={`node-item${n.id === activeNodeId ? ' active' : ''}${
                noConn ? ' hasNoConn' : warn ? ' hasWarn' : ''
              }`}
              onClick={() => {
                setActiveNode(n.id);
                setArmedLinkId(null);
              }}
            >
              <span className="dot" />
              <span className="nm">{n.name}</span>
              {n.startNode && <span className="pill start">{t('editor.startPill')}</span>}
            </div>
          );
        })}
      </aside>

      <div className="viewer-wrap">
        <div ref={containerRef} className="viewer-canvas" />
        {armedLinkId && (
          <div className="viewer-hint">
            {t('editor.placeMarkerHint', {
              name: (() => {
                const l = links.find((x) => x.id === armedLinkId);
                const other = l && activeNode
                  ? linkOtherNodeId(l, activeNode.id)
                  : null;
                return nodes.find((n) => n.id === other)?.name ?? '';
              })(),
            })}{' '}
            · <span className="muted">{t('editor.escToCancel')}</span>
          </div>
        )}
      </div>

      {activeNode && (
        <ConnectionPanel
          node={activeNode}
          armedLinkId={armedLinkId}
          onArm={(linkId) => setArmedLinkId((cur) => (cur === linkId ? null : linkId))}
        />
      )}
    </div>
  );
}

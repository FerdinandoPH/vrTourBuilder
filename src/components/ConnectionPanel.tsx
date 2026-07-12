import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTourStore } from '../store/tourStore';
import {
  dirForSource,
  linkOtherNodeId,
  linkVisibleFrom,
  posFrom,
  type TourNode,
} from '../types';

interface Props {
  node: TourNode;
  armedLinkId: string | null;
  onArm: (linkId: string) => void;
}

export default function ConnectionPanel({ node, armedLinkId, onArm }: Props) {
  const { t } = useTranslation();
  const nodes = useTourStore((s) => s.nodes);
  const links = useTourStore((s) => s.links);
  const addLink = useTourStore((s) => s.addLink);
  const removeLink = useTourStore((s) => s.removeLink);
  const setLinkDir = useTourStore((s) => s.setLinkDir);
  const renameNode = useTourStore((s) => s.renameNode);
  const [pick, setPick] = useState('');

  const nodeLinks = links.filter(
    (l) => l.aNodeId === node.id || l.bNodeId === node.id,
  );
  const connectedIds = new Set(nodeLinks.map((l) => linkOtherNodeId(l, node.id)));
  const candidates = nodes.filter(
    (n) => n.id !== node.id && !connectedIds.has(n.id),
  );
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;

  return (
    <div className="connpanel">
      <label className="namefield">
        <span>{t('node.visibleName')}</span>
        <input
          type="text"
          value={node.name}
          onChange={(e) => renameNode(node.id, e.target.value)}
          placeholder={t('connections.namePlaceholder')}
        />
      </label>

      <h3>{t('connections.title')}</h3>

      {nodeLinks.length === 0 && (
        <p className="muted">{t('connections.none')}</p>
      )}

      {nodeLinks.map((l) => {
        const otherId = linkOtherNodeId(l, node.id);
        const visible = linkVisibleFrom(l, node.id);

        // Conexión de solo ida dirigida hacia este nodo (el otro es el origen):
        // no es visible aquí. Se muestra atenuada y solo permite revertirla.
        if (!visible) {
          return (
            <div className="conn incoming" key={l.id}>
              <div className="top">
                <span className="name">← {nameOf(otherId)}</span>
                <button
                  className="danger"
                  onClick={() => removeLink(l.id)}
                  title={t('connections.removeTitle')}
                >
                  ✕
                </button>
              </div>
              <div className="status">
                <span className="muted" style={{ fontSize: 11 }}>
                  {t('connections.onlyFrom', { name: nameOf(otherId) })}
                </span>
                <button onClick={() => setLinkDir(l.id, 'both')}>
                  {t('connections.makeBidirectional')}
                </button>
              </div>
            </div>
          );
        }

        const oneWay = l.dir === 'aToB' || l.dir === 'bToA';
        const here = posFrom(l, node.id); // marcador desde este nodo
        const there = node.id === l.aNodeId ? l.posFromB : l.posFromA; // desde el otro
        const armed = armedLinkId === l.id;
        return (
          <div className="conn" key={l.id}>
            <div className="top">
              <span className="name">
                {oneWay ? '→' : '↔'} {nameOf(otherId)}
              </span>
              <button
                className="danger"
                onClick={() => removeLink(l.id)}
                title={t('connections.removeTitle')}
              >
                ✕
              </button>
            </div>
            <div className="dir">
              <button
                className={!oneWay ? 'primary' : ''}
                onClick={() => setLinkDir(l.id, 'both')}
                title={t('connections.bidirectionalTitle')}
              >
                ↔ {t('connections.bidirectional')}
              </button>
              <button
                className={oneWay ? 'primary' : ''}
                onClick={() => setLinkDir(l.id, dirForSource(l, node.id))}
                title={t('connections.oneWayTitle')}
              >
                → {t('connections.oneWay')}
              </button>
            </div>
            <div className="status">
              <div className={`st-row ${here ? 'done' : 'todo'}`}>
                <span>
                  <span className="ico">{here ? '✓' : '⚠'}</span>
                  {t('connections.markerFromHere')}
                </span>
                <button
                  className={armed ? 'primary' : ''}
                  onClick={() => onArm(l.id)}
                >
                  {armed
                    ? t('connections.clicking')
                    : here
                      ? t('connections.replace')
                      : t('connections.place')}
                </button>
              </div>
              {!oneWay && (
                <div className={`st-row ${there ? 'done' : 'todo'}`}>
                  <span>
                    <span className="ico">{there ? '✓' : '⚠'}</span>
                    {t('connections.markerFrom', { name: nameOf(otherId) })}
                  </span>
                  {!there && (
                    <span className="muted" style={{ fontSize: 11 }}>
                      {t('connections.pendingThere')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="addconn">
        <select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">{t('connections.addPlaceholder')}</option>
          {candidates.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <button
          className="primary"
          disabled={!pick}
          onClick={() => {
            if (pick) {
              addLink(node.id, pick);
              setPick('');
            }
          }}
        >
          {t('connections.add')}
        </button>
      </div>
    </div>
  );
}

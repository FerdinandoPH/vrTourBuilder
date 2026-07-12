import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTourStore } from '../store/tourStore';
import { useThumbUrl } from '../lib/imageUrls';
import type { TourNode } from '../types';

export default function NodeList({ onOpenEditor }: { onOpenEditor: () => void }) {
  const { t } = useTranslation();
  const nodes = useTourStore((s) => s.nodes);
  const addPhoto = useTourStore((s) => s.addPhoto);
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) await addPhoto(file);
    }
  };

  return (
    <div className="nodelist">
      <div className="nodelist-head">
        <h2>{t('nodeList.heading', { count: nodes.length })}</h2>
        <span className="muted">{t('nodeList.subtitle')}</span>
      </div>

      <div
        className={`drop${over ? ' over' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
      >
        {t('nodeList.dropzone')}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {nodes.length === 0 ? (
        <div className="empty">{t('nodeList.empty')}</div>
      ) : (
        <div className="cards">
          {nodes.map((n) => (
            <NodeCard key={n.id} node={n} onOpenEditor={onOpenEditor} />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeCard({
  node,
  onOpenEditor,
}: {
  node: TourNode;
  onOpenEditor: () => void;
}) {
  const { t } = useTranslation();
  const url = useThumbUrl(node.imageId);
  const renameNode = useTourStore((s) => s.renameNode);
  const setFileName = useTourStore((s) => s.setFileName);
  const deleteNode = useTourStore((s) => s.deleteNode);
  const setStartNode = useTourStore((s) => s.setStartNode);
  const setActiveNode = useTourStore((s) => s.setActiveNode);

  return (
    <div className="card">
      {url ? (
        <img className="thumb" src={url} alt={node.name} />
      ) : (
        <div className="thumb" />
      )}
      <div className="body">
        <div>
          <label>{t('node.visibleName')}</label>
          <input
            type="text"
            value={node.name}
            onChange={(e) => renameNode(node.id, e.target.value)}
          />
        </div>
        <div>
          <label>{t('node.fileInPano')}</label>
          <input
            type="text"
            value={node.fileName}
            onChange={(e) => setFileName(node.id, e.target.value)}
          />
        </div>
        <div className="row">
          {node.startNode ? (
            <span className="pill start">● {t('node.startNodePill')}</span>
          ) : (
            <button onClick={() => setStartNode(node.id)}>{t('node.markStart')}</button>
          )}
        </div>
        <div className="actions">
          <button
            className="primary"
            onClick={() => {
              setActiveNode(node.id);
              onOpenEditor();
            }}
          >
            {t('node.editConnections')}
          </button>
          <button
            className="danger"
            onClick={() => {
              if (confirm(t('node.deleteConfirm', { name: node.name })))
                void deleteNode(node.id);
            }}
          >
            {t('node.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

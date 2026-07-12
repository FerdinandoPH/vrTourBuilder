import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTourStore } from '../store/tourStore';
import { validateProject } from '../lib/validation';
import {
  downloadProject,
  downloadTourZip,
  readProjectFile,
} from '../lib/buildZip';

export default function ExportBar() {
  const { t } = useTranslation();
  const nodes = useTourStore((s) => s.nodes);
  const links = useTourStore((s) => s.links);
  const settings = useTourStore((s) => s.settings);
  const replaceProject = useTourStore((s) => s.replaceProject);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(
    null,
  );
  const importRef = useRef<HTMLInputElement>(null);

  const issues = validateProject(nodes, links);
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const ready = errors.length === 0 && nodes.length > 0;

  const handleExportZip = async () => {
    setBusy(true);
    setProgress({ pct: 0, label: t('export.progress.preparing') });
    try {
      await downloadTourZip(nodes, links, settings, (fraction, label) =>
        setProgress({ pct: Math.round(fraction * 100), label }),
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleExportProject = async () => {
    setBusy(true);
    setProgress({ pct: 0, label: t('export.progress.preparing') });
    try {
      await downloadProject(nodes, links, settings, (fraction, label) =>
        setProgress({ pct: Math.round(fraction * 100), label }),
      );
    } catch (e) {
      alert(t('export.alertDraftFailed', { error: e instanceof Error ? e.message : e }));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setProgress({ pct: 0, label: t('export.progress.reading') });
    try {
      const { project, images } = await readProjectFile(file, (fraction, label) =>
        setProgress({ pct: Math.round(fraction * 100), label }),
      );
      setProgress({ pct: 100, label: t('export.progress.loading') });
      await replaceProject(project, images);
    } catch (e) {
      alert(t('export.alertImportFailed', { error: e instanceof Error ? e.message : e }));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="exportbar">
      <span className="status">
        {ready ? (
          <span className="pill ok">{t('export.ready')}</span>
        ) : (
          <span className="pill warn">
            {t('export.problems', { count: errors.length })}
          </span>
        )}
      </span>

      <button onClick={() => setOpen((o) => !o)} disabled={busy}>
        {t('export.projectMenu')} ▾
      </button>

      {progress ? (
        <div className="progress" title={progress.label}>
          <div className="progress-bar" style={{ width: `${progress.pct}%` }} />
          <span className="progress-label">
            {progress.label} {progress.pct}%
          </span>
        </div>
      ) : (
        <button
          className="primary"
          disabled={!ready || busy}
          onClick={handleExportZip}
          title={ready ? t('export.exportZipTitleReady') : t('export.exportZipTitleNotReady')}
        >
          {t('export.exportZip')}
        </button>
      )}

      {open && (
        <div className="export-pop">
          <h4>{t('export.draftHeading')}</h4>
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <button
              disabled={nodes.length === 0 || busy}
              onClick={() => void handleExportProject()}
              title={t('export.exportDraftTitle')}
            >
              {t('export.exportDraft')}
            </button>
            <button
              onClick={() => importRef.current?.click()}
              disabled={busy}
              title={t('export.importDraftTitle')}
            >
              {t('export.importDraft')}
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".zip,.json,application/zip,application/json"
              hidden
              onChange={(e) => {
                void handleImport(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>

          <h4>{t('export.validation')}</h4>
          {issues.length === 0 && (
            <div className="issue" style={{ color: 'var(--ok)' }}>
              ✓ {t('export.allGood')}
            </div>
          )}
          {errors.map((i, k) => (
            <div className="issue error" key={`e${k}`}>
              ✕ {t(i.key, i.params)}
            </div>
          ))}
          {warnings.map((i, k) => (
            <div className="issue warning" key={`w${k}`}>
              ⚠ {t(i.key, i.params)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

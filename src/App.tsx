import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTourStore } from './store/tourStore';
import { incompleteLinkCount } from './lib/validation';
import NodeList from './components/NodeList';
import NodeEditor from './components/NodeEditor';
import GraphView from './components/GraphView';
import PreviewTour from './components/PreviewTour';
import Settings from './components/Settings';
import ExportBar from './components/ExportBar';
import LanguageSwitcher from './components/LanguageSwitcher';
import './styles/app.css';

type Tab = 'nodes' | 'editor' | 'graph' | 'preview' | 'settings';

const TABS: Tab[] = ['nodes', 'editor', 'graph', 'preview', 'settings'];

export default function App() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('nodes');
  const init = useTourStore((s) => s.init);
  const loaded = useTourStore((s) => s.loaded);
  const links = useTourStore((s) => s.links);
  const nodes = useTourStore((s) => s.nodes);
  const newProject = useTourStore((s) => s.newProject);
  const incomplete = incompleteLinkCount(links);

  useEffect(() => {
    void init();
  }, [init]);

  const handleNewProject = () => {
    const empty = nodes.length === 0 && links.length === 0;
    if (!empty && !window.confirm(t('app.newProjectConfirm'))) {
      return;
    }
    void newProject();
    setTab('nodes');
  };

  if (!loaded) {
    return <div className="empty">{t('app.loading')}</div>;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          VR<span>Tour</span>Builder
        </div>
        <button
          className="danger"
          onClick={handleNewProject}
          title={t('app.newProjectTitle')}
        >
          {t('app.newProject')}
        </button>
        <nav className="tabs">
          {TABS.map((id) => (
            <button
              key={id}
              className={`tab${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
            >
              {t(`tabs.${id}`)}
              {id === 'editor' && incomplete > 0 && (
                <span className="badge" title={t('app.pendingMarkers')}>
                  {incomplete}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <LanguageSwitcher />
        <ExportBar />
      </header>

      <main className="content">
        {tab === 'nodes' && <NodeList onOpenEditor={() => setTab('editor')} />}
        {tab === 'editor' && <NodeEditor />}
        {tab === 'graph' && <GraphView onOpenNode={() => setTab('editor')} />}
        {tab === 'preview' && <PreviewTour />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  );
}

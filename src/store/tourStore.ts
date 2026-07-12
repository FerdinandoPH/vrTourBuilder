import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  type ExportLang,
  type LinkDir,
  type MarkerPos,
  type TourLink,
  type TourNode,
  type TourProject,
  type TourSettings,
} from '../types';
import {
  clearProject,
  deleteImage,
  loadProject,
  pruneImages,
  putImage,
  putThumb,
  saveProject,
} from './persistence';
import { makeThumbnail } from '../lib/thumbnails';
import i18n from '../i18n';

// Idioma de la interfaz, usado como valor inicial del idioma del tour exportado.
function appLang(): ExportLang {
  return i18n.resolvedLanguage === 'en' ? 'en' : 'es';
}

// Normaliza la config cargada/importada: rellena `lang` con el idioma de la app
// para proyectos antiguos que se guardaron antes de existir esta opción.
function withDefaults(settings?: Partial<TourSettings>): TourSettings {
  return { ...DEFAULT_SETTINGS, ...settings, lang: settings?.lang ?? appLang() };
}

let idCounter = 0;
function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

// Deriva un fileName seguro para ./pano a partir del nombre de archivo original.
export function sanitizeFileName(original: string): string {
  const dot = original.lastIndexOf('.');
  const ext = dot >= 0 ? original.slice(dot).toLowerCase() : '.jpg';
  const base = (dot >= 0 ? original.slice(0, dot) : original)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'pano';
  return base + ext;
}

interface TourState {
  nodes: TourNode[];
  links: TourLink[];
  settings: TourSettings;
  activeNodeId: string | null; // nodo abierto en el editor
  loaded: boolean;

  // Ciclo de vida
  init: () => Promise<void>;

  // Configuración
  setName: (name: string) => void;
  setGallery: (enabled: boolean) => void;
  setLang: (lang: ExportLang) => void;

  // Nodos
  addPhoto: (file: File) => Promise<void>;
  renameNode: (id: string, name: string) => void;
  setFileName: (id: string, fileName: string) => void;
  deleteNode: (id: string) => Promise<void>;
  setStartNode: (id: string) => void;
  setActiveNode: (id: string | null) => void;

  // Enlaces
  addLink: (aNodeId: string, bNodeId: string) => void;
  removeLink: (linkId: string) => void;
  setLinkPos: (linkId: string, fromNodeId: string, pos: MarkerPos) => void;
  setLinkDir: (linkId: string, dir: LinkDir) => void;

  // Proyecto
  newProject: () => Promise<void>;
  replaceProject: (
    project: TourProject,
    images: Record<string, Blob>,
  ) => Promise<void>;
}

function serialize(
  state: Pick<TourState, 'nodes' | 'links' | 'settings'>,
): TourProject {
  return {
    version: 1,
    nodes: state.nodes,
    links: state.links,
    settings: state.settings,
  };
}

export const useTourStore = create<TourState>((set, get) => {
  // Autoguardado: persiste el documento cada vez que cambian nodos/enlaces/config.
  const persist = () => {
    const { nodes, links, settings, loaded } = get();
    if (!loaded) return;
    void saveProject(serialize({ nodes, links, settings }));
  };

  return {
    nodes: [],
    links: [],
    settings: DEFAULT_SETTINGS,
    activeNodeId: null,
    loaded: false,

    init: async () => {
      const project = await loadProject();
      if (project) {
        set({
          nodes: project.nodes,
          links: project.links,
          settings: withDefaults(project.settings),
          activeNodeId: project.nodes[0]?.id ?? null,
          loaded: true,
        });
      } else {
        set({ loaded: true });
      }
    },

    setName: (name) => {
      set((s) => ({ settings: { ...s.settings, name } }));
      persist();
    },

    setGallery: (enabled) => {
      set((s) => ({ settings: { ...s.settings, gallery: enabled } }));
      persist();
    },

    setLang: (lang) => {
      set((s) => ({ settings: { ...s.settings, lang } }));
      persist();
    },

    addPhoto: async (file) => {
      const imageId = uid('img');
      await putImage(imageId, file);
      // Miniatura reducida para la galería (no bloquea si falla).
      try {
        await putThumb(imageId, await makeThumbnail(file));
      } catch {
        /* si la decodificación falla, la galería usará el original como respaldo */
      }
      const node: TourNode = {
        id: uid('node'),
        name: file.name.replace(/\.[^.]+$/, ''),
        fileName: sanitizeFileName(file.name),
        imageId,
        startNode: get().nodes.length === 0, // el primero es el inicial por defecto
      };
      set((s) => ({
        nodes: [...s.nodes, node],
        activeNodeId: s.activeNodeId ?? node.id,
      }));
      persist();
    },

    renameNode: (id, name) => {
      set((s) => ({
        nodes: s.nodes.map((n) => (n.id === id ? { ...n, name } : n)),
      }));
      persist();
    },

    setFileName: (id, fileName) => {
      set((s) => ({
        nodes: s.nodes.map((n) => (n.id === id ? { ...n, fileName } : n)),
      }));
      persist();
    },

    deleteNode: async (id) => {
      const node = get().nodes.find((n) => n.id === id);
      if (node) await deleteImage(node.imageId);
      set((s) => {
        const nodes = s.nodes.filter((n) => n.id !== id);
        // Reasigna nodo inicial si borramos el que lo era.
        if (node?.startNode && nodes.length > 0 && !nodes.some((n) => n.startNode)) {
          nodes[0] = { ...nodes[0], startNode: true };
        }
        return {
          nodes,
          links: s.links.filter((l) => l.aNodeId !== id && l.bNodeId !== id),
          activeNodeId: s.activeNodeId === id ? (nodes[0]?.id ?? null) : s.activeNodeId,
        };
      });
      persist();
    },

    setStartNode: (id) => {
      set((s) => ({
        nodes: s.nodes.map((n) => ({ ...n, startNode: n.id === id })),
      }));
      persist();
    },

    setActiveNode: (id) => set({ activeNodeId: id }),

    addLink: (aNodeId, bNodeId) => {
      if (aNodeId === bNodeId) return;
      const exists = get().links.some(
        (l) =>
          (l.aNodeId === aNodeId && l.bNodeId === bNodeId) ||
          (l.aNodeId === bNodeId && l.bNodeId === aNodeId),
      );
      if (exists) return;
      const link: TourLink = { id: uid('link'), aNodeId, bNodeId };
      set((s) => ({ links: [...s.links, link] }));
      persist();
    },

    removeLink: (linkId) => {
      set((s) => ({ links: s.links.filter((l) => l.id !== linkId) }));
      persist();
    },

    setLinkPos: (linkId, fromNodeId, pos) => {
      set((s) => ({
        links: s.links.map((l) => {
          if (l.id !== linkId) return l;
          return l.aNodeId === fromNodeId
            ? { ...l, posFromA: pos }
            : { ...l, posFromB: pos };
        }),
      }));
      persist();
    },

    setLinkDir: (linkId, dir) => {
      set((s) => ({
        links: s.links.map((l) => (l.id === linkId ? { ...l, dir } : l)),
      }));
      persist();
    },

    newProject: async () => {
      // Empieza de cero: descarta modelo e imágenes, tanto en memoria como en disco.
      await clearProject();
      set({
        nodes: [],
        links: [],
        settings: withDefaults(),
        activeNodeId: null,
        loaded: true,
      });
    },

    replaceProject: async (project, images) => {
      // Escribe todos los blobs importados y limpia los que sobren.
      await Promise.all(
        Object.entries(images).map(([id, blob]) => putImage(id, blob)),
      );
      await pruneImages(project.nodes.map((n) => n.imageId));
      const settings = withDefaults(project.settings);
      set({
        nodes: project.nodes,
        links: project.links,
        settings,
        activeNodeId: project.nodes[0]?.id ?? null,
        loaded: true,
      });
      await saveProject({ ...project, settings });
    },
  };
});

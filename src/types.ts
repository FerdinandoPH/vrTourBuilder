// Posición de un marcador en coordenadas esféricas de Photo Sphere Viewer.
// yaw y pitch se guardan en RADIANES (mismo formato que emite el evento `click`
// de PSV y que espera `link.position`).
export interface MarkerPos {
  yaw: number;
  pitch: number;
}

// Cada foto 360º es un nodo del tour.
export interface TourNode {
  id: string; // identificador estable usado en el tour.js exportado (no cambia al renombrar)
  name: string; // nombre visible que da el usuario
  fileName: string; // nombre final del archivo dentro de ./pano (p.ej. "salon.jpg")
  imageId: string; // clave del blob en IndexedDB
  startNode?: boolean; // marca el nodo inicial del tour (exactamente uno)
}

// Dirección de una conexión.
//   'both' (o ausente): recíproca A<->B (por defecto).
//   'aToB': solo de ida desde A (visible/navegable únicamente desde A).
//   'bToA': solo de ida desde B (visible/navegable únicamente desde B).
export type LinkDir = 'both' | 'aToB' | 'bToA';

// Conexión entre A y B. Cada extremo guarda su propia posición de marcador.
export interface TourLink {
  id: string;
  aNodeId: string;
  bNodeId: string;
  dir?: LinkDir; // ausente ⇒ 'both' (bidireccional)
  posFromA?: MarkerPos; // marcador visto desde A (la flecha que apunta a B)
  posFromB?: MarkerPos; // marcador visto desde B (la flecha que apunta a A)
}

// Idioma del tour exportado (index.html, LEEME/README, scripts).
export type ExportLang = 'es' | 'en';

// Opciones de configuración del tour exportado.
export interface TourSettings {
  name: string; // nombre del proyecto: <title> del HTML y nombre de los archivos
  gallery: boolean; // incluir el plugin de galería para saltar entre zonas
  lang: ExportLang; // idioma de los textos del tour exportado
}

export const DEFAULT_SETTINGS: TourSettings = {
  name: '',
  gallery: false,
  lang: 'es',
};

// Documento del proyecto (lo que se guarda / exporta como .vrtour.zip).
export interface TourProject {
  version: 1;
  nodes: TourNode[];
  links: TourLink[];
  settings: TourSettings;
}

// ¿La conexión es de una sola dirección?
export function isLinkDirected(link: TourLink): boolean {
  return link.dir === 'aToB' || link.dir === 'bToA';
}

// ¿La conexión es visible/navegable DESDE `nodeId`? Las bidireccionales lo son
// desde ambos extremos; las de solo ida solo desde su nodo de origen.
export function linkVisibleFrom(link: TourLink, nodeId: string): boolean {
  if (link.dir === 'aToB') return nodeId === link.aNodeId;
  if (link.dir === 'bToA') return nodeId === link.bNodeId;
  return true;
}

// La dirección que convierte a `nodeId` en el nodo de origen (solo ida desde él).
export function dirForSource(link: TourLink, nodeId: string): LinkDir {
  return nodeId === link.aNodeId ? 'aToB' : 'bToA';
}

// Utilidad: ¿un enlace tiene colocados los marcadores que su dirección requiere?
// Bidireccional exige ambos; de solo ida, solo el marcador de su origen.
export function isLinkComplete(link: TourLink): boolean {
  if (link.dir === 'aToB') return !!link.posFromA;
  if (link.dir === 'bToA') return !!link.posFromB;
  return !!link.posFromA && !!link.posFromB;
}

// El extremo de un enlace desde la perspectiva de un nodo dado.
export function linkOtherNodeId(link: TourLink, nodeId: string): string {
  return link.aNodeId === nodeId ? link.bNodeId : link.aNodeId;
}

// La posición del marcador tal como se ve DESDE `nodeId`.
export function posFrom(link: TourLink, nodeId: string): MarkerPos | undefined {
  return link.aNodeId === nodeId ? link.posFromA : link.posFromB;
}

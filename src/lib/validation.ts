import { isLinkComplete, type TourLink, type TourNode } from '../types';

// Los problemas se describen con una clave i18n y sus parámetros; el consumidor
// (ExportBar) los resuelve con `t(issue.key, issue.params)`. Así la validación
// queda desacoplada del idioma y los mensajes reaccionan al cambio de idioma.
export interface ValidationIssue {
  level: 'error' | 'warning';
  key: string;
  params?: Record<string, string | number>;
}

// Comprueba las reglas que bloquean (error) o desaconsejan (warning) la exportación.
export function validateProject(
  nodes: TourNode[],
  links: TourLink[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;

  if (nodes.length === 0) {
    issues.push({ level: 'error', key: 'validation.noPhotos' });
    return issues;
  }

  // Exactamente un nodo inicial.
  const starts = nodes.filter((n) => n.startNode);
  if (starts.length === 0) {
    issues.push({ level: 'error', key: 'validation.noStartNode' });
  } else if (starts.length > 1) {
    issues.push({
      level: 'error',
      key: 'validation.multipleStartNodes',
      params: { count: starts.length },
    });
  }

  // fileNames únicos y no vacíos.
  const seen = new Map<string, number>();
  for (const n of nodes) {
    if (!n.fileName.trim()) {
      issues.push({
        level: 'error',
        key: 'validation.noFileName',
        params: { name: n.name },
      });
    }
    seen.set(n.fileName, (seen.get(n.fileName) ?? 0) + 1);
  }
  for (const [file, count] of seen) {
    if (count > 1) {
      issues.push({
        level: 'error',
        key: 'validation.duplicateFileName',
        params: { file, count },
      });
    }
  }

  // Marcadores colocados según la dirección: las bidireccionales necesitan ambos;
  // las de solo ida, únicamente el marcador de su nodo de origen.
  for (const l of links) {
    if (l.dir !== 'bToA' && !l.posFromA) {
      issues.push({
        level: 'error',
        key: 'validation.missingMarker',
        params: { from: nameOf(l.aNodeId), to: nameOf(l.bNodeId) },
      });
    }
    if (l.dir !== 'aToB' && !l.posFromB) {
      issues.push({
        level: 'error',
        key: 'validation.missingMarker',
        params: { from: nameOf(l.bNodeId), to: nameOf(l.aNodeId) },
      });
    }
  }

  // Aviso: nodos sin ninguna conexión (huérfanos).
  for (const n of nodes) {
    const connected = links.some((l) => l.aNodeId === n.id || l.bNodeId === n.id);
    if (!connected && nodes.length > 1) {
      issues.push({
        level: 'warning',
        key: 'validation.orphanNode',
        params: { name: n.name },
      });
    }
  }

  return issues;
}

export function canExport(nodes: TourNode[], links: TourLink[]): boolean {
  return !validateProject(nodes, links).some((i) => i.level === 'error');
}

// Cuenta de enlaces incompletos (para badges de la UI).
export function incompleteLinkCount(links: TourLink[]): number {
  return links.filter((l) => !isLinkComplete(l)).length;
}

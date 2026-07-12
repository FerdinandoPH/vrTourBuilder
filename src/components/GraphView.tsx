import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTourStore } from '../store/tourStore';
import { isLinkComplete, isLinkDirected, type TourLink, type TourNode } from '../types';

const X_GAP = 210;
const Y_GAP = 120;

// Layout jerárquico (árbol) por niveles: BFS desde el nodo inicial asigna una
// profundidad a cada nodo; dentro de cada nivel se reparten horizontalmente.
// Compacto y estable, a diferencia del círculo que crecía sin límite.
function treeLayout(
  nodes: TourNode[],
  links: TourLink[],
): Map<string, { x: number; y: number }> {
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => adj.set(n.id, []));
  links.forEach((l) => {
    adj.get(l.aNodeId)?.push(l.bNodeId);
    adj.get(l.bNodeId)?.push(l.aNodeId);
  });

  const level = new Map<string, number>();
  const start = nodes.find((n) => n.startNode)?.id ?? nodes[0]?.id;
  const queue: string[] = [];
  if (start) {
    level.set(start, 0);
    queue.push(start);
  }
  // BFS por componentes conexas; los nodos no alcanzados desde el inicio se
  // colocan igualmente empezando en un nuevo nivel más abajo.
  let scan = 0;
  while (queue.length || scan < nodes.length) {
    if (queue.length === 0) {
      const next = nodes[scan++];
      if (!next || level.has(next.id)) continue;
      let base = 0;
      level.forEach((v) => (base = Math.max(base, v)));
      level.set(next.id, level.size ? base + 2 : 0);
      queue.push(next.id);
    }
    const cur = queue.shift()!;
    const d = level.get(cur)!;
    for (const nb of adj.get(cur) ?? []) {
      if (!level.has(nb)) {
        level.set(nb, d + 1);
        queue.push(nb);
      }
    }
  }

  const byLevel = new Map<number, string[]>();
  nodes.forEach((n) => {
    const lv = level.get(n.id) ?? 0;
    (byLevel.get(lv) ?? byLevel.set(lv, []).get(lv)!).push(n.id);
  });

  const pos = new Map<string, { x: number; y: number }>();
  for (const [lv, ids] of byLevel) {
    ids.forEach((id, i) => {
      pos.set(id, { x: (i - (ids.length - 1) / 2) * X_GAP, y: lv * Y_GAP });
    });
  }
  return pos;
}

export default function GraphView({ onOpenNode }: { onOpenNode: () => void }) {
  const { t } = useTranslation();
  const nodes = useTourStore((s) => s.nodes);
  const links = useTourStore((s) => s.links);
  const setActiveNode = useTourStore((s) => s.setActiveNode);

  const rfNodes = useMemo<Node[]>(() => {
    const pos = treeLayout(nodes, links);
    return nodes.map((n) => ({
      id: n.id,
      position: pos.get(n.id) ?? { x: 0, y: 0 },
      data: { label: n.name + (n.startNode ? '  ●' : '') },
      style: {
        background: n.startNode ? '#1f3a6b' : '#1f232f',
        color: '#e6e8ee',
        border: `1px solid ${n.startNode ? '#4f8cff' : '#2a2f3d'}`,
        borderRadius: 8,
        padding: '8px 14px',
        fontSize: 13,
      },
    }));
  }, [nodes, links]);

  const rfEdges = useMemo<Edge[]>(
    () =>
      links.map((l) => {
        const complete = isLinkComplete(l);
        const stroke = complete ? '#3ecf8e' : '#f16a6a';
        // Las conexiones de solo ida orientan la arista desde su nodo de origen y
        // dibujan una flecha; las bidireccionales no llevan flecha.
        const directed = isLinkDirected(l);
        const source = l.dir === 'bToA' ? l.bNodeId : l.aNodeId;
        const target = l.dir === 'bToA' ? l.aNodeId : l.bNodeId;
        return {
          id: l.id,
          source,
          target,
          animated: !complete,
          label: complete ? undefined : t('graph.markerPending'),
          ...(directed
            ? { markerEnd: { type: MarkerType.ArrowClosed, color: stroke } }
            : {}),
          style: {
            stroke,
            strokeWidth: 2,
            strokeDasharray: complete ? undefined : '6 4',
          },
          labelStyle: { fill: '#f16a6a', fontSize: 11 },
          labelBgStyle: { fill: '#171a23' },
        };
      }),
    [links, t],
  );

  if (nodes.length === 0) {
    return <div className="empty">{t('graph.empty')}</div>;
  }

  return (
    <div className="graph">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
        nodesConnectable={false}
        onNodeClick={(_, node) => {
          setActiveNode(node.id);
          onOpenNode();
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#2a2f3d" gap={22} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

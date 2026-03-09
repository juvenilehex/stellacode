import { useMemo } from 'react';
import * as THREE from 'three';
import type { GraphEdge, GraphNode } from '../types/graph';
import { useGraphStore } from '../store/graph-store';
import { useSettingsStore } from '../store/settings-store';
import { getEdgeColor } from '../utils/colors';

/**
 * High-performance merged edge rendering.
 * Packs all edges into a single LineSegments draw call
 * instead of one draw call per edge.
 */
export function MergedEdges({ edges, nodeMap }: {
  edges: GraphEdge[];
  nodeMap: Map<string, GraphNode>;
}) {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const lodLevel = useGraphStore(s => s.lodLevel);
  const hiddenFilters = useGraphStore(s => s.hiddenFilters);
  const edgeStyles = useSettingsStore(s => s.edgeStyles);
  const customColors = useSettingsStore(s => s.colors);

  // Group edges by visual type for separate materials
  const { importEdges, dirEdges, coChangeEdges } = useMemo(() => {
    const imp: GraphEdge[] = [];
    const dir: GraphEdge[] = [];
    const co: GraphEdge[] = [];

    for (const edge of edges) {
      // LOD filter
      if (lodLevel === 'project' && edge.type === 'import') continue;

      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;

      // Legend filter
      if (edge.type === 'import' && hiddenFilters.has('import')) continue;
      if (edge.type === 'co-change' && hiddenFilters.has('co-change')) continue;
      if (edge.type === 'directory' && hiddenFilters.has('dir-edge')) continue;

      if (edge.type === 'co-change') co.push(edge);
      else if (edge.type === 'directory') dir.push(edge);
      else imp.push(edge);
    }
    return { importEdges: imp, dirEdges: dir, coChangeEdges: co };
  }, [edges, nodeMap, lodLevel, hiddenFilters]);

  const impStyle = edgeStyles.importEdge;
  const dirStyle = edgeStyles.directoryEdge;
  const coStyle = edgeStyles.coChangeEdge;

  return (
    <>
      <EdgeBatch
        edges={importEdges}
        nodeMap={nodeMap}
        color={getEdgeColor('import', customColors)}
        baseOpacity={impStyle.opacity / 100}
        highlightOpacity={Math.min(1, impStyle.opacity / 100 + 0.4)}
        lineWidth={impStyle.weight}
        selectedNodeId={selectedNodeId}
      />
      <EdgeBatch
        edges={dirEdges}
        nodeMap={nodeMap}
        color={getEdgeColor('directory', customColors)}
        baseOpacity={dirStyle.opacity / 100}
        highlightOpacity={Math.min(1, dirStyle.opacity / 100 + 0.4)}
        lineWidth={dirStyle.weight}
        selectedNodeId={selectedNodeId}
      />
      <EdgeBatch
        edges={coChangeEdges}
        nodeMap={nodeMap}
        color={getEdgeColor('co-change', customColors)}
        baseOpacity={coStyle.opacity / 100}
        highlightOpacity={Math.min(1, coStyle.opacity / 100 + 0.4)}
        lineWidth={coStyle.weight}
        selectedNodeId={selectedNodeId}
        dashed
      />
    </>
  );
}

function EdgeBatch({ edges, nodeMap, color, baseOpacity, highlightOpacity, lineWidth = 1, selectedNodeId, dashed }: {
  edges: GraphEdge[];
  nodeMap: Map<string, GraphNode>;
  color: string;
  baseOpacity: number;
  highlightOpacity: number;
  lineWidth?: number;
  selectedNodeId: string | null;
  dashed?: boolean;
}) {
  const { positions, colors } = useMemo(() => {
    const posArr: number[] = [];
    const colArr: number[] = [];
    const baseColor = new THREE.Color(color);
    const dimColor = new THREE.Color(color).multiplyScalar(0.15);

    for (const edge of edges) {
      const source = nodeMap.get(edge.source)!;
      const target = nodeMap.get(edge.target)!;

      const isHighlighted = selectedNodeId !== null && (
        edge.source === selectedNodeId || edge.target === selectedNodeId
      );
      const isDimmed = selectedNodeId !== null && !isHighlighted;

      const c = isDimmed ? dimColor : isHighlighted ? baseColor : baseColor;
      const alpha = isDimmed ? 0.03 : isHighlighted ? highlightOpacity : baseOpacity;

      // Scale color by alpha * weight for additive blending visual
      const w = lineWidth;
      const r = c.r * alpha * w;
      const g = c.g * alpha * w;
      const b = c.b * alpha * w;

      if (dashed) {
        // Dotted line: emit small segments with gaps
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dz = target.z - source.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const segments = Math.max(2, Math.floor(dist / 0.8));

        for (let s = 0; s < segments; s++) {
          const t0 = s / segments;
          const t1 = (s + 0.4) / segments; // 40% segment, 60% gap
          posArr.push(
            source.x + dx * t0, source.y + dy * t0, source.z + dz * t0,
            source.x + dx * t1, source.y + dy * t1, source.z + dz * t1,
          );
          colArr.push(r, g, b, r, g, b);
        }
      } else {
        posArr.push(source.x, source.y, source.z, target.x, target.y, target.z);
        colArr.push(r, g, b, r, g, b);
      }
    }

    return {
      positions: new Float32Array(posArr),
      colors: new Float32Array(colArr),
    };
  }, [edges, nodeMap, color, baseOpacity, highlightOpacity, lineWidth, selectedNodeId, dashed]);

  if (positions.length === 0) return null;

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={1}
        linewidth={lineWidth}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  );
}

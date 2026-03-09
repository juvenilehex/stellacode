import { useMemo } from 'react';
import * as THREE from 'three';
import type { GraphEdge, GraphNode } from '../types/graph';
import { useGraphStore } from '../store/graph-store';
import { useSettingsStore, type EdgeStyleKey } from '../store/settings-store';
import { getEdgeColor } from '../utils/colors';

interface ConstellationEdgeProps {
  edge: GraphEdge;
  nodes: Map<string, GraphNode>;
}

export function ConstellationEdge({ edge, nodes }: ConstellationEdgeProps) {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const lodLevel = useGraphStore(s => s.lodLevel);
  const hiddenFilters = useGraphStore(s => s.hiddenFilters);

  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);
  if (!source || !target) return null;

  // At project level, hide import edges (show only directory + co-change)
  if (lodLevel === 'project' && edge.type === 'import') return null;

  // Legend filter — hide edge type if toggled off
  if (edge.type === 'import' && hiddenFilters.has('import')) return null;
  if (edge.type === 'co-change' && hiddenFilters.has('co-change')) return null;
  if (edge.type === 'directory' && hiddenFilters.has('dir-edge')) return null;

  const isHighlighted = selectedNodeId !== null && (
    edge.source === selectedNodeId || edge.target === selectedNodeId
  );
  const isDimmed = selectedNodeId !== null && !isHighlighted;

  // Map edge type to settings key
  const styleKey: EdgeStyleKey = edge.type === 'co-change' ? 'coChangeEdge'
    : edge.type === 'directory' ? 'directoryEdge' : 'importEdge';
  const edgeStyle = useSettingsStore(s => s.edgeStyles[styleKey]);
  const customColors = useSettingsStore(s => s.colors);

  const color = getEdgeColor(edge.type, customColors);
  const isCoChange = edge.type === 'co-change';
  const baseOp = edgeStyle.opacity / 100;

  const opacity = isDimmed ? 0.03
    : isHighlighted ? Math.min(1, baseOp + 0.4)
    : baseOp;

  const points = useMemo(() => {
    return new Float32Array([
      source.x, source.y, source.z,
      target.x, target.y, target.z,
    ]);
  }, [source.x, source.y, source.z, target.x, target.y, target.z]);

  // Co-change: render dotted segments instead of solid line
  if (isCoChange) {
    return <DottedEdge source={source} target={target} color={color} opacity={opacity} />;
  }

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[points, 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity * edgeStyle.weight}
        linewidth={edgeStyle.weight}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </line>
  );
}

/** Co-change edge rendered as evenly spaced dots along the line */
function DottedEdge({ source, target, color, opacity }: {
  source: GraphNode; target: GraphNode; color: string; opacity: number;
}) {
  const dots = useMemo(() => {
    const sx = source.x, sy = source.y, sz = source.z;
    const tx = target.x, ty = target.y, tz = target.z;
    const dist = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2 + (tz - sz) ** 2);
    const count = Math.max(3, Math.floor(dist / 0.4));
    const positions: [number, number, number][] = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      positions.push([
        sx + (tx - sx) * t,
        sy + (ty - sy) * t,
        sz + (tz - sz) * t,
      ]);
    }
    return positions;
  }, [source.x, source.y, source.z, target.x, target.y, target.z]);

  const positionArray = useMemo(() => {
    const arr = new Float32Array(dots.length * 3);
    dots.forEach((p, i) => { arr[i * 3] = p[0]; arr[i * 3 + 1] = p[1]; arr[i * 3 + 2] = p[2]; });
    return arr;
  }, [dots]);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positionArray, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        color={color}
        transparent
        opacity={opacity}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

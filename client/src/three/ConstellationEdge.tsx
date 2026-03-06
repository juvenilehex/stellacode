import { useMemo } from 'react';
import * as THREE from 'three';
import type { GraphEdge, GraphNode } from '../types/graph';
import { useGraphStore } from '../store/graph-store';
import { getEdgeColor } from '../utils/colors';

interface ConstellationEdgeProps {
  edge: GraphEdge;
  nodes: Map<string, GraphNode>;
}

export function ConstellationEdge({ edge, nodes }: ConstellationEdgeProps) {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const connectedNodeIds = useGraphStore(s => s.connectedNodeIds);

  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);
  if (!source || !target) return null;

  const isHighlighted = selectedNodeId !== null && (
    edge.source === selectedNodeId || edge.target === selectedNodeId
  );
  const isDimmed = selectedNodeId !== null && !isHighlighted;

  const color = getEdgeColor(edge.type);
  const opacity = isDimmed ? 0.03 : isHighlighted ? 0.6 : edge.type === 'directory' ? 0.06 : 0.12;

  const points = useMemo(() => {
    return new Float32Array([
      source.x, source.y, source.z,
      target.x, target.y, target.z,
    ]);
  }, [source.x, source.y, source.z, target.x, target.y, target.z]);

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
        opacity={opacity}
        linewidth={1}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </line>
  );
}

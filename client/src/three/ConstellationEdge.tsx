import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
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

  // All hooks must be called before any early return (React rules of hooks)
  const styleKey: EdgeStyleKey = edge.type === 'co-change' ? 'coChangeEdge'
    : edge.type === 'directory' ? 'directoryEdge' : 'importEdge';
  const edgeStyle = useSettingsStore(s => s.edgeStyles[styleKey]);
  const customColors = useSettingsStore(s => s.colors);
  const edgePulse = useSettingsStore(s => s.edgePulse);
  const entryProgress = useGraphStore(s => s.entryProgress);
  const entryActive = useGraphStore(s => s.entryActive);
  const timelineVisibleIds = useGraphStore(s => s.timelineVisibleIds);

  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);

  const isHighlighted = selectedNodeId !== null && (
    edge.source === selectedNodeId || edge.target === selectedNodeId
  );
  const isDimmed = selectedNodeId !== null && !isHighlighted;

  const isCircular = edge.label?.includes('circular') ?? false;
  const color = isCircular ? '#FF6B6B' : getEdgeColor(edge.type, customColors);
  const baseOp = edgeStyle.opacity / 100;

  // Weight affects brightness (linewidth doesn't work in WebGL)
  const weightBrightness = 0.3 + edgeStyle.weight * 0.2;
  const opacity = isDimmed ? 0.03
    : isHighlighted ? Math.min(1, (baseOp + 0.4) * weightBrightness)
    : baseOp * weightBrightness;

  const points = useMemo(() => {
    if (!source || !target) return new Float32Array(6);
    return new Float32Array([
      source.x, source.y, source.z,
      target.x, target.y, target.z,
    ]);
  }, [source?.x, source?.y, source?.z, target?.x, target?.y, target?.z]);

  // Entry animation: edges appear after both nodes are revealed
  const edgeRevealT = useMemo(() => {
    if (!source || !target) return 0;
    const sReveal = Math.max(0, Math.min(1, (source.x * 0.3 + source.y * 0.5 + source.z * 0.2 + 10) / 20));
    const tReveal = Math.max(0, Math.min(1, (target.x * 0.3 + target.y * 0.5 + target.z * 0.2 + 10) / 20));
    return Math.max(sReveal, tReveal) + 0.05; // slight delay after nodes
  }, [source?.x, source?.y, source?.z, target?.x, target?.y, target?.z]);

  // Early returns AFTER all hooks (React rules of hooks)
  if (!source || !target) return null;
  if (timelineVisibleIds !== null && (!timelineVisibleIds.has(edge.source) || !timelineVisibleIds.has(edge.target))) return null;
  if (entryActive && entryProgress < edgeRevealT) return null;
  if (lodLevel === 'project' && edge.type === 'import') return null;
  if (edge.type === 'import' && hiddenFilters.has('import')) return null;
  if (edge.type === 'co-change' && hiddenFilters.has('co-change')) return null;
  if (edge.type === 'directory' && hiddenFilters.has('dir-edge')) return null;

  return (
    <PulseEdge
      source={source}
      target={target}
      color={color}
      opacity={opacity}
      weight={edgeStyle.weight}
      strength={edge.strength ?? 0}
      pulse={edgePulse}
      blending={edge.type === 'directory' ? THREE.AdditiveBlending : THREE.NormalBlending}
    />
  );
}

/** Solid edge with optional pulse animation (opacity modulation) */
function PulseEdge({ source, target, color, opacity, weight = 1, strength = 0, pulse = true, blending = THREE.NormalBlending }: {
  source: GraphNode; target: GraphNode; color: string; opacity: number; weight?: number; strength?: number; pulse?: boolean; blending?: THREE.Blending;
}) {
  const matRef = useRef<THREE.LineBasicMaterial>(null);

  const points = useMemo(() => {
    return new Float32Array([
      source.x, source.y, source.z,
      target.x, target.y, target.z,
    ]);
  }, [source.x, source.y, source.z, target.x, target.y, target.z]);

  // Pulse phase offset for visual variety
  const phaseOffset = source.x * 0.7 + target.y * 1.3;

  // Pulse animation: modulate opacity
  useFrame(({ clock }) => {
    if (!pulse || !matRef.current) return;
    const t = clock.elapsedTime;
    const pulseSpeed = 1.5 + strength * 2.0;
    const pulseAmp = 0.15 + strength * 0.25;
    const wave = Math.sin(t * pulseSpeed + phaseOffset);
    matRef.current.opacity = opacity * (1.0 + pulseAmp * wave);
  });

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        ref={matRef}
        color={color}
        transparent
        opacity={opacity}
        linewidth={1}
        depthWrite={false}
        blending={blending}
      />
    </line>
  );
}

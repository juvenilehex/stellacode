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
  const coChangePulse = useSettingsStore(s => s.coChangePulse);
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
  const isCoChange = edge.type === 'co-change';
  const baseOp = edgeStyle.opacity / 100;

  // Weight affects brightness (linewidth doesn't work in WebGL)
  const weightBrightness = 0.6 + edgeStyle.weight * 0.4;
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

  // Co-change: render dotted segments with optional pulse animation
  if (isCoChange) {
    return <DottedEdge source={source} target={target} color={color} opacity={opacity} weight={edgeStyle.weight} strength={edge.strength ?? 0} pulse={coChangePulse} />;
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
        opacity={opacity}
        linewidth={1}
        depthWrite={false}
        blending={edge.type === 'directory' ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </line>
  );
}

/** Co-change edge rendered as evenly spaced dots with optional pulse animation */
function DottedEdge({ source, target, color, opacity, weight = 1, strength = 0, pulse = true }: {
  source: GraphNode; target: GraphNode; color: string; opacity: number; weight?: number; strength?: number; pulse?: boolean;
}) {
  const matRef = useRef<THREE.PointsMaterial>(null);

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

  // Pulse phase offset for visual variety
  const phaseOffset = source.x * 0.7 + target.y * 1.3;

  // Pulse animation: modulate opacity and size based on coupling strength
  useFrame(({ clock }) => {
    if (!pulse || !matRef.current) return;
    const t = clock.elapsedTime;
    const pulseSpeed = 1.5 + strength * 2.0;
    const pulseAmp = 0.3 + strength * 0.4;
    const wave = Math.sin(t * pulseSpeed + phaseOffset);
    matRef.current.opacity = opacity * (1.0 + pulseAmp * wave);
    matRef.current.size = (0.06 + weight * 0.03) * (1.0 + 0.15 * wave);
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positionArray, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.06 + weight * 0.03}
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

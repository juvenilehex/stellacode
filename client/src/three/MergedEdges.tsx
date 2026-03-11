import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
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
  const entryProgress = useGraphStore(s => s.entryProgress);
  const entryActive = useGraphStore(s => s.entryActive);
  const edgeStyles = useSettingsStore(s => s.edgeStyles);
  const customColors = useSettingsStore(s => s.colors);
  const coChangePulse = useSettingsStore(s => s.coChangePulse);
  const timelineVisibleIds = useGraphStore(s => s.timelineVisibleIds);

  // Group edges by visual type for separate materials
  const { importEdges, dirEdges, coChangeEdges, circularEdges } = useMemo(() => {
    const imp: GraphEdge[] = [];
    const dir: GraphEdge[] = [];
    const co: GraphEdge[] = [];
    const circ: GraphEdge[] = [];

    for (const edge of edges) {
      // LOD filter
      if (lodLevel === 'project' && edge.type === 'import') continue;

      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;

      // Timeline filter: skip edges whose endpoints aren't visible
      if (timelineVisibleIds !== null) {
        if (!timelineVisibleIds.has(edge.source) || !timelineVisibleIds.has(edge.target)) continue;
      }

      // Entry animation: skip edges whose nodes haven't been revealed yet
      if (entryActive) {
        const sReveal = Math.max(0, Math.min(1, (source.x * 0.3 + source.y * 0.5 + source.z * 0.2 + 10) / 20));
        const tReveal = Math.max(0, Math.min(1, (target.x * 0.3 + target.y * 0.5 + target.z * 0.2 + 10) / 20));
        if (entryProgress < Math.max(sReveal, tReveal) + 0.05) continue;
      }

      // Legend filter
      if (edge.type === 'import' && hiddenFilters.has('import')) continue;
      if (edge.type === 'co-change' && hiddenFilters.has('co-change')) continue;
      if (edge.type === 'directory' && hiddenFilters.has('dir-edge')) continue;

      if (edge.type === 'co-change') co.push(edge);
      else if (edge.type === 'directory') dir.push(edge);
      else if (edge.label?.includes('circular')) circ.push(edge);
      else imp.push(edge);
    }
    return { importEdges: imp, dirEdges: dir, coChangeEdges: co, circularEdges: circ };
  }, [edges, nodeMap, lodLevel, hiddenFilters, entryActive, entryProgress, timelineVisibleIds]);

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
      {/* Circular dependency edges — red tint */}
      <EdgeBatch
        edges={circularEdges}
        nodeMap={nodeMap}
        color="#FF6B6B"
        baseOpacity={Math.min(1, impStyle.opacity / 100 + 0.15)}
        highlightOpacity={Math.min(1, impStyle.opacity / 100 + 0.5)}
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
      {coChangePulse ? (
        <PulsingCoChangeEdges
          edges={coChangeEdges}
          nodeMap={nodeMap}
          color={getEdgeColor('co-change', customColors)}
          baseOpacity={coStyle.opacity / 100}
          highlightOpacity={Math.min(1, coStyle.opacity / 100 + 0.4)}
          lineWidth={coStyle.weight}
          selectedNodeId={selectedNodeId}
        />
      ) : (
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
      )}
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

      // Scale color by alpha for additive blending; weight boosts brightness
      const brightness = alpha * (0.6 + lineWidth * 0.4);
      const r = c.r * brightness;
      const g = c.g * brightness;
      const b = c.b * brightness;

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

/** Pulsing co-change edges: animates color brightness with sine wave */
function PulsingCoChangeEdges({ edges, nodeMap, color, baseOpacity, highlightOpacity, lineWidth = 1, selectedNodeId }: {
  edges: GraphEdge[];
  nodeMap: Map<string, GraphNode>;
  color: string;
  baseOpacity: number;
  highlightOpacity: number;
  lineWidth?: number;
  selectedNodeId: string | null;
}) {
  const colorAttrRef = useRef<THREE.BufferAttribute>(null);

  // Build geometry (dashed segments)
  const { positions, baseColors, edgeRanges } = useMemo(() => {
    const posArr: number[] = [];
    const colArr: number[] = [];
    const ranges: { start: number; count: number; strength: number; phase: number }[] = [];
    const baseColor = new THREE.Color(color);
    const dimColor = new THREE.Color(color).multiplyScalar(0.15);

    for (const edge of edges) {
      const source = nodeMap.get(edge.source)!;
      const target = nodeMap.get(edge.target)!;
      const isHighlighted = selectedNodeId !== null && (
        edge.source === selectedNodeId || edge.target === selectedNodeId
      );
      const isDimmed = selectedNodeId !== null && !isHighlighted;
      const c = isDimmed ? dimColor : baseColor;
      const alpha = isDimmed ? 0.03 : isHighlighted ? highlightOpacity : baseOpacity;
      const brightness = alpha * (0.6 + lineWidth * 0.4);

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dz = target.z - source.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const segments = Math.max(2, Math.floor(dist / 0.8));

      const startVert = posArr.length / 3;
      for (let s = 0; s < segments; s++) {
        const t0 = s / segments;
        const t1 = (s + 0.4) / segments;
        posArr.push(
          source.x + dx * t0, source.y + dy * t0, source.z + dz * t0,
          source.x + dx * t1, source.y + dy * t1, source.z + dz * t1,
        );
        colArr.push(c.r * brightness, c.g * brightness, c.b * brightness,
                     c.r * brightness, c.g * brightness, c.b * brightness);
      }
      const vertCount = (posArr.length / 3) - startVert;
      ranges.push({
        start: startVert,
        count: vertCount,
        strength: edge.strength ?? 0,
        phase: source.x * 0.7 + target.y * 1.3,
      });
    }

    return {
      positions: new Float32Array(posArr),
      baseColors: new Float32Array(colArr),
      edgeRanges: ranges,
    };
  }, [edges, nodeMap, color, baseOpacity, highlightOpacity, lineWidth, selectedNodeId]);

  // Animate color brightness per edge
  useFrame(({ clock }) => {
    if (!colorAttrRef.current || edgeRanges.length === 0) return;
    const arr = colorAttrRef.current.array as Float32Array;
    const t = clock.elapsedTime;

    for (const range of edgeRanges) {
      const pulseSpeed = 1.5 + range.strength * 2.0;
      const pulseAmp = 0.3 + range.strength * 0.4;
      const wave = 1.0 + pulseAmp * Math.sin(t * pulseSpeed + range.phase);

      for (let v = range.start; v < range.start + range.count; v++) {
        arr[v * 3] = baseColors[v * 3] * wave;
        arr[v * 3 + 1] = baseColors[v * 3 + 1] * wave;
        arr[v * 3 + 2] = baseColors[v * 3 + 2] * wave;
      }
    }
    colorAttrRef.current.needsUpdate = true;
  });

  if (positions.length === 0) return null;

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute ref={colorAttrRef} attach="attributes-color" args={[new Float32Array(baseColors), 3]} />
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

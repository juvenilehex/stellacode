import { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { GraphEdge, GraphNode } from '../types/graph';
import { useGraphStore } from '../store/graph-store';
import { useSettingsStore } from '../store/settings-store';
import { getEdgeColor } from '../utils/colors';
import { getTheme } from '../utils/themes';
import { useReducedMotion } from '../hooks/useReducedMotion';

/** Base line width in pixels */
const BASE_LINE_WIDTH = 0.3;

/**
 * High-performance merged edge rendering using Line2 (fat lines).
 * Supports sub-pixel line widths for precise thickness control.
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
  const edgePulse = useSettingsStore(s => s.edgePulse);
  const themeId = useSettingsStore(s => s.theme);
  const edgeBrightMult = getTheme(themeId).scene.edgeBrightnessMultiplier;
  const timelineVisibleIds = useGraphStore(s => s.timelineVisibleIds);

  const { importEdges, dirEdges, coChangeEdges, circularEdges } = useMemo(() => {
    const imp: GraphEdge[] = [];
    const dir: GraphEdge[] = [];
    const co: GraphEdge[] = [];
    const circ: GraphEdge[] = [];

    for (const edge of edges) {
      if (lodLevel === 'project' && edge.type === 'import') continue;

      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;

      if (timelineVisibleIds !== null) {
        if (!timelineVisibleIds.has(edge.source) || !timelineVisibleIds.has(edge.target)) continue;
      }

      if (entryActive) {
        const sReveal = Math.max(0, Math.min(1, (source.x * 0.3 + source.y * 0.5 + source.z * 0.2 + 10) / 20));
        const tReveal = Math.max(0, Math.min(1, (target.x * 0.3 + target.y * 0.5 + target.z * 0.2 + 10) / 20));
        if (entryProgress < Math.max(sReveal, tReveal) + 0.05) continue;
      }

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

  const reducedMotion = useReducedMotion();
  const Batch = (edgePulse && !reducedMotion) ? GPUPulsingEdgeBatch : EdgeBatch;

  return (
    <>
      <Batch
        edges={importEdges}
        nodeMap={nodeMap}
        color={getEdgeColor('import', customColors)}
        baseOpacity={impStyle.opacity / 100}
        highlightOpacity={Math.min(1, impStyle.opacity / 100 + 0.4)}
        lineWidth={impStyle.weight}
        selectedNodeId={selectedNodeId}
        brightnessMult={edgeBrightMult}
      />
      <Batch
        edges={circularEdges}
        nodeMap={nodeMap}
        color="#FF6B6B"
        baseOpacity={Math.min(1, impStyle.opacity / 100 + 0.15)}
        highlightOpacity={Math.min(1, impStyle.opacity / 100 + 0.5)}
        lineWidth={impStyle.weight}
        selectedNodeId={selectedNodeId}
        brightnessMult={edgeBrightMult}
      />
      <Batch
        edges={dirEdges}
        nodeMap={nodeMap}
        color={getEdgeColor('directory', customColors)}
        baseOpacity={dirStyle.opacity / 100}
        highlightOpacity={Math.min(1, dirStyle.opacity / 100 + 0.4)}
        lineWidth={dirStyle.weight}
        selectedNodeId={selectedNodeId}
        brightnessMult={edgeBrightMult}
      />
      <Batch
        edges={coChangeEdges}
        nodeMap={nodeMap}
        color={getEdgeColor('co-change', customColors)}
        baseOpacity={coStyle.opacity / 100}
        highlightOpacity={Math.min(1, coStyle.opacity / 100 + 0.4)}
        lineWidth={coStyle.weight}
        selectedNodeId={selectedNodeId}
        brightnessMult={edgeBrightMult}
      />
    </>
  );
}

interface EdgeBatchProps {
  edges: GraphEdge[];
  nodeMap: Map<string, GraphNode>;
  color: string;
  baseOpacity: number;
  highlightOpacity: number;
  lineWidth?: number;
  selectedNodeId: string | null;
  brightnessMult?: number;
}

function EdgeBatch({ edges, nodeMap, color, baseOpacity, highlightOpacity, lineWidth = 1, selectedNodeId, brightnessMult = 1 }: EdgeBatchProps) {
  const { size } = useThree();
  const lineRef = useRef<LineSegments2>(null);
  const matRef = useRef<LineMaterial>(null);

  // Stable object — created once
  const lineObj = useMemo(() => new LineSegments2(), []);
  const matObj = useMemo(() => new LineMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1,
    linewidth: BASE_LINE_WIDTH * lineWidth,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    resolution: new THREE.Vector2(size.width, size.height),
  }), []);

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
      const c = isDimmed ? dimColor : baseColor;
      const alpha = isDimmed ? 0.03 : isHighlighted ? highlightOpacity : baseOpacity;
      const brightness = alpha * brightnessMult;

      posArr.push(source.x, source.y, source.z, target.x, target.y, target.z);
      colArr.push(c.r * brightness, c.g * brightness, c.b * brightness,
                   c.r * brightness, c.g * brightness, c.b * brightness);
    }
    return {
      positions: new Float32Array(posArr),
      colors: new Float32Array(colArr),
    };
  }, [edges, nodeMap, color, baseOpacity, highlightOpacity, lineWidth, selectedNodeId, brightnessMult]);

  useEffect(() => {
    if (!lineRef.current || positions.length === 0) return;
    const geom = new LineSegmentsGeometry();
    geom.setPositions(positions);
    geom.setColors(colors);
    lineRef.current.geometry = geom;
    return () => { geom.dispose(); };
  }, [positions, colors]);

  // Keep resolution and linewidth in sync
  useEffect(() => {
    if (matRef.current) {
      matRef.current.resolution.set(size.width, size.height);
      matRef.current.linewidth = BASE_LINE_WIDTH * lineWidth;
    }
  }, [size, lineWidth]);

  if (positions.length === 0) return null;

  return (
    <primitive object={lineObj} ref={lineRef}>
      <primitive object={matObj} ref={matRef} attach="material" />
    </primitive>
  );
}

/**
 * GPU-based pulsing edges: pulse animation runs entirely on the GPU via shader.
 * Uses onBeforeCompile to inject pulse logic into LineMaterial's shader,
 * preserving fat line (Line2) sub-pixel width support.
 *
 * Per-frame cost: O(1) uniform update vs O(E) CPU color buffer rewrite.
 */
function GPUPulsingEdgeBatch({ edges, nodeMap, color, baseOpacity, highlightOpacity, lineWidth = 1, selectedNodeId, brightnessMult = 1 }: EdgeBatchProps) {
  const { size } = useThree();
  const lineRef = useRef<LineSegments2>(null);

  const lineObj = useMemo(() => new LineSegments2(), []);

  // Store shader ref for uniform updates
  const shaderRef = useRef<THREE.WebGLProgramParametersWithUniforms | null>(null);

  const matObj = useMemo(() => {
    const mat = new LineMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1,
      linewidth: BASE_LINE_WIDTH * lineWidth,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      resolution: new THREE.Vector2(size.width, size.height),
    });

    // Inject GPU pulse into LineMaterial's shader
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shaderRef.current = shader;

      // Vertex shader: declare per-instance pulse attributes, pass as varyings
      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute float pulsePhase;
         attribute float pulseStrength;
         varying float vPulsePhase;
         varying float vPulseStrength;
         void main() {
           vPulsePhase = pulsePhase;
           vPulseStrength = pulseStrength;`,
      );

      // Fragment shader: declare uniforms/varyings
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `uniform float uTime;
         varying float vPulsePhase;
         varying float vPulseStrength;
         void main() {`,
      );

      // Fragment shader: multiply diffuseColor by pulse wave after color_fragment
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float pSpeed = 1.5 + vPulseStrength * 2.0;
         float pAmp = 0.15 + vPulseStrength * 0.25;
         float wave = 1.0 + pAmp * sin(uTime * pSpeed + vPulsePhase);
         diffuseColor.rgb *= wave;`,
      );
    };

    return mat;
  }, []);

  const { positions, colors, pulsePhases, pulseStrengths } = useMemo(() => {
    const posArr: number[] = [];
    const colArr: number[] = [];
    const phases: number[] = [];
    const strengths: number[] = [];
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
      const brightness = alpha * brightnessMult;

      posArr.push(source.x, source.y, source.z, target.x, target.y, target.z);
      colArr.push(c.r * brightness, c.g * brightness, c.b * brightness,
                   c.r * brightness, c.g * brightness, c.b * brightness);
      phases.push(source.x * 0.7 + target.y * 1.3);
      strengths.push(edge.strength ?? 0);
    }
    return {
      positions: new Float32Array(posArr),
      colors: new Float32Array(colArr),
      pulsePhases: new Float32Array(phases),
      pulseStrengths: new Float32Array(strengths),
    };
  }, [edges, nodeMap, color, baseOpacity, highlightOpacity, lineWidth, selectedNodeId, brightnessMult]);

  useEffect(() => {
    if (!lineRef.current || positions.length === 0) return;
    const geom = new LineSegmentsGeometry();
    geom.setPositions(positions);
    geom.setColors(colors);

    // Add per-instance pulse attributes for GPU animation
    geom.setAttribute('pulsePhase',
      new THREE.InstancedBufferAttribute(pulsePhases, 1));
    geom.setAttribute('pulseStrength',
      new THREE.InstancedBufferAttribute(pulseStrengths, 1));

    lineRef.current.geometry = geom;
    return () => { geom.dispose(); };
  }, [positions, colors, pulsePhases, pulseStrengths]);

  useEffect(() => {
    matObj.resolution.set(size.width, size.height);
    matObj.linewidth = BASE_LINE_WIDTH * lineWidth;
  }, [size, lineWidth, matObj]);

  // O(1) per frame: just update the time uniform
  useFrame(({ clock }) => {
    if (shaderRef.current?.uniforms.uTime) {
      shaderRef.current.uniforms.uTime.value = clock.elapsedTime;
    }
  });

  if (positions.length === 0) return null;

  return (
    <primitive object={lineObj} ref={lineRef}>
      <primitive object={matObj} attach="material" />
    </primitive>
  );
}

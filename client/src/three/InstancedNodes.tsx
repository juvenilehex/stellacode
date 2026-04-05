import { useRef, useMemo, useCallback, useEffect } from 'react';
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { GraphNode } from '../types/graph';
import { useGraphStore } from '../store/graph-store';
import { useAgentStore } from '../store/agent-store';
import { useSettingsStore } from '../store/settings-store';
import { getNodeColor, getNodeFilterKey, getNodeAgeColor, getNodeAgentColor, getComplexityFactor, COLORS } from '../utils/colors';
import type { NodeStyleKey } from '../store/settings-store';
import { getTheme } from '../utils/themes';

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

/** Map node type+language to NodeStyleKey */
function getNodeStyleKey(type: string, language?: string): NodeStyleKey {
  if (type === 'directory') return 'directory';
  if (language === 'typescript' || language === 'tsx') return 'typescript';
  if (language === 'javascript' || language === 'jsx') return 'javascript';
  if (language === 'python') return 'python';
  return 'unknown';
}

/**
 * High-performance instanced rendering for large node sets.
 * Replaces per-node ConstellationNode when count > threshold.
 * Typically reduces draw calls from N*2 to just 2.
 */
export function InstancedNodes({ nodes }: { nodes: GraphNode[] }) {
  const files = useMemo(() => nodes.filter(n => n.type === 'file'), [nodes]);
  const dirs = useMemo(() => nodes.filter(n => n.type === 'directory'), [nodes]);

  return (
    <>
      {files.length > 0 && <NodeCluster nodes={files} geometry="sphere" />}
      {dirs.length > 0 && <NodeCluster nodes={dirs} geometry="octahedron" />}
      <OverlayLabel />
    </>
  );
}

/** Renders a single InstancedMesh for a group of same-geometry nodes */
function NodeCluster({ nodes, geometry }: { nodes: GraphNode[]; geometry: 'sphere' | 'octahedron' }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const initedRef = useRef(false);

  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const connectedNodeIds = useGraphStore(s => s.connectedNodeIds);
  const hoveredNodeId = useGraphStore(s => s.hoveredNodeId);
  const selectNode = useGraphStore(s => s.selectNode);
  const hoverNode = useGraphStore(s => s.hoverNode);
  const lodLevel = useGraphStore(s => s.lodLevel);
  const isFileActive = useAgentStore(s => s.isFileActive);
  const hiddenFilters = useGraphStore(s => s.hiddenFilters);
  const timelineVisibleIds = useGraphStore(s => s.timelineVisibleIds);
  const signalIntensity = useSettingsStore(s => s.signalIntensity);
  const nodeStyles = useSettingsStore(s => s.nodeStyles);
  const customColors = useSettingsStore(s => s.colors);
  const colorMode = useSettingsStore(s => s.colorMode);
  const complexityGlow = useSettingsStore(s => s.complexityGlow);
  const themeId = useSettingsStore(s => s.theme);
  const themeScene = getTheme(themeId).scene;
  const entryProgress = useGraphStore(s => s.entryProgress);
  const entryActive = useGraphStore(s => s.entryActive);
  const allNodes = useGraphStore(s => s.data?.nodes);
  const sig = signalIntensity / 50;

  const count = nodes.length;

  // Stable index → node map
  const indexToNode = useMemo(() => {
    const map = new Map<number, GraphNode>();
    nodes.forEach((n, i) => map.set(i, n));
    return map;
  }, [nodes]);

  // Age color: collect all node metas for normalization
  const allMetas = useMemo(() => {
    if (colorMode !== 'age' || !allNodes) return [];
    return allNodes
      .filter(n => n.meta?.firstCommit)
      .map(n => ({ firstCommit: n.meta!.firstCommit as number }));
  }, [colorMode, allNodes]);

  // Reset color init when custom colors or color mode change
  const prevColorsRef = useRef(customColors);
  const prevColorModeRef = useRef(colorMode);
  if (prevColorsRef.current !== customColors || prevColorModeRef.current !== colorMode) {
    prevColorsRef.current = customColors;
    prevColorModeRef.current = colorMode;
    initedRef.current = false;
  }

  // Per-frame update: matrices + colors via setColorAt
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // First frame or color/mode change: initialize all instance colors
    if (!initedRef.current) {
      for (let i = 0; i < count; i++) {
        const n = nodes[i];
        if (colorMode === 'age') {
          _color.set(getNodeAgeColor(n.meta, allMetas));
        } else if (colorMode === 'agent') {
          _color.set(getNodeAgentColor(n.meta));
        } else {
          _color.set(getNodeColor(n.type, n.language, customColors));
        }
        mesh.setColorAt(i, _color);
      }
      initedRef.current = true;
    }

    const t = clock.elapsedTime;
    const hasSelection = selectedNodeId !== null;

    for (let i = 0; i < count; i++) {
      const node = nodes[i];

      // Timeline filter: hide nodes not in visible set during replay
      const isTimelineHidden = timelineVisibleIds !== null && !timelineVisibleIds.has(node.id);

      // Legend filter: hide nodes whose type is toggled off
      const fk = getNodeFilterKey(node.type, node.language);
      const isFiltered = fk !== '' && hiddenFilters.has(fk);

      // LOD culling or filter hiding
      if (isTimelineHidden || isFiltered || (lodLevel === 'project' && node.type === 'file'
        && selectedNodeId !== node.id && !connectedNodeIds.has(node.id))) {
        _dummy.position.set(0, -9999, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      const nsk = getNodeStyleKey(node.type, node.language);
      const ns = nodeStyles[nsk];
      const sizeScale = ns.size / 100;
      const nodeOpacity = ns.opacity / 100;

      const phase = node.x * 1.7 + node.y * 2.3 + node.z * 0.9;
      const baseScale = (node.type === 'directory' ? 0.28 : 0.14 + node.scale * 0.09) * sizeScale;

      // Entry animation
      let entryScale = 1.0;
      if (entryActive) {
        const revealT = Math.max(0, Math.min(1, (node.x * 0.3 + node.y * 0.5 + node.z * 0.2 + 10) / 20));
        const reveal = Math.max(0, Math.min(1, (entryProgress - revealT) / 0.15));
        if (reveal <= 0) {
          _dummy.position.set(0, -9999, 0);
          _dummy.scale.setScalar(0);
          _dummy.updateMatrix();
          mesh.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        entryScale = reveal * (2.0 - reveal) * (reveal < 0.7 ? 1.3 : 1.0);
      }

      const breathe = 1.0 + Math.sin(t * 1.5 + phase) * 0.04
                          + Math.sin(t * 0.7 + phase * 0.5) * 0.02;

      const isSelected = selectedNodeId === node.id;
      const isHovered = hoveredNodeId === node.id;
      const isConnected = connectedNodeIds.has(node.id);
      const filePath = node.id.startsWith('file:') ? node.id.slice(5) : undefined;
      const isActive = filePath ? isFileActive(filePath) : false;

      // Pulse
      const agentPulse = isActive ? 1.0 + (0.15 + 0.25 * sig) + Math.sin(t * 8 + phase) * (0.15 + 0.15 * sig) : 1.0;
      const pulse = isSelected ? 1.35 : isHovered ? 1.2 : agentPulse;
      const scale = baseScale * pulse * breathe * entryScale;

      _dummy.position.set(node.x, node.y, node.z);
      _dummy.scale.setScalar(scale);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);

      // Dynamic color: dim, agent active, complexity glow
      const isDimmed = hasSelection && !isSelected && !isConnected;
      const cFactor = (complexityGlow / 100) * getComplexityFactor(node);
      const complexityBoost = 1.0 + cFactor * 0.5;

      if (isActive) {
        // Supernova: white-hot core when agent is modifying this file
        const pulse = 0.85 + Math.sin(t * 6 + phase) * 0.15;
        _color.setRGB(pulse, pulse, pulse);
      } else {
        const dimFactor = isDimmed ? 0.2 : nodeOpacity * complexityBoost;
        if (colorMode === 'age') {
          _color.set(getNodeAgeColor(node.meta, allMetas));
        } else if (colorMode === 'agent') {
          _color.set(getNodeAgentColor(node.meta));
        } else {
          _color.set(getNodeColor(node.type, node.language, customColors));
        }
        if (dimFactor !== 1.0) {
          _color.multiplyScalar(dimFactor);
        }
      }
      mesh.setColorAt(i, _color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  });

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId == null) return;
    const node = indexToNode.get(e.instanceId);
    if (!node) return;
    selectNode(selectedNodeId === node.id ? null : node.id);
  }, [selectNode, selectedNodeId, indexToNode]);

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId == null) return;
    const node = indexToNode.get(e.instanceId);
    if (!node) return;
    hoverNode(node.id);
    document.body.style.cursor = 'pointer';
  }, [hoverNode, indexToNode]);

  const handlePointerOut = useCallback(() => {
    hoverNode(null);
    document.body.style.cursor = 'auto';
  }, [hoverNode]);

  const geom = useMemo(() => {
    if (geometry === 'sphere') return new THREE.SphereGeometry(1, 12, 12);
    return new THREE.OctahedronGeometry(1, 0);
  }, [geometry]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geom, undefined, count]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      frustumCulled={false}
    >
      <meshStandardMaterial
        color="#ffffff"
        emissive="#ffffff"
        emissiveIntensity={0.25 + themeScene.nodeEmissiveBoost}
        roughness={0.5}
        metalness={0.15}
        transparent
        opacity={1.0}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

/** Canvas2D label overlay — zero WebGL draw calls, handles thousands of labels */
const LABEL_CANVAS_ID = 'stella-label-canvas';
const _vec = new THREE.Vector3();

function OverlayLabel() {
  const data = useGraphStore(s => s.data);
  const hoveredNodeId = useGraphStore(s => s.hoveredNodeId);
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const lodLevel = useGraphStore(s => s.lodLevel);
  const hiddenFilters = useGraphStore(s => s.hiddenFilters);
  const timelineVisibleIds = useGraphStore(s => s.timelineVisibleIds);
  const connectedNodeIds = useGraphStore(s => s.connectedNodeIds);
  const labelMode = useSettingsStore(s => s.labelMode);
  const fontSize = useSettingsStore(s => s.fontSize);
  const themeId = useSettingsStore(s => s.theme);
  const themeScene = getTheme(themeId).scene;
  const { camera, size } = useThree();

  // Create / resize the overlay canvas
  useEffect(() => {
    let canvas = document.getElementById(LABEL_CANVAS_ID) as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = LABEL_CANVAS_ID;
      canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10';
      // Insert into the Observatory container (parent of the Three canvas)
      const container = document.querySelector('.w-full.h-full.relative');
      if (container) container.appendChild(canvas);
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = size.width + 'px';
    canvas.style.height = size.height + 'px';

    return () => {
      canvas!.remove();
    };
  }, [size]);

  // Draw labels every frame
  useFrame(() => {
    const canvas = document.getElementById(LABEL_CANVAS_ID) as HTMLCanvasElement | null;
    if (!canvas || !data || labelMode === 'off' || lodLevel === 'project') {
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const basePx = Math.round((fontSize * 0.7 + 3) * dpr);
    const highlightPx = Math.round((fontSize * 0.85 + 4) * dpr);
    const baseColor = themeScene.nodeEmissiveBoost > 0 ? 'rgba(255,255,255,0.5)' : 'rgba(232,224,255,0.5)';
    const highlightColor = themeScene.nodeEmissiveBoost > 0 ? '#FFFFFF' : '#E8E0FF';
    const outlineColor = 'rgba(8,6,16,0.7)';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const nodes = data.nodes;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      // Visibility filters
      if (timelineVisibleIds !== null && !timelineVisibleIds.has(node.id)) continue;
      const fk = getNodeFilterKey(node.type, node.language);
      if (fk !== '' && hiddenFilters.has(fk)) continue;
      if (lodLevel === 'project' && node.type === 'file') continue;

      const isHovered = node.id === hoveredNodeId;
      const isSelected = node.id === selectedNodeId;
      const isConnected = connectedNodeIds.has(node.id);
      const isHighlighted = isHovered || isSelected || isConnected;

      // In "selected" mode, only show highlighted labels
      if (labelMode === 'selected' && !isHighlighted) continue;

      // Project 3D → 2D
      const baseScale = node.type === 'directory' ? 0.25 : 0.12 + node.scale * 0.08;
      _vec.set(node.x, node.y + baseScale * 2.5, node.z);
      _vec.project(camera);

      // Skip if behind camera or far off-screen
      if (_vec.z > 1 || _vec.z < -1) continue;
      if (_vec.x < -1.2 || _vec.x > 1.2 || _vec.y < -1.2 || _vec.y > 1.2) continue;

      const sx = (_vec.x * 0.5 + 0.5) * size.width * dpr;
      const sy = (-_vec.y * 0.5 + 0.5) * size.height * dpr;

      const px = isHighlighted ? highlightPx : basePx;
      ctx.font = `${isHighlighted ? 'bold ' : ''}${px}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

      // Outline for readability
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 2.5 * dpr;
      ctx.lineJoin = 'round';
      ctx.strokeText(node.label, sx, sy);

      // Fill
      ctx.fillStyle = isHighlighted ? highlightColor : baseColor;
      ctx.fillText(node.label, sx, sy);
    }
  });

  return null;
}

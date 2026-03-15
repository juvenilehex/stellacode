import { useRef, useMemo, useCallback } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { GraphNode } from '../types/graph';
import { useGraphStore } from '../store/graph-store';
import { useAgentStore } from '../store/agent-store';
import { useSettingsStore } from '../store/settings-store';
import { getNodeColor, getNodeFilterKey, getNodeAgeColor, getNodeAgentColor, getComplexityFactor, COLORS } from '../utils/colors';
import type { NodeStyleKey } from '../store/settings-store';

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
      const dimFactor = isDimmed ? 0.2 : isActive ? (1.0 + 0.5 * sig) : nodeOpacity * complexityBoost;

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
        emissiveIntensity={0.25}
        roughness={0.5}
        metalness={0.15}
        transparent
        opacity={1.0}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

/** Floating label shown based on labelMode setting */
function OverlayLabel() {
  const hoveredNodeId = useGraphStore(s => s.hoveredNodeId);
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const lodLevel = useGraphStore(s => s.lodLevel);
  const getNode = useGraphStore(s => s.getNode);
  const labelMode = useSettingsStore(s => s.labelMode);
  const fontSize = useSettingsStore(s => s.fontSize);

  if (labelMode === 'off' || lodLevel === 'project') return null;

  const nodeId = hoveredNodeId ?? selectedNodeId;
  const node = nodeId ? getNode(nodeId) : undefined;

  if (!node) return null;

  const baseScale = node.type === 'directory' ? 0.25 : 0.12 + node.scale * 0.08;

  return (
    <group position={[node.x, node.y, node.z]}>
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <Text
          position={[0, baseScale * 2.5, 0]}
          fontSize={0.15 + fontSize * 0.01}
          color="#E8E0FF"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.02}
          outlineColor={COLORS.bg}
        >
          {node.label}
        </Text>
      </Billboard>
    </group>
  );
}

import { useRef, useState, useCallback, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { GraphNode } from '../types/graph';
import { useGraphStore } from '../store/graph-store';
import { useAgentStore } from '../store/agent-store';
import { useSettingsStore } from '../store/settings-store';
import { getNodeColor, getNodeFilterKey, getNodeAgeColor, getNodeAgentColor, getComplexityFactor, COLORS } from '../utils/colors';
import type { NodeStyleKey } from '../store/settings-store';
import { glowTexture } from './glowTexture';

function getNodeStyleKey(type: string, language?: string): NodeStyleKey {
  if (type === 'directory') return 'directory';
  if (language === 'typescript' || language === 'tsx') return 'typescript';
  if (language === 'javascript' || language === 'jsx') return 'javascript';
  if (language === 'python') return 'python';
  return 'unknown';
}

interface ConstellationNodeProps {
  node: GraphNode;
}

export function ConstellationNode({ node }: ConstellationNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Sprite>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const pulseRef = useRef(1.0);
  const [hovered, setHovered] = useState(false);
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const connectedNodeIds = useGraphStore(s => s.connectedNodeIds);
  const selectNode = useGraphStore(s => s.selectNode);
  const hoverNode = useGraphStore(s => s.hoverNode);
  const lodLevel = useGraphStore(s => s.lodLevel);
  const hiddenFilters = useGraphStore(s => s.hiddenFilters);
  const timelineVisibleIds = useGraphStore(s => s.timelineVisibleIds);

  // All hooks must be called before any early return (React rules of hooks)
  const filePath = node.id.startsWith('file:') ? node.id.slice(5) : undefined;
  const isFileActive = useAgentStore(s => s.isFileActive);
  const isAgentActive = filePath ? isFileActive(filePath) : false;
  const signalIntensity = useSettingsStore(s => s.signalIntensity);
  const labelMode = useSettingsStore(s => s.labelMode);
  const nodeStyles = useSettingsStore(s => s.nodeStyles);
  const customColors = useSettingsStore(s => s.colors);
  const fontSize = useSettingsStore(s => s.fontSize);
  const colorMode = useSettingsStore(s => s.colorMode);
  const complexityGlow = useSettingsStore(s => s.complexityGlow);
  const entryProgress = useGraphStore(s => s.entryProgress);
  const entryActive = useGraphStore(s => s.entryActive);
  const allNodes = useGraphStore(s => s.data?.nodes);
  const sig = signalIntensity / 50; // normalize: 50 = 1x

  const nsk = getNodeStyleKey(node.type, node.language);
  const nodeStyle = nodeStyles[nsk];
  const sizeScale = nodeStyle.size / 100;
  const nodeOpacity = nodeStyle.opacity / 100;

  const isSelected = selectedNodeId === node.id;
  const isConnected = connectedNodeIds.has(node.id);
  const isDimmed = selectedNodeId !== null && !isSelected && !isConnected;

  const filterKey = getNodeFilterKey(node.type, node.language);

  // Age color: collect all node metas for normalization
  const allMetas = useMemo(() => {
    if (colorMode !== 'age' || !allNodes) return [];
    return allNodes
      .filter(n => n.meta?.firstCommit)
      .map(n => ({ firstCommit: n.meta!.firstCommit as number }));
  }, [colorMode, allNodes]);

  const color = useMemo(() => {
    if (colorMode === 'age') return getNodeAgeColor(node.meta, allMetas);
    if (colorMode === 'agent') return getNodeAgentColor(node.meta);
    return getNodeColor(node.type, node.language, customColors);
  }, [node.type, node.language, customColors, colorMode, node.meta, allMetas]);

  const complexityFactor = useMemo(() => getComplexityFactor(node), [node.symbolCount, node.lineCount, node.degree]);
  const cGlow = (complexityGlow / 100) * complexityFactor;

  const baseScale = (node.type === 'directory' ? 0.28 : 0.14 + node.scale * 0.09) * sizeScale;
  const phase = node.x * 1.7 + node.y * 2.3 + node.z * 0.9;

  // Entry animation: per-node reveal time based on spatial position
  const revealT = useMemo(() => {
    const raw = (node.x * 0.3 + node.y * 0.5 + node.z * 0.2 + 10) / 20;
    return Math.max(0, Math.min(1, raw));
  }, [node.x, node.y, node.z]);

  const handleClick = useCallback((e: THREE.Event) => {
    (e as unknown as { stopPropagation: () => void }).stopPropagation();
    selectNode(isSelected ? null : node.id);
  }, [selectNode, node.id, isSelected]);

  const handlePointerOver = useCallback((e: THREE.Event) => {
    (e as unknown as { stopPropagation: () => void }).stopPropagation();
    setHovered(true);
    hoverNode(node.id);
    document.body.style.cursor = 'pointer';
  }, [hoverNode, node.id]);

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    hoverNode(null);
    document.body.style.cursor = 'auto';
  }, [hoverNode]);

  const opacity = isDimmed ? 0.15 : isSelected ? 1.0 : isConnected ? 0.9 : isAgentActive ? 1.0 : nodeOpacity;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!meshRef.current) return;

    // Entry animation: hide until revealed, then pop-in with overshoot
    let entryScale = 1.0;
    if (entryActive) {
      const reveal = Math.max(0, Math.min(1, (entryProgress - revealT) / 0.15));
      if (reveal <= 0) {
        meshRef.current.scale.setScalar(0);
        if (glowRef.current) glowRef.current.scale.set(0, 0, 1);
        return;
      }
      // Smooth overshoot: 0 → 1.3 → 1.0
      entryScale = reveal * (2.0 - reveal) * (reveal < 0.7 ? 1.3 : 1.0);
    }

    const breathe = 1.0 + Math.sin(t * 1.2 + phase) * 0.06
                        + Math.sin(t * 0.5 + phase * 0.5) * 0.03;

    const agentPulse = isAgentActive ? 1.0 + (0.15 + 0.25 * sig) + Math.sin(t * 8 + phase) * (0.15 + 0.15 * sig) : 1.0;
    const targetPulse = isSelected ? 1.35 : hovered ? 1.2 : agentPulse;
    pulseRef.current = THREE.MathUtils.lerp(pulseRef.current, targetPulse, 0.08);
    const scale = baseScale * pulseRef.current * breathe * entryScale;
    meshRef.current.scale.setScalar(scale);

    if (matRef.current) {
      const shimmer = hovered ? 0.3 * Math.sin(t * 6 + phase) : 0;
      const agentGlow = isAgentActive ? (0.3 + 0.3 * sig) + (0.15 + 0.15 * sig) * Math.sin(t * 6 + phase) : 0;
      // Complexity glow: brighter emissive for complex files
      const baseEmissive = 0.25 + cGlow * 0.35;
      const targetEmissive = isSelected ? 0.6 : hovered ? 0.4 + shimmer : isAgentActive ? 0.3 + agentGlow : baseEmissive;
      matRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        matRef.current.emissiveIntensity,
        targetEmissive,
        0.06,
      );
    }

    if (glowRef.current) {
      // Complexity glow: larger halo for complex files
      const complexGlowBoost = cGlow * 1.5;
      const glowPulse = isSelected
        ? 4 + Math.sin(t * 3 + phase) * 1
        : hovered
          ? 3.5 + Math.sin(t * 4 + phase) * 0.8
          : 3 + complexGlowBoost + Math.sin(t * 1.2 + phase) * 0.2;
      const gs = baseScale * glowPulse * entryScale;
      glowRef.current.scale.set(gs, gs, 1);

      const glowMat = glowRef.current.material as THREE.SpriteMaterial;
      // Complexity glow: brighter halo
      const baseGlowOp = 0.08 + cGlow * 0.10;
      const targetOpacity = isDimmed ? 0.03 : isSelected ? 0.30 : hovered ? 0.20 : isAgentActive ? 0.25 : baseGlowOp;
      glowMat.opacity = THREE.MathUtils.lerp(glowMat.opacity, targetOpacity, 0.06);
    }
  });

  // Early returns AFTER all hooks (React rules of hooks)
  if (timelineVisibleIds !== null && !timelineVisibleIds.has(node.id)) return null;
  if (filterKey && hiddenFilters.has(filterKey as any)) return null;
  if (lodLevel === 'project' && node.type === 'file' && !isSelected && !isConnected) return null;

  return (
    <group position={[node.x, node.y, node.z]}>
      {/* Core mesh */}
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        {node.type === 'directory' ? (
          <octahedronGeometry args={[1, 0]} />
        ) : (
          <sphereGeometry args={[1, 16, 16]} />
        )}
        <meshStandardMaterial
          ref={matRef}
          color={color}
          emissive={color}
          emissiveIntensity={0.25}
          transparent
          opacity={opacity}
          roughness={0.5}
          metalness={0.15}
          toneMapped={false}
        />
      </mesh>

      {/* Glow halo */}
      <sprite ref={glowRef} scale={[baseScale * 4, baseScale * 4, 1]}>
        <spriteMaterial
          map={glowTexture}
          color={color}
          transparent
          opacity={isDimmed ? 0.03 : 0.10}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>

      {/* Label — controlled by labelMode setting */}
      {showLabel(labelMode, hovered, isSelected, isConnected) && lodLevel !== 'project' && (() => {
        const isHighlighted = hovered || isSelected || isConnected;
        const labelSize = isHighlighted ? 0.15 + fontSize * 0.01 : 0.10 + fontSize * 0.006;
        const labelColor = isHighlighted ? '#E8E0FF' : 'rgba(232,224,255,0.55)';
        return (
          <Billboard follow lockX={false} lockY={false} lockZ={false}>
            <Text
              position={[0, baseScale * 2.5, 0]}
              fontSize={labelSize}
              color={labelColor}
              anchorX="center"
              anchorY="bottom"
              outlineWidth={isHighlighted ? 0.02 : 0.015}
              outlineColor="#0C0C10"
            >
              {node.label}
            </Text>
          </Billboard>
        );
      })()}
    </group>
  );
}

function showLabel(mode: 'all' | 'selected' | 'off', hovered: boolean, isSelected: boolean, isConnected: boolean): boolean {
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  // 'selected' — show for hovered, selected, or connected nodes
  return hovered || isSelected || isConnected;
}

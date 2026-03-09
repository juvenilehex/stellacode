import { useRef, useState, useCallback, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { GraphNode } from '../types/graph';
import { useGraphStore } from '../store/graph-store';
import { useAgentStore } from '../store/agent-store';
import { useSettingsStore } from '../store/settings-store';
import { getNodeColor, getNodeFilterKey, COLORS } from '../utils/colors';
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

  // Legend filter — hide this node type if toggled off
  const filterKey = getNodeFilterKey(node.type, node.language);
  if (filterKey && hiddenFilters.has(filterKey as any)) return null;

  // Live agent activity — check if this file is being touched right now
  const filePath = node.id.startsWith('file:') ? node.id.slice(5) : undefined;
  const isFileActive = useAgentStore(s => s.isFileActive);
  const isAgentActive = filePath ? isFileActive(filePath) : false;
  const signalIntensity = useSettingsStore(s => s.signalIntensity);
  const labelMode = useSettingsStore(s => s.labelMode);
  const nodeStyles = useSettingsStore(s => s.nodeStyles);
  const customColors = useSettingsStore(s => s.colors);
  const sig = signalIntensity / 50; // normalize: 50 = 1x

  const nsk = getNodeStyleKey(node.type, node.language);
  const nodeStyle = nodeStyles[nsk];
  const sizeScale = nodeStyle.size / 100;
  const nodeOpacity = nodeStyle.opacity / 100;

  const isSelected = selectedNodeId === node.id;
  const isConnected = connectedNodeIds.has(node.id);
  const isDimmed = selectedNodeId !== null && !isSelected && !isConnected;

  if (lodLevel === 'project' && node.type === 'file' && !isSelected && !isConnected) {
    return null;
  }

  const color = useMemo(() => getNodeColor(node.type, node.language, customColors), [node.type, node.language, customColors]);
  const baseScale = (node.type === 'directory' ? 0.25 : 0.12 + node.scale * 0.08) * sizeScale;

  // Each node gets unique animation phase from its position
  const phase = node.x * 1.7 + node.y * 2.3 + node.z * 0.9;

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

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (!meshRef.current) return;

    // Breathing: gentle scale oscillation, unique per node
    const breathe = 1.0 + Math.sin(t * 1.5 + phase) * 0.04
                        + Math.sin(t * 0.7 + phase * 0.5) * 0.02;

    // Hover/select pulse — tracked separately for stable lerp
    // Agent-active nodes pulse faster and brighter
    const agentPulse = isAgentActive ? 1.0 + (0.15 + 0.25 * sig) + Math.sin(t * 8 + phase) * (0.15 + 0.15 * sig) : 1.0;
    const targetPulse = isSelected ? 1.35 : hovered ? 1.2 : agentPulse;
    pulseRef.current = THREE.MathUtils.lerp(pulseRef.current, targetPulse, 0.08);
    const scale = baseScale * pulseRef.current * breathe;
    meshRef.current.scale.setScalar(scale);

    // Emissive intensity animation — smooth transitions + shimmer on hover
    if (matRef.current) {
      const shimmer = hovered ? 0.3 * Math.sin(t * 6 + phase) : 0;
      const agentGlow = isAgentActive ? (1.0 + 0.8 * sig) + (0.4 + 0.4 * sig) * Math.sin(t * 6 + phase) : 0;
      const targetEmissive = isSelected ? 1.8 : hovered ? 1.2 + shimmer : isAgentActive ? 1.0 + agentGlow : 0.5;
      matRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        matRef.current.emissiveIntensity,
        targetEmissive,
        0.06,
      );
    }

    // Glow sprite pulsation
    if (glowRef.current) {
      const glowPulse = isSelected
        ? 5 + Math.sin(t * 3 + phase) * 1.5
        : hovered
          ? 4.5 + Math.sin(t * 4 + phase) * 1
          : 4 + Math.sin(t * 1.2 + phase) * 0.3;
      const gs = baseScale * glowPulse;
      glowRef.current.scale.set(gs, gs, 1);

      const glowMat = glowRef.current.material as THREE.SpriteMaterial;
      const targetOpacity = isDimmed ? 0.02 : isSelected ? 0.35 : hovered ? 0.2 : isAgentActive ? 0.25 : 0.06;
      glowMat.opacity = THREE.MathUtils.lerp(glowMat.opacity, targetOpacity, 0.06);
    }
  });

  const opacity = isDimmed ? 0.15 : isSelected ? 1.0 : isConnected ? 0.9 : isAgentActive ? 1.0 : nodeOpacity;

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
          emissiveIntensity={0.5}
          transparent
          opacity={opacity}
          toneMapped={false}
        />
      </mesh>

      {/* Glow halo */}
      <sprite ref={glowRef} scale={[baseScale * 4, baseScale * 4, 1]}>
        <spriteMaterial
          map={glowTexture}
          color={color}
          transparent
          opacity={isDimmed ? 0.02 : 0.06}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>

      {/* Label — controlled by labelMode setting */}
      {showLabel(labelMode, hovered, isSelected, isConnected) && lodLevel !== 'project' && (
        <Billboard follow lockX={false} lockY={false} lockZ={false}>
          <Text
            position={[0, baseScale * 2.5, 0]}
            fontSize={0.25}
            color="#E8E0FF"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.02}
            outlineColor="#0C0C10"
          >
            {node.label}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

function showLabel(mode: 'all' | 'selected' | 'off', hovered: boolean, isSelected: boolean, isConnected: boolean): boolean {
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  // 'selected' — show for hovered, selected, or connected nodes
  return hovered || isSelected || isConnected;
}

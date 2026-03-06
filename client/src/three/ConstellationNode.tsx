import { useRef, useState, useCallback, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { GraphNode } from '../types/graph';
import { useGraphStore } from '../store/graph-store';
import { getNodeColor } from '../utils/colors';

interface ConstellationNodeProps {
  node: GraphNode;
}

export function ConstellationNode({ node }: ConstellationNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const connectedNodeIds = useGraphStore(s => s.connectedNodeIds);
  const selectNode = useGraphStore(s => s.selectNode);
  const hoverNode = useGraphStore(s => s.hoverNode);

  const isSelected = selectedNodeId === node.id;
  const isConnected = connectedNodeIds.has(node.id);
  const isDimmed = selectedNodeId !== null && !isSelected && !isConnected;

  const color = useMemo(() => getNodeColor(node.type, node.language), [node.type, node.language]);
  const baseScale = node.type === 'directory' ? 0.25 : 0.12 + node.scale * 0.08;

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

  // Gentle pulsing animation
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const pulse = isSelected ? 1.3 : hovered ? 1.15 : 1.0;
    const breathe = 1.0 + Math.sin(clock.elapsedTime * 2 + node.x) * 0.03;
    const scale = baseScale * pulse * breathe;
    meshRef.current.scale.setScalar(scale);
  });

  const opacity = isDimmed ? 0.15 : isSelected ? 1.0 : isConnected ? 0.9 : 0.7;

  return (
    <group position={[node.x, node.y, node.z]}>
      {/* Core sphere */}
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
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 1.5 : hovered ? 1.0 : 0.5}
          transparent
          opacity={opacity}
          toneMapped={false}
        />
      </mesh>

      {/* Glow sprite */}
      <sprite scale={[baseScale * 4, baseScale * 4, 1]}>
        <spriteMaterial
          color={color}
          transparent
          opacity={isDimmed ? 0.02 : isSelected ? 0.3 : 0.08}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>

      {/* Label */}
      {(hovered || isSelected) && (
        <Billboard follow lockX={false} lockY={false} lockZ={false}>
          <Text
            position={[0, baseScale * 2.5, 0]}
            fontSize={0.25}
            color="#E8E0FF"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.02}
            outlineColor="#08061A"
          >
            {node.label}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

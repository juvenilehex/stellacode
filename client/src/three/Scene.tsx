import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useGraphStore } from '../store/graph-store';
import { Starfield } from './Starfield';
import { ConstellationNode } from './ConstellationNode';
import { ConstellationEdge } from './ConstellationEdge';
import { AgentTrail } from './AgentTrail';
import { LODController } from './LODController';
import { COLORS } from '../utils/colors';

function SceneContent() {
  const data = useGraphStore(s => s.data);
  const nodeMap = useMemo(() => {
    if (!data) return new Map();
    const map = new Map();
    for (const node of data.nodes) map.set(node.id, node);
    return map;
  }, [data]);

  if (!data) return <Starfield />;

  return (
    <>
      <Starfield />

      {/* Ambient light */}
      <ambientLight intensity={0.2} color="#4a4070" />
      <pointLight position={[10, 10, 10]} intensity={0.3} color="#CBB8FF" />

      {/* Edges first (behind nodes) */}
      {data.edges.map(edge => (
        <ConstellationEdge key={edge.id} edge={edge} nodes={nodeMap} />
      ))}

      {/* Nodes */}
      {data.nodes.map(node => (
        <ConstellationNode key={node.id} node={node} />
      ))}

      {/* Agent trails */}
      <AgentTrail />

      {/* LOD controller */}
      <LODController />

      {/* Controls */}
      <OrbitControls
        enableDamping
        dampingFactor={0.04}
        autoRotate
        autoRotateSpeed={0.12}
        minDistance={3}
        maxDistance={60}
/>
    </>
  );
}

export function Scene() {
  return (
    <Canvas
      camera={{ position: [14, 8, 20], fov: 45, near: 0.1, far: 400 }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
      style={{ background: COLORS.bg }}
      onPointerMissed={() => useGraphStore.getState().selectNode(null)}
    >
      <fog attach="fog" args={[COLORS.bgFog, 50, 150]} />
      <SceneContent />
      <EffectComposer>
        <Bloom
          intensity={COLORS.bloomStrength}
          luminanceThreshold={COLORS.bloomThreshold}
          luminanceSmoothing={COLORS.bloomRadius}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}

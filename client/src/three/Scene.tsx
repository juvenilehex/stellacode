import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useGraphStore } from '../store/graph-store';
import { Starfield } from './Starfield';
import { ConstellationNode } from './ConstellationNode';
import { ConstellationEdge } from './ConstellationEdge';
import { InstancedNodes } from './InstancedNodes';
import { MergedEdges } from './MergedEdges';
import { AgentTrail } from './AgentTrail';
import { LODController } from './LODController';
import { COLORS } from '../utils/colors';
import { useSettingsStore } from '../store/settings-store';

/** Above this threshold, switch to instanced rendering */
const INSTANCE_THRESHOLD = 100;

function SceneContent() {
  const data = useGraphStore(s => s.data);
  const nodeMap = useMemo(() => {
    if (!data) return new Map();
    const map = new Map();
    for (const node of data.nodes) map.set(node.id, node);
    return map;
  }, [data]);

  if (!data) return <Starfield />;

  const useInstanced = data.nodes.length > INSTANCE_THRESHOLD;

  return (
    <>
      <Starfield />

      {/* Ambient: neutral dark base */}
      <ambientLight intensity={0.15} color="#1a1a20" />
      {/* Key light: warm white from above */}
      <pointLight position={[10, 15, 10]} intensity={0.25} color="#D8D0E0" distance={80} decay={2} />
      {/* Fill light: cool gray from below-left */}
      <pointLight position={[-12, -8, 5]} intensity={0.1} color="#9098A8" distance={60} decay={2} />

      {useInstanced ? (
        <>
          <MergedEdges edges={data.edges} nodeMap={nodeMap} />
          <InstancedNodes nodes={data.nodes} />
        </>
      ) : (
        <>
          {/* Individual edges (< 100 nodes) */}
          {data.edges.map(edge => (
            <ConstellationEdge key={edge.id} edge={edge} nodes={nodeMap} />
          ))}
          {/* Individual nodes with full glow + animation */}
          {data.nodes.map(node => (
            <ConstellationNode key={node.id} node={node} />
          ))}
        </>
      )}

      {/* Agent trails */}
      <AgentTrail />

      {/* LOD controller */}
      <LODController />

      {/* Controls */}
      <CameraControls maxDist={useInstanced ? 200 : 60} />
    </>
  );
}

function CameraControls({ maxDist }: { maxDist: number }) {
  const observeMode = useSettingsStore(s => s.observeMode);
  return (
    <OrbitControls
      enableDamping
      dampingFactor={observeMode ? 0.02 : 0.04}
      autoRotate
      autoRotateSpeed={observeMode ? 0.04 : 0.12}
      minDistance={5}
      maxDistance={maxDist}
      enableZoom={!observeMode}
      enablePan={!observeMode}
    />
  );
}

function BloomEffect() {
  const bloomIntensity = useSettingsStore(s => s.bloomIntensity);
  const observeMode = useSettingsStore(s => s.observeMode);
  const base = (bloomIntensity / 100) * 1.2;
  const intensity = observeMode ? Math.max(base, 0.8) : base;
  return (
    <EffectComposer>
      <Bloom
        intensity={intensity}
        luminanceThreshold={observeMode ? 0.7 : COLORS.bloomThreshold}
        luminanceSmoothing={COLORS.bloomRadius}
        mipmapBlur
      />
    </EffectComposer>
  );
}

export function Scene() {
  return (
    <Canvas
      camera={{ position: [14, 8, 20], fov: 45, near: 0.1, far: 600 }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
      style={{ background: COLORS.bg }}
      onPointerMissed={() => useGraphStore.getState().selectNode(null)}
    >
      <fog attach="fog" args={[COLORS.bgFog, 80, 300]} />
      <SceneContent />
      <BloomEffect />
    </Canvas>
  );
}

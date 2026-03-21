import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
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
import { useTimelineStore } from '../store/timeline-store';
import { getTheme } from '../utils/themes';

declare global {
  interface Window {
    __STELLA_FPS?: number;
    __SHOW_FPS?: boolean;
  }
}

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
      <ambientLight intensity={0.18} color="#1a1a2a" />
      {/* Key light: warm white from above-right */}
      <pointLight position={[12, 18, 12]} intensity={0.30} color="#E8E0D8" distance={100} decay={2} />
      {/* Fill light: cool tint from below-left for depth */}
      <pointLight position={[-15, -10, 8]} intensity={0.12} color="#8898B8" distance={70} decay={2} />
      {/* Rim light: subtle purple accent from behind */}
      <pointLight position={[0, 5, -20]} intensity={0.08} color="#B098D0" distance={60} decay={2} />

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

      {/* Entry animation driver */}
      <EntryAnimator />

      {/* Timeline replay driver */}
      <TimelineAnimator />

      {/* Agent trails */}
      <AgentTrail />

      {/* LOD controller */}
      <LODController />

      {/* Controls */}
      <CameraControls maxDist={useInstanced ? 400 : 150} />
    </>
  );
}

/** Drives entry animation progress each frame */
function EntryAnimator() {
  const tickEntry = useGraphStore(s => s.tickEntry);
  const entryActive = useGraphStore(s => s.entryActive);
  useFrame((_, delta) => {
    if (entryActive) tickEntry(delta);
  });
  return null;
}

/** Drives timeline replay playback each frame */
function TimelineAnimator() {
  const tickPlayback = useTimelineStore(s => s.tickPlayback);
  const playing = useTimelineStore(s => s.playing);
  useFrame((_, delta) => {
    if (playing) tickPlayback(delta);
  });
  return null;
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
  const themeId = useSettingsStore(s => s.theme);
  const themeScene = getTheme(themeId).scene;
  const base = (bloomIntensity / 100) * 1.2 * themeScene.bloomMultiplier;
  const intensity = observeMode ? Math.max(base, 0.9) : base;
  // High contrast lowers the luminance threshold so more elements glow
  const threshold = observeMode ? 0.7 : COLORS.bloomThreshold / themeScene.bloomMultiplier;
  return (
    <EffectComposer>
      <Bloom
        intensity={intensity}
        luminanceThreshold={Math.max(0.3, threshold)}
        luminanceSmoothing={COLORS.bloomRadius}
        mipmapBlur
      />
    </EffectComposer>
  );
}

/** FPS counter — only visible when ?fps=1 in URL or window.__SHOW_FPS is set */
function FPSMonitor() {
  const frames = useRef(0);
  const lastTime = useRef(performance.now());
  const [fps, setFps] = useState(0);

  useFrame(() => {
    frames.current++;
    const now = performance.now();
    if (now - lastTime.current >= 1000) {
      setFps(frames.current);
      frames.current = 0;
      lastTime.current = now;
    }
    // Expose FPS to window for Playwright tests
    window.__STELLA_FPS = fps;
  });

  return (
    <group>
      {/* FPS rendered as HTML overlay via CSS */}
      <></>
    </group>
  );
}

/** HTML overlay for FPS display */
function FPSOverlay() {
  const [fps, setFps] = useState(0);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if FPS display requested
    const params = new URLSearchParams(window.location.search);
    if (params.get('fps') === '1' || window.__SHOW_FPS) {
      setShow(true);
    }

    const iv = setInterval(() => {
      const f = window.__STELLA_FPS;
      if (typeof f === 'number') setFps(f);
      // Re-check show flag
      if (window.__SHOW_FPS && !show) setShow(true);
    }, 500);
    return () => clearInterval(iv);
  }, []);

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', top: 8, right: 8, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', color: fps >= 50 ? '#7EDCCC' : fps >= 30 ? '#FFD866' : '#FF6B6B',
      padding: '4px 10px', borderRadius: 4, fontFamily: 'monospace', fontSize: 13,
      pointerEvents: 'none',
    }}>
      {fps} FPS
    </div>
  );
}

export function Scene() {
  const themeId = useSettingsStore(s => s.theme);
  const themeColors = getTheme(themeId).colors;

  return (
    <>
    <FPSOverlay />
    <Canvas
      camera={{ position: [14, 8, 20], fov: 45, near: 0.1, far: 600 }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
        preserveDrawingBuffer: true,
      }}
      style={{ background: `radial-gradient(ellipse at 50% 50%, #14121c 0%, #0f0d16 30%, #0b0a10 60%, ${themeColors.bg} 90%)` }}
      onPointerMissed={() => useGraphStore.getState().selectNode(null)}
    >
      <fog attach="fog" args={[themeColors.bgFog, 250, 550]} />
      <SceneContent />
      <BloomEffect />
      <FPSMonitor />
    </Canvas>
    </>
  );
}

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from '../utils/colors';
import { useSettingsStore } from '../store/settings-store';
import { getTheme } from '../utils/themes';

/** 3-layer star background + nebula clouds */
export function Starfield() {
  const themeId = useSettingsStore(s => s.theme);
  const theme = getTheme(themeId);
  const tc = theme.colors;
  const om = theme.scene.starOpacityMultiplier;

  return (
    <>
      <StarLayer count={2500} spread={180} size={0.03} color={tc.starPrimary} opacity={0.45 * om} speed={0.0001} />
      <StarLayer count={800} spread={120} size={0.055} color={tc.starSecondary} opacity={0.14 * om} speed={0.0002} />
      <StarLayer count={500} spread={90} size={0.07} color={tc.starTertiary} opacity={0.10 * om} speed={0.00015} />
      <StarLayer count={200} spread={140} size={0.10} color="#C8B8D8" opacity={0.06 * om} speed={0.00008} />
      <NebulaClouds />
    </>
  );
}

interface StarLayerProps {
  count: number;
  spread: number;
  size: number;
  color: string;
  opacity: number;
  speed: number;
}

function StarLayer({ count, spread, size, color, opacity, speed }: StarLayerProps) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      arr[i] = (Math.random() - 0.5) * spread;
    }
    return arr;
  }, [count, spread]);

  useFrame((_state, delta) => {
    if (ref.current) {
      ref.current.rotation.y += speed * delta * 60;
      ref.current.rotation.x += speed * 0.3 * delta * 60;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        color={color}
        transparent
        opacity={opacity}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

/** Subtle nebula clouds — large, faint, colored sprites in the background */
function NebulaClouds() {
  const groupRef = useRef<THREE.Group>(null);

  const clouds = useMemo(() => {
    const NEBULA_COLORS = ['#2a1f40', '#1a2540', '#301a30', '#1a3030', '#25203a', '#201535', '#182028', '#2d1840'];
    return Array.from({ length: 9 }, (_, i) => ({
      position: [
        (Math.random() - 0.5) * 140,
        (Math.random() - 0.5) * 80,
        (Math.random() - 0.5) * 140 - 40,
      ] as [number, number, number],
      scale: 35 + Math.random() * 50,
      color: NEBULA_COLORS[i % NEBULA_COLORS.length],
      opacity: 0.03 + Math.random() * 0.04,
      phase: Math.random() * Math.PI * 2,
    }));
  }, []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = clock.elapsedTime * 0.00008;
  });

  return (
    <group ref={groupRef}>
      {clouds.map((cloud, i) => (
        <NebulaSprite key={i} {...cloud} />
      ))}
    </group>
  );
}

function NebulaSprite({ position, scale, color, opacity, phase }: {
  position: [number, number, number]; scale: number; color: string; opacity: number; phase: number;
}) {
  const ref = useRef<THREE.Sprite>(null);

  // Lazy-init a radial gradient texture
  const texture = useMemo(() => {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.45)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.20)');
    gradient.addColorStop(0.6, 'rgba(255,255,255,0.06)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    (ref.current.material as THREE.SpriteMaterial).opacity =
      opacity * (0.7 + Math.sin(t * 0.12 + phase) * 0.3);
  });

  return (
    <sprite ref={ref} position={position} scale={[scale, scale, 1]}>
      <spriteMaterial
        map={texture}
        color={color}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </sprite>
  );
}


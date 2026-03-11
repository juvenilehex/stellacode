import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from '../utils/colors';

/** 3-layer star background + nebula clouds + shooting stars */
export function Starfield() {
  return (
    <>
      <StarLayer count={2500} spread={180} size={0.03} color={COLORS.starPrimary} opacity={0.45} speed={0.0001} />
      <StarLayer count={800} spread={120} size={0.055} color={COLORS.starSecondary} opacity={0.14} speed={0.0002} />
      <StarLayer count={500} spread={90} size={0.07} color={COLORS.starTertiary} opacity={0.10} speed={0.00015} />
      <StarLayer count={200} spread={140} size={0.10} color="#C8B8D8" opacity={0.06} speed={0.00008} />
      <NebulaClouds />
      <ShootingStars />
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

/** Occasional shooting stars streaking across the background */
function ShootingStars() {
  const MAX_STARS = 3;
  const starsRef = useRef<Array<{
    active: boolean;
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
    brightness: number;
  }>>(
    Array.from({ length: MAX_STARS }, () => ({
      active: false,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0,
      maxLife: 0,
      brightness: 0,
    })),
  );
  const nextSpawnRef = useRef(3 + Math.random() * 5);

  const { positions, opacities } = useMemo(() => ({
    positions: new Float32Array(MAX_STARS * 3),
    opacities: new Float32Array(MAX_STARS),
  }), []);

  const geomRef = useRef<THREE.BufferGeometry>(null);

  useFrame((_, delta) => {
    const stars = starsRef.current;

    // Spawn timer
    nextSpawnRef.current -= delta;
    if (nextSpawnRef.current <= 0) {
      nextSpawnRef.current = 3 + Math.random() * 6;
      const inactive = stars.find(s => !s.active);
      if (inactive) {
        inactive.active = true;
        inactive.life = 0;
        inactive.maxLife = 0.4 + Math.random() * 0.6;
        inactive.brightness = 0.4 + Math.random() * 0.5;

        // Random start position in outer sphere
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const r = 60 + Math.random() * 40;
        inactive.position.set(
          Math.sin(phi) * Math.cos(theta) * r,
          Math.cos(phi) * r * 0.5,
          Math.sin(phi) * Math.sin(theta) * r,
        );

        // Random velocity toward center-ish
        const speed = 55 + Math.random() * 35;
        inactive.velocity.set(
          -inactive.position.x * 0.5 + (Math.random() - 0.5) * 20,
          -inactive.position.y * 0.5 + (Math.random() - 0.5) * 10,
          -inactive.position.z * 0.5 + (Math.random() - 0.5) * 20,
        ).normalize().multiplyScalar(speed);
      }
    }

    // Update
    for (let i = 0; i < MAX_STARS; i++) {
      const s = stars[i];
      if (!s.active) {
        opacities[i] = 0;
        continue;
      }

      s.life += delta;
      if (s.life >= s.maxLife) {
        s.active = false;
        opacities[i] = 0;
        continue;
      }

      s.position.addScaledVector(s.velocity, delta);
      positions[i * 3] = s.position.x;
      positions[i * 3 + 1] = s.position.y;
      positions[i * 3 + 2] = s.position.z;

      // Fade in/out
      const t = s.life / s.maxLife;
      const fade = t < 0.2 ? t / 0.2 : (1 - t) / 0.8;
      opacities[i] = fade * s.brightness;
    }

    if (geomRef.current) {
      geomRef.current.attributes.position.needsUpdate = true;
    }
  });

  return (
    <points>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.25}
        color="#E8E0FF"
        transparent
        opacity={0.75}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

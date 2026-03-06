import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from '../utils/colors';

/** 3-layer star background (from STELLA web_dashboard.py) */
export function Starfield() {
  return (
    <>
      <StarLayer count={2200} spread={160} size={0.03} color={COLORS.starPrimary} opacity={0.4} speed={0.0001} />
      <StarLayer count={700} spread={100} size={0.06} color={COLORS.starSecondary} opacity={0.12} speed={0.0002} />
      <StarLayer count={400} spread={80} size={0.08} color={COLORS.starTertiary} opacity={0.08} speed={0.00015} />
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

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAgentStore } from '../store/agent-store';
import { useGraphStore } from '../store/graph-store';
import { getAgentColor } from '../utils/colors';
import { glowTexture } from './glowTexture';

/** Visualize recent agent activity as pulsing sparkles on affected nodes */
export function AgentTrail() {
  const events = useAgentStore(s => s.events);
  const data = useGraphStore(s => s.data);

  const trails = useMemo(() => {
    if (!data || events.length === 0) return [];

    const nodeMap = new Map(data.nodes.map(n => [n.id, n]));
    const now = Date.now();
    const maxAge = 5 * 60 * 1000;

    return events
      .filter(e => e.filePath && (now - e.timestamp) < maxAge)
      .map(e => {
        const nodeId = `file:${e.filePath}`;
        const node = nodeMap.get(nodeId);
        if (!node) return null;

        const age = (now - e.timestamp) / maxAge;
        return {
          position: [node.x, node.y, node.z] as [number, number, number],
          color: getAgentColor(e.agent),
          age,
          phase: node.x * 2.1 + node.y * 1.3,
        };
      })
      .filter(Boolean) as Array<{
        position: [number, number, number];
        color: string;
        age: number;
        phase: number;
      }>;
  }, [events, data]);

  if (trails.length === 0) return null;

  return (
    <>
      {trails.map((trail, i) => (
        <TrailSparkle key={i} {...trail} />
      ))}
    </>
  );
}

function TrailSparkle({ position, color, age, phase }: {
  position: [number, number, number];
  color: string;
  age: number;
  phase: number;
}) {
  const innerRef = useRef<THREE.Sprite>(null);
  const outerRef = useRef<THREE.Sprite>(null);
  const ringRef = useRef<THREE.Sprite>(null);
  const freshness = Math.max(0, 1 - age);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;

    // Inner glow: steady pulse
    if (innerRef.current) {
      const pulse = 0.3 + freshness * 0.5 + Math.sin(t * 4 + phase) * 0.15 * freshness;
      const s = pulse;
      innerRef.current.scale.set(s, s, 1);
      (innerRef.current.material as THREE.SpriteMaterial).opacity =
        freshness * (0.5 + Math.sin(t * 3 + phase) * 0.2);
    }

    // Outer halo: slow expansion
    if (outerRef.current) {
      const expand = 0.6 + freshness * 0.8 + Math.sin(t * 1.5 + phase) * 0.2;
      outerRef.current.scale.set(expand, expand, 1);
      (outerRef.current.material as THREE.SpriteMaterial).opacity =
        freshness * (0.12 + Math.sin(t * 2 + phase * 0.7) * 0.06);
    }

    // Ring: expanding ripple for very fresh events
    if (ringRef.current && freshness > 0.5) {
      const ripple = 0.4 + (1 - freshness) * 2 + Math.sin(t * 6 + phase) * 0.1;
      ringRef.current.scale.set(ripple, ripple, 1);
      (ringRef.current.material as THREE.SpriteMaterial).opacity =
        (freshness - 0.5) * 0.4;
    } else if (ringRef.current) {
      (ringRef.current.material as THREE.SpriteMaterial).opacity = 0;
    }
  });

  return (
    <group position={position}>
      {/* Inner sparkle */}
      <sprite ref={innerRef}>
        <spriteMaterial
          map={glowTexture}
          color={color}
          transparent
          opacity={freshness * 0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>

      {/* Outer halo */}
      <sprite ref={outerRef}>
        <spriteMaterial
          map={glowTexture}
          color={color}
          transparent
          opacity={freshness * 0.1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>

      {/* Ripple ring (fresh events only) */}
      <sprite ref={ringRef}>
        <spriteMaterial
          map={glowTexture}
          color="#ffffff"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  );
}

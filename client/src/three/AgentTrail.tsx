import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAgentStore } from '../store/agent-store';
import { useGraphStore } from '../store/graph-store';
import { getAgentColor } from '../utils/colors';
import { glowTexture } from './glowTexture';

const MAX_AGE = 5 * 60 * 1000; // 5 minutes

/** Visualize recent agent activity as pulsing sparkles + connecting trail paths */
export function AgentTrail() {
  const events = useAgentStore(s => s.events);
  const data = useGraphStore(s => s.data);

  const { sparkles, trailPaths } = useMemo(() => {
    if (!data || events.length === 0) return { sparkles: [], trailPaths: [] };

    const nodeMap = new Map(data.nodes.map(n => [n.id, n]));
    const now = Date.now();

    // Build sparkles
    const sparkles = events
      .filter(e => e.filePath && (now - e.timestamp) < MAX_AGE)
      .map(e => {
        const nodeId = `file:${e.filePath}`;
        const node = nodeMap.get(nodeId);
        if (!node) return null;
        return {
          position: [node.x, node.y, node.z] as [number, number, number],
          color: getAgentColor(e.agent),
          age: (now - e.timestamp) / MAX_AGE,
          phase: node.x * 2.1 + node.y * 1.3,
        };
      })
      .filter(Boolean) as Array<{
        position: [number, number, number];
        color: string;
        age: number;
        phase: number;
      }>;

    // Build trail paths: connect consecutive agent events per agent
    const agentEvents = new Map<string, Array<{ position: [number, number, number]; age: number }>>();
    for (const e of events) {
      if (!e.filePath || (now - e.timestamp) >= MAX_AGE) continue;
      const nodeId = `file:${e.filePath}`;
      const node = nodeMap.get(nodeId);
      if (!node) continue;
      const agent = e.agent;
      if (!agentEvents.has(agent)) agentEvents.set(agent, []);
      agentEvents.get(agent)!.push({
        position: [node.x, node.y, node.z],
        age: (now - e.timestamp) / MAX_AGE,
      });
    }

    const trailPaths: Array<{
      positions: Float32Array;
      color: string;
      freshness: number;
    }> = [];

    for (const [agent, pts] of agentEvents) {
      if (pts.length < 2) continue;
      // Deduplicate consecutive same-position points
      const unique: typeof pts = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const prev = unique[unique.length - 1];
        if (p.position[0] !== prev.position[0] || p.position[1] !== prev.position[1] || p.position[2] !== prev.position[2]) {
          unique.push(p);
        }
      }
      if (unique.length < 2) continue;

      const posArr = new Float32Array(unique.length * 3);
      let avgFreshness = 0;
      for (let i = 0; i < unique.length; i++) {
        posArr[i * 3] = unique[i].position[0];
        posArr[i * 3 + 1] = unique[i].position[1];
        posArr[i * 3 + 2] = unique[i].position[2];
        avgFreshness += (1 - unique[i].age);
      }
      avgFreshness /= unique.length;

      trailPaths.push({
        positions: posArr,
        color: getAgentColor(agent),
        freshness: avgFreshness,
      });
    }

    return { sparkles, trailPaths };
  }, [events, data]);

  if (sparkles.length === 0 && trailPaths.length === 0) return null;

  return (
    <>
      {/* Trail paths — fading lines connecting agent's recent file touches */}
      {trailPaths.map((trail, i) => (
        <TrailPath key={`path-${i}`} {...trail} />
      ))}
      {/* Sparkle effects on each touched node */}
      {sparkles.map((sparkle, i) => (
        <TrailSparkle key={`sparkle-${i}`} {...sparkle} />
      ))}
    </>
  );
}

/** Animated line connecting agent's recent file touches */
function TrailPath({ positions, color, freshness }: {
  positions: Float32Array; color: string; freshness: number;
}) {
  const matRef = useRef<THREE.LineBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (!matRef.current) return;
    const t = clock.elapsedTime;
    matRef.current.opacity = freshness * (0.15 + Math.sin(t * 2) * 0.05);
  });

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        ref={matRef}
        color={color}
        transparent
        opacity={freshness * 0.15}
        linewidth={1}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </line>
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
      innerRef.current.scale.set(pulse, pulse, 1);
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

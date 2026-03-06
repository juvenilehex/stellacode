import { useMemo } from 'react';
import * as THREE from 'three';
import { useAgentStore } from '../store/agent-store';
import { useGraphStore } from '../store/graph-store';
import { getAgentColor, COLORS } from '../utils/colors';

/** Visualize recent agent activity as glowing trails on affected nodes */
export function AgentTrail() {
  const events = useAgentStore(s => s.events);
  const data = useGraphStore(s => s.data);

  const trails = useMemo(() => {
    if (!data || events.length === 0) return [];

    const nodeMap = new Map(data.nodes.map(n => [n.id, n]));
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 min

    return events
      .filter(e => e.filePath && (now - e.timestamp) < maxAge)
      .map(e => {
        const nodeId = `file:${e.filePath}`;
        const node = nodeMap.get(nodeId);
        if (!node) return null;

        const age = (now - e.timestamp) / maxAge;
        const opacity = Math.max(0.1, 1 - age);

        return {
          position: [node.x, node.y, node.z] as [number, number, number],
          color: getAgentColor(e.agent),
          opacity,
          scale: 0.3 + opacity * 0.4,
        };
      })
      .filter(Boolean) as Array<{
        position: [number, number, number];
        color: string;
        opacity: number;
        scale: number;
      }>;
  }, [events, data]);

  if (trails.length === 0) return null;

  return (
    <>
      {trails.map((trail, i) => (
        <sprite key={i} position={trail.position} scale={[trail.scale, trail.scale, 1]}>
          <spriteMaterial
            color={trail.color}
            transparent
            opacity={trail.opacity * 0.4}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
    </>
  );
}

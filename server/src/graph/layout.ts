import type { GraphNode, GraphEdge } from './types.js';

/**
 * Force-directed 3D layout with golden ratio spiral initialization.
 * Adapted from STELLA web_dashboard.py force simulation.
 */

const PHI = (1 + Math.sqrt(5)) / 2; // Golden ratio
const REPULSION = 4.0;
const ATTRACTION = 0.08;
const DAMPING = 0.85;
const IDEAL_DIST_BASE = 2;
const IDEAL_DIST_RANGE = 8;
const CENTERING_FORCE = 0.01; // Pull disconnected clusters toward origin

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function computeLayout(nodes: GraphNode[], edges: GraphEdge[]): void {
  if (nodes.length === 0) return;

  // Initialize positions using golden ratio spiral on sphere
  const velocities: Vec3[] = [];
  const n = nodes.length;

  for (let i = 0; i < n; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / n);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const radius = 6 + Math.random() * 2;

    nodes[i].x = Math.sin(phi) * Math.cos(theta) * radius;
    nodes[i].y = Math.cos(phi) * 4;
    nodes[i].z = Math.sin(phi) * Math.sin(theta) * radius;

    velocities.push({ x: 0, y: 0, z: 0 });
  }

  // Build node index for O(1) lookup
  const nodeIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    nodeIndex.set(nodes[i].id, i);
  }

  // Build adjacency with strength
  const adjacency = new Map<number, Map<number, number>>();
  for (const edge of edges) {
    const si = nodeIndex.get(edge.source);
    const ti = nodeIndex.get(edge.target);
    if (si === undefined || ti === undefined) continue;

    if (!adjacency.has(si)) adjacency.set(si, new Map());
    if (!adjacency.has(ti)) adjacency.set(ti, new Map());
    adjacency.get(si)!.set(ti, Math.max(adjacency.get(si)!.get(ti) ?? 0, edge.strength));
    adjacency.get(ti)!.set(si, Math.max(adjacency.get(ti)!.get(si) ?? 0, edge.strength));
  }

  // Scale iterations for large graphs (O(n^2) repulsion)
  const iterations = n > 500 ? 40 : 80;

  // Force simulation
  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 0.3 * (1 - iter / iterations);

    // Centering force — prevents disconnected clusters from drifting
    for (let i = 0; i < n; i++) {
      velocities[i].x -= nodes[i].x * CENTERING_FORCE * alpha;
      velocities[i].y -= nodes[i].y * CENTERING_FORCE * alpha;
      velocities[i].z -= nodes[i].z * CENTERING_FORCE * alpha;
    }

    // Repulsion between all nodes (O(n^2), acceptable for <2000 nodes)
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const dx = nodes[a].x - nodes[b].x;
        const dy = nodes[a].y - nodes[b].y;
        const dz = nodes[a].z - nodes[b].z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
        const force = REPULSION / (dist * dist) * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;

        velocities[a].x += fx;
        velocities[a].y += fy;
        velocities[a].z += fz;
        velocities[b].x -= fx;
        velocities[b].y -= fy;
        velocities[b].z -= fz;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const ai = nodeIndex.get(edge.source);
      const bi = nodeIndex.get(edge.target);
      if (ai === undefined || bi === undefined) continue;

      const dx = nodes[bi].x - nodes[ai].x;
      const dy = nodes[bi].y - nodes[ai].y;
      const dz = nodes[bi].z - nodes[ai].z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;

      const idealDist = IDEAL_DIST_BASE + IDEAL_DIST_RANGE * (1 - edge.strength);
      const attract = (dist - idealDist) * edge.strength * ATTRACTION * alpha;

      const fx = (dx / dist) * attract;
      const fy = (dy / dist) * attract;
      const fz = (dz / dist) * attract;

      velocities[ai].x += fx;
      velocities[ai].y += fy;
      velocities[ai].z += fz;
      velocities[bi].x -= fx;
      velocities[bi].y -= fy;
      velocities[bi].z -= fz;
    }

    // Apply velocity with damping
    for (let i = 0; i < n; i++) {
      nodes[i].x += velocities[i].x;
      nodes[i].y += velocities[i].y;
      nodes[i].z += velocities[i].z;
      velocities[i].x *= DAMPING;
      velocities[i].y *= DAMPING;
      velocities[i].z *= DAMPING;
    }
  }

  // Post-layout: center graph at origin
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += nodes[i].x; cy += nodes[i].y; cz += nodes[i].z; }
  cx /= n; cy /= n; cz /= n;
  for (let i = 0; i < n; i++) { nodes[i].x -= cx; nodes[i].y -= cy; nodes[i].z -= cz; }
}

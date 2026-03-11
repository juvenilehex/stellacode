import type { GraphNode, GraphEdge } from './types.js';

/**
 * Force-directed 3D layout with golden ratio spiral initialization.
 * Adapted from STELLA web_dashboard.py force simulation.
 */

const REPULSION = 4.0;
const ATTRACTION = 0.08;
const DAMPING = 0.85;
const IDEAL_DIST_BASE = 2;
const IDEAL_DIST_RANGE = 8;
const CENTERING_FORCE = 0.01;

/** Barnes-Hut threshold: use approximation when s/d < THETA */
const BH_THETA = 0.8;
/** Node count threshold to switch to Barnes-Hut */
const BH_THRESHOLD = 200;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ── Barnes-Hut Octree ──

interface OctreeNode {
  cx: number; cy: number; cz: number; // center of mass
  mass: number;
  size: number; // half-width of this cell
  children: (OctreeNode | null)[];
  nodeIndex: number; // -1 if internal node, index if leaf
}

function createOctreeNode(ox: number, oy: number, oz: number, size: number): OctreeNode {
  return { cx: 0, cy: 0, cz: 0, mass: 0, size, children: [], nodeIndex: -1 };
}

function insertIntoOctree(root: OctreeNode, nodes: GraphNode[], idx: number, ox: number, oy: number, oz: number, halfSize: number): void {
  const node = nodes[idx];
  if (root.mass === 0 && root.nodeIndex === -1 && root.children.length === 0) {
    // Empty leaf — place node here
    root.cx = node.x;
    root.cy = node.y;
    root.cz = node.z;
    root.mass = 1;
    root.nodeIndex = idx;
    return;
  }

  if (root.nodeIndex !== -1) {
    // Leaf with existing node — subdivide
    const existingIdx = root.nodeIndex;
    root.nodeIndex = -1;
    root.children = new Array(8).fill(null);
    insertIntoOctreeChild(root, nodes, existingIdx, ox, oy, oz, halfSize);
  }

  if (root.children.length === 0) {
    root.children = new Array(8).fill(null);
  }

  insertIntoOctreeChild(root, nodes, idx, ox, oy, oz, halfSize);

  // Update center of mass
  const totalMass = root.mass + 1;
  root.cx = (root.cx * root.mass + node.x) / totalMass;
  root.cy = (root.cy * root.mass + node.y) / totalMass;
  root.cz = (root.cz * root.mass + node.z) / totalMass;
  root.mass = totalMass;
}

function insertIntoOctreeChild(root: OctreeNode, nodes: GraphNode[], idx: number, ox: number, oy: number, oz: number, halfSize: number): void {
  const node = nodes[idx];
  const qh = halfSize / 2;
  const octant = (node.x > ox ? 1 : 0) | (node.y > oy ? 2 : 0) | (node.z > oz ? 4 : 0);
  const cox = ox + (octant & 1 ? qh : -qh);
  const coy = oy + (octant & 2 ? qh : -qh);
  const coz = oz + (octant & 4 ? qh : -qh);

  if (!root.children[octant]) {
    root.children[octant] = createOctreeNode(cox, coy, coz, qh);
  }
  insertIntoOctree(root.children[octant]!, nodes, idx, cox, coy, coz, qh);
}

function computeBHForce(
  tree: OctreeNode, nodeIdx: number, nodes: GraphNode[], velocities: Vec3[], alpha: number,
): void {
  if (tree.mass === 0) return;

  const node = nodes[nodeIdx];
  const dx = tree.cx - node.x;
  const dy = tree.cy - node.y;
  const dz = tree.cz - node.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;

  // If leaf with same node, skip
  if (tree.nodeIndex === nodeIdx) return;

  // Barnes-Hut criterion: if cell is far enough, treat as single body
  if (tree.nodeIndex !== -1 || (tree.size * 2 / dist) < BH_THETA) {
    const force = REPULSION * tree.mass / (dist * dist) * alpha;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    const fz = (dz / dist) * force;
    velocities[nodeIdx].x -= fx;
    velocities[nodeIdx].y -= fy;
    velocities[nodeIdx].z -= fz;
    return;
  }

  // Recurse into children
  for (const child of tree.children) {
    if (child) computeBHForce(child, nodeIdx, nodes, velocities, alpha);
  }
}

export interface LayoutOptions {
  /** Directory edge strength multiplier (0-1). Default 1.0 = use edge.strength as-is. */
  dirCohesion?: number;
}

export function computeLayout(nodes: GraphNode[], edges: GraphEdge[], options?: LayoutOptions): void {
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

  const useBH = n > BH_THRESHOLD;
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

    if (useBH) {
      // Barnes-Hut O(n log n) repulsion
      // Compute bounding box
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < n; i++) {
        if (nodes[i].x < minX) minX = nodes[i].x;
        if (nodes[i].x > maxX) maxX = nodes[i].x;
        if (nodes[i].y < minY) minY = nodes[i].y;
        if (nodes[i].y > maxY) maxY = nodes[i].y;
        if (nodes[i].z < minZ) minZ = nodes[i].z;
        if (nodes[i].z > maxZ) maxZ = nodes[i].z;
      }
      const halfSize = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2 + 1;
      const ox = (minX + maxX) / 2;
      const oy = (minY + maxY) / 2;
      const oz = (minZ + maxZ) / 2;

      const tree = createOctreeNode(ox, oy, oz, halfSize);
      for (let i = 0; i < n; i++) {
        insertIntoOctree(tree, nodes, i, ox, oy, oz, halfSize);
      }
      for (let i = 0; i < n; i++) {
        computeBHForce(tree, i, nodes, velocities, alpha);
      }
    } else {
      // Brute-force O(n^2) repulsion (fine for small graphs)
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
    }

    // Attraction along edges
    const dirMul = options?.dirCohesion ?? 1.0;
    for (const edge of edges) {
      const ai = nodeIndex.get(edge.source);
      const bi = nodeIndex.get(edge.target);
      if (ai === undefined || bi === undefined) continue;

      const dx = nodes[bi].x - nodes[ai].x;
      const dy = nodes[bi].y - nodes[ai].y;
      const dz = nodes[bi].z - nodes[ai].z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;

      // Apply directory cohesion multiplier to containment edges
      const strength = edge.type === 'directory' ? edge.strength * dirMul : edge.strength;
      const idealDist = IDEAL_DIST_BASE + IDEAL_DIST_RANGE * (1 - strength);
      const attract = (dist - idealDist) * strength * ATTRACTION * alpha;

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

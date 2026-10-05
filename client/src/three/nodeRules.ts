/**
 * Pure per-node geometry/motion rules shared by both node renderers.
 *
 * Scene.tsx renders ConstellationNode (<= 100 nodes) or InstancedNodes (> 100 nodes).
 * The renderers differ for performance, but a project must look and move the same on
 * either side of that threshold — so the rules live here once, not as copies per renderer.
 * (Color/category rules live in utils/colors.ts.)
 */

/** Per-node phase offset so nodes don't animate in lockstep */
export function getNodePhase(x: number, y: number, z: number): number {
  return x * 1.7 + y * 2.3 + z * 0.9;
}

/** Base mesh scale before pulse/breathe/entry multipliers */
export function getNodeBaseScale(type: string, scale: number, sizeScale: number): number {
  return (type === 'directory' ? 0.28 : 0.14 + scale * 0.09) * sizeScale;
}

/** Entry animation: 0-1 progress at which a node at this position starts to appear */
export function getNodeRevealT(x: number, y: number, z: number): number {
  return Math.max(0, Math.min(1, (x * 0.3 + y * 0.5 + z * 0.2 + 10) / 20));
}

/** Entry animation: edges appear slightly after both endpoint nodes are revealed */
export function getEdgeRevealT(
  source: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
): number {
  return Math.max(
    getNodeRevealT(source.x, source.y, source.z),
    getNodeRevealT(target.x, target.y, target.z),
  ) + 0.05;
}

/**
 * Entry animation scale for a node.
 * Returns 0 while the node is still hidden; otherwise a pop-in with overshoot (0 → 1.3 → 1.0).
 */
export function getEntryScale(entryProgress: number, revealT: number): number {
  const reveal = Math.max(0, Math.min(1, (entryProgress - revealT) / 0.15));
  if (reveal <= 0) return 0;
  return reveal * (2.0 - reveal) * (reveal < 0.7 ? 1.3 : 1.0);
}

/**
 * Scale multiplier for a node an AI agent is currently modifying.
 * Reduced motion keeps the enlarged size without the oscillation.
 */
export function getAgentPulse(t: number, phase: number, sig: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1.3;
  return 1.0 + (0.15 + 0.25 * sig) + Math.sin(t * 8 + phase) * (0.15 + 0.15 * sig);
}

/**
 * sin wave that flattens to 0 under reduced motion — for decorative oscillation
 * (halo pulse, supernova flicker) so both renderers honor the OS setting the same way.
 */
export function motionSin(reducedMotion: boolean, x: number): number {
  return reducedMotion ? 0 : Math.sin(x);
}

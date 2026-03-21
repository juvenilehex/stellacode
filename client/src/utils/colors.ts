import * as THREE from 'three';
import type { FilterKey } from '../store/graph-store';

/** Observatory color palette */

export const COLORS = {
  // Background — dark charcoal, no blue/purple tint
  bg: '#0C0C10',
  bgFog: '#0C0C10',

  // Node types
  directory: '#B098D0',   // muted purple - structural, non-competing
  typescript: '#89C4F4',  // blue - TypeScript
  javascript: '#FFD866',  // yellow - JavaScript
  python: '#7EDCCC',      // teal - Python
  unknown: '#8888AA',     // gray - other

  // Edge types
  importEdge: '#E88AB8',     // muted pink - less dominant
  directoryEdge: '#6858A0',  // muted purple -- brighter for visibility at low opacity
  coChangeEdge: '#4DCFB5',   // vivid teal - clearly distinct from pink import edges

  // Stars (background) — cooler, less saturated
  starPrimary: '#B8B8CC',
  starSecondary: '#C8A0B0',
  starTertiary: '#8899AA',

  // UI — solid panels (not glass), 3-tier text opacity
  textPrimary: 'rgba(255, 255, 255, 0.92)',
  textSecondary: 'rgba(255, 255, 255, 0.52)',
  panelBg: 'rgba(14, 14, 16, 0.94)',
  panelBorder: 'rgba(255, 255, 255, 0.07)',
  panelShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',

  // Agent
  agentClaude: '#FF8EC8',
  agentCopilot: '#7EDCCC',
  agentCursor: '#89C4F4',
  agentUnknown: '#C7A4FF',

  // Conventional commit types
  commitFeat: '#7EDCCC',      // teal - new feature
  commitFix: '#FF8EC8',       // pink - bug fix
  commitRefactor: '#C7A4FF',  // purple - restructure
  commitDocs: '#89C4F4',      // blue - documentation
  commitChore: '#9890B0',     // gray - maintenance
  commitTest: '#FFD866',      // yellow - testing
  commitPerf: '#FF8EC8',      // pink - performance
  commitOther: '#8888AA',     // muted - uncategorized

  // Git
  branchClean: '#7EDCCC',
  branchDirty: '#FFD866',

  // Bloom — restrained: only bright elements glow
  bloomStrength: 0.35,
  bloomRadius: 0.4,
  bloomThreshold: 0.85,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyColorMap = any;

/** Get node color. Pass custom colors from settings store to use user overrides. */
export function getNodeColor(type: string, language?: string, custom?: AnyColorMap): string {
  const c = custom ?? COLORS;
  if (type === 'directory') return c.directory ?? COLORS.directory;
  switch (language) {
    case 'typescript': case 'tsx': return c.typescript ?? COLORS.typescript;
    case 'javascript': case 'jsx': return c.javascript ?? COLORS.javascript;
    case 'python': return c.python ?? COLORS.python;
    default: return c.unknown ?? COLORS.unknown;
  }
}

/** Get edge color. Pass custom colors from settings store to use user overrides. */
export function getEdgeColor(type: string, custom?: AnyColorMap): string {
  const c = custom ?? COLORS;
  switch (type) {
    case 'import': return c.importEdge ?? COLORS.importEdge;
    case 'directory': return c.directoryEdge ?? COLORS.directoryEdge;
    case 'co-change': return c.coChangeEdge ?? COLORS.coChangeEdge;
    default: return c.directoryEdge ?? COLORS.directoryEdge;
  }
}

// ── Code Age Color ──

// Age gradient: newest (cool blue) → middle (neutral lavender) → oldest (warm coral)
const AGE_COLORS = {
  newest: '#89C4F4',   // cool blue
  middle: '#E8E0FF',   // neutral white-lavender
  oldest: '#FF8E6B',   // warm coral
} as const;

/**
 * Compute age-based color for a node.
 * Requires node.meta.firstCommit (unix ms timestamp).
 * Returns interpolated hex string: blue (new) → coral (old).
 */
export function getNodeAgeColor(meta: Record<string, unknown> | undefined, allMetas: { firstCommit: number }[]): string {
  const firstCommit = meta?.firstCommit as number | undefined;
  if (!firstCommit || allMetas.length === 0) return AGE_COLORS.newest;

  // Find age range across all nodes
  let minAge = Infinity;
  let maxAge = -Infinity;
  for (const m of allMetas) {
    if (m.firstCommit < minAge) minAge = m.firstCommit;
    if (m.firstCommit > maxAge) maxAge = m.firstCommit;
  }

  if (maxAge === minAge) return AGE_COLORS.middle;

  // Normalize: 0 = newest, 1 = oldest
  const t = 1 - (firstCommit - minAge) / (maxAge - minAge);

  // Two-segment interpolation
  const c = new THREE.Color();
  if (t < 0.5) {
    const c1 = new THREE.Color(AGE_COLORS.newest);
    const c2 = new THREE.Color(AGE_COLORS.middle);
    c.copy(c1).lerp(c2, t * 2);
  } else {
    const c1 = new THREE.Color(AGE_COLORS.middle);
    const c2 = new THREE.Color(AGE_COLORS.oldest);
    c.copy(c1).lerp(c2, (t - 0.5) * 2);
  }

  return '#' + c.getHexString();
}

// ── Complexity Glow ──

interface ComplexityNode {
  symbolCount?: number;
  lineCount?: number;
  degree?: number;
}

/**
 * Compute 0-1 complexity factor for a node.
 * Uses symbol count (functions/classes), line count, and degree (connectivity).
 */
export function getComplexityFactor(node: ComplexityNode): number {
  const symbols = Math.min((node.symbolCount ?? 0) / 30, 1);
  const lines = Math.min((node.lineCount ?? 0) / 500, 1);
  const degree = Math.min((node.degree ?? 0) / 10, 1);
  return Math.min(symbols * 0.4 + lines * 0.3 + degree * 0.3, 1);
}

// ── Agent Territory Color ──

const AGENT_TERRITORY_COLORS: Record<string, string> = {
  'claude-code': '#FF8EC8',
  'copilot': '#7EDCCC',
  'cursor': '#89C4F4',
  'aider': '#FFD866',
  'codeium': '#C7A4FF',
  'tabnine': '#FF8E6B',
  'windsurf': '#4DCFB5',
  'devin': '#E88AB8',
  'amazon-q': '#FF9E64',
  'gemini': '#6BB8FF',
  'bolt': '#FFE066',
};
const HUMAN_COLOR = '#E8E0FF';    // neutral lavender for human-only files
const MIXED_COLOR = '#B098D0';    // muted purple for mixed authorship

/**
 * Color a node by agent authorship.
 * Pure human → lavender, pure agent → agent color, mixed → blend.
 */
export function getNodeAgentColor(meta: Record<string, unknown> | undefined): string {
  const primaryAgent = meta?.primaryAgent as string | null | undefined;
  const agentRatio = (meta?.agentRatio as number | undefined) ?? 0;

  if (!primaryAgent || agentRatio === 0) return HUMAN_COLOR;
  if (agentRatio >= 0.8) return AGENT_TERRITORY_COLORS[primaryAgent] ?? COLORS.agentUnknown;

  // Blend between human and agent color based on ratio
  const agentColor = AGENT_TERRITORY_COLORS[primaryAgent] ?? COLORS.agentUnknown;
  const c1 = new THREE.Color(HUMAN_COLOR);
  const c2 = new THREE.Color(agentColor);
  c1.lerp(c2, agentRatio);
  return '#' + c1.getHexString();
}

export function getAgentColor(agent: string): string {
  const lower = agent.toLowerCase();
  return AGENT_TERRITORY_COLORS[lower] ?? COLORS.agentUnknown;
}

export function getCommitTypeColor(type: string): string {
  switch (type) {
    case 'feat': return COLORS.commitFeat;
    case 'fix': return COLORS.commitFix;
    case 'refactor': return COLORS.commitRefactor;
    case 'docs': return COLORS.commitDocs;
    case 'chore': return COLORS.commitChore;
    case 'test': return COLORS.commitTest;
    case 'perf': return COLORS.commitPerf;
    default: return COLORS.commitOther;
  }
}

/** Map a node to its legend filter key */
export function getNodeFilterKey(type: string, language?: string): FilterKey | '' {
  if (type === 'directory') return 'directory';
  switch (language) {
    case 'typescript': return 'typescript';
    case 'javascript': return 'javascript';
    case 'python': return 'python';
    default: return '';
  }
}

export function getCommitTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    feat: 'feat', fix: 'fix', refactor: 'refact',
    docs: 'docs', chore: 'chore', test: 'test',
    perf: 'perf', style: 'style', ci: 'ci',
    build: 'build', revert: 'revert',
  };
  return labels[type] ?? type;
}

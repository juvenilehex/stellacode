/** Observatory color palette */

export const COLORS = {
  // Background — dark charcoal, no blue/purple tint
  bg: '#0C0C10',
  bgFog: '#0C0C10',

  // Node types
  directory: '#C7A4FF',   // purple - structure
  typescript: '#89C4F4',  // blue - TypeScript
  javascript: '#FFD866',  // yellow - JavaScript
  python: '#7EDCCC',      // teal - Python
  unknown: '#8888AA',     // gray - other

  // Edge types
  importEdge: '#FF8EC8',     // pink
  directoryEdge: '#4a4070',  // muted purple
  coChangeEdge: '#7EDCCC',   // teal

  // Stars (background) — cooler, less saturated
  starPrimary: '#B8B8CC',
  starSecondary: '#C8A0B0',
  starTertiary: '#8899AA',

  // UI
  textPrimary: '#E8E0FF',
  textSecondary: '#9890B0',
  panelBg: 'rgba(12, 12, 16, 0.88)',
  panelBorder: 'rgba(180, 180, 200, 0.12)',

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

  // Bloom
  bloomStrength: 0.6,
  bloomRadius: 0.4,
  bloomThreshold: 0.9,
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

export function getAgentColor(agent: string): string {
  const lower = agent.toLowerCase();
  if (lower.includes('claude')) return COLORS.agentClaude;
  if (lower.includes('copilot')) return COLORS.agentCopilot;
  if (lower.includes('cursor')) return COLORS.agentCursor;
  return COLORS.agentUnknown;
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
export function getNodeFilterKey(type: string, language?: string): string {
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

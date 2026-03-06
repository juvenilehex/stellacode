/** Observatory color palette */

export const COLORS = {
  // Background
  bg: '#08061A',
  bgFog: '#08061A',

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

  // Stars (background)
  starPrimary: '#CBB8FF',
  starSecondary: '#FF8EC8',
  starTertiary: '#89C4F4',

  // UI
  textPrimary: '#E8E0FF',
  textSecondary: '#9890B0',
  panelBg: 'rgba(8, 6, 26, 0.85)',
  panelBorder: 'rgba(199, 164, 255, 0.15)',

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
  bloomStrength: 1.0,
  bloomRadius: 0.5,
  bloomThreshold: 0.85,
} as const;

export function getNodeColor(type: string, language?: string): string {
  if (type === 'directory') return COLORS.directory;
  switch (language) {
    case 'typescript': return COLORS.typescript;
    case 'javascript': return COLORS.javascript;
    case 'python': return COLORS.python;
    default: return COLORS.unknown;
  }
}

export function getEdgeColor(type: string): string {
  switch (type) {
    case 'import': return COLORS.importEdge;
    case 'directory': return COLORS.directoryEdge;
    case 'co-change': return COLORS.coChangeEdge;
    default: return COLORS.directoryEdge;
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

export function getCommitTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    feat: 'feat', fix: 'fix', refactor: 'refact',
    docs: 'docs', chore: 'chore', test: 'test',
    perf: 'perf', style: 'style', ci: 'ci',
    build: 'build', revert: 'revert',
  };
  return labels[type] ?? type;
}

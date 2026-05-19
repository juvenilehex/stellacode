/**
 * domain.ts — StellaCode Domain Ontology (L4 Central Type Registry)
 *
 * Frozen enum objects + relationship maps + validation functions.
 * All domain concepts should reference these constants rather than
 * using raw strings throughout the codebase.
 *
 * @module domain
 */

// ── Frozen Enum Objects ─────────────────────────────────

/** Node types in the graph visualization */
export const NodeType = Object.freeze({
  DIRECTORY: 'directory',
  FILE: 'file',
  SYMBOL: 'symbol',
} as const);
export type NodeType = (typeof NodeType)[keyof typeof NodeType];

/** Edge relationship types */
export const EdgeType = Object.freeze({
  IMPORT: 'import',
  DIRECTORY: 'directory',
  CO_CHANGE: 'co-change',
} as const);
export type EdgeType = (typeof EdgeType)[keyof typeof EdgeType];

/** Supported programming languages */
export const Language = Object.freeze({
  TYPESCRIPT: 'typescript',
  JAVASCRIPT: 'javascript',
  PYTHON: 'python',
  GO: 'go',
  UNKNOWN: 'unknown',
} as const);
export type Language = (typeof Language)[keyof typeof Language];

/** Conventional commit types */
export const CommitType = Object.freeze({
  FEAT: 'feat',
  FIX: 'fix',
  REFACTOR: 'refactor',
  DOCS: 'docs',
  CHORE: 'chore',
  TEST: 'test',
  STYLE: 'style',
  PERF: 'perf',
  CI: 'ci',
  BUILD: 'build',
  REVERT: 'revert',
  OTHER: 'other',
} as const);
export type CommitType = (typeof CommitType)[keyof typeof CommitType];

/** AI agent names detected from git history */
export const AgentName = Object.freeze({
  CLAUDE_CODE: 'claude-code',
  COPILOT: 'copilot',
  CURSOR: 'cursor',
  AIDER: 'aider',
  CODEIUM: 'codeium',
  TABNINE: 'tabnine',
  WINDSURF: 'windsurf',
  DEVIN: 'devin',
  AMAZON_Q: 'amazon-q',
  GEMINI: 'gemini',
  BOLT: 'bolt',
} as const);
export type AgentName = (typeof AgentName)[keyof typeof AgentName];

/** Agent event types */
export const AgentEventType = Object.freeze({
  FILE_READ: 'file_read',
  FILE_EDIT: 'file_edit',
  FILE_CREATE: 'file_create',
  FILE_DELETE: 'file_delete',
  COMMAND: 'command',
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
} as const);
export type AgentEventType = (typeof AgentEventType)[keyof typeof AgentEventType];

/** WebSocket message types */
export const WsMessageType = Object.freeze({
  GRAPH_UPDATE: 'graph:update',
  FILE_CHANGE: 'file:change',
  AGENT_LIVE: 'agent:live',
  QUALITY_ALERT: 'quality:alert',
  ERROR: 'error',
} as const);
export type WsMessageType = (typeof WsMessageType)[keyof typeof WsMessageType];

/** Quality grade levels for graph integrity */
export const QualityGrade = Object.freeze({
  EXCELLENT: 'excellent',
  GOOD: 'good',
  FAIR: 'fair',
  POOR: 'poor',
} as const);
export type QualityGrade = (typeof QualityGrade)[keyof typeof QualityGrade];

/** File change status from git */
export const FileStatus = Object.freeze({
  ADD: 'A',
  MODIFY: 'M',
  DELETE: 'D',
  RENAME: 'R',
} as const);
export type FileStatus = (typeof FileStatus)[keyof typeof FileStatus];

// ── Relationship Maps ───────────────────────────────────

/** Language → file extension mapping */
export const LANGUAGE_EXTENSIONS: Readonly<Record<Language, readonly string[]>> = Object.freeze({
  [Language.TYPESCRIPT]: ['.ts', '.tsx'],
  [Language.JAVASCRIPT]: ['.js', '.jsx', '.mjs', '.cjs'],
  [Language.PYTHON]: ['.py'],
  [Language.GO]: ['.go'],
  [Language.UNKNOWN]: [],
});

/** CommitType → semantic category */
export const COMMIT_CATEGORY: Readonly<Record<CommitType, 'feature' | 'maintenance' | 'quality' | 'other'>> = Object.freeze({
  [CommitType.FEAT]: 'feature',
  [CommitType.FIX]: 'maintenance',
  [CommitType.REFACTOR]: 'maintenance',
  [CommitType.DOCS]: 'quality',
  [CommitType.CHORE]: 'maintenance',
  [CommitType.TEST]: 'quality',
  [CommitType.STYLE]: 'quality',
  [CommitType.PERF]: 'maintenance',
  [CommitType.CI]: 'maintenance',
  [CommitType.BUILD]: 'maintenance',
  [CommitType.REVERT]: 'maintenance',
  [CommitType.OTHER]: 'other',
});

/** NodeType → visual rendering hints */
export const NODE_VISUAL: Readonly<Record<NodeType, { shape: string; minScale: number }>> = Object.freeze({
  [NodeType.DIRECTORY]: { shape: 'ring', minScale: 1.5 },
  [NodeType.FILE]: { shape: 'sphere', minScale: 0.3 },
  [NodeType.SYMBOL]: { shape: 'point', minScale: 0.1 },
});

// ── Validation Functions ────────────────────────────────

const _nodeTypes = new Set(Object.values(NodeType));
const _edgeTypes = new Set(Object.values(EdgeType));
const _languages = new Set(Object.values(Language));
const _commitTypes = new Set(Object.values(CommitType));
const _agentNames = new Set(Object.values(AgentName));
const _eventTypes = new Set(Object.values(AgentEventType));

export function isValidNodeType(v: string): v is NodeType {
  return _nodeTypes.has(v as NodeType);
}

export function isValidEdgeType(v: string): v is EdgeType {
  return _edgeTypes.has(v as EdgeType);
}

export function isValidLanguage(v: string): v is Language {
  return _languages.has(v as Language);
}

export function isValidCommitType(v: string): v is CommitType {
  return _commitTypes.has(v as CommitType);
}

export function isValidAgentName(v: string): v is AgentName {
  return _agentNames.has(v as AgentName);
}

export function isValidEventType(v: string): v is AgentEventType {
  return _eventTypes.has(v as AgentEventType);
}

/** Detect language from file extension */
export function detectLanguage(ext: string): Language {
  const lower = ext.toLowerCase();
  for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if ((exts as readonly string[]).includes(lower)) return lang as Language;
  }
  return Language.UNKNOWN;
}

/** Domain health check: verify all enum values are non-empty and frozen */
export function domainHealthCheck(): { pass: boolean; issues: string[] } {
  const issues: string[] = [];
  const enums = { NodeType, EdgeType, Language, CommitType, AgentName, AgentEventType, WsMessageType, QualityGrade, FileStatus };

  for (const [name, obj] of Object.entries(enums)) {
    if (!Object.isFrozen(obj)) issues.push(`${name} is not frozen`);
    if (Object.keys(obj).length === 0) issues.push(`${name} is empty`);
  }

  return { pass: issues.length === 0, issues };
}

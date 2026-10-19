import { describe, it, expect } from 'vitest';
import { AgentTracker } from '../agent/tracker.js';
import type { GitCommit } from '../agent/types.js';

// We test the pure functions and logic of the tracker without needing a real git repo.
// The detectAgent and parseConventional functions are module-private in tracker.ts,
// so we re-implement their logic here for unit testing, matching the source exactly.

// ── Agent detection (mirrors tracker.ts logic) ──

const AGENT_PATTERNS = [
  { pattern: /claude/i, name: 'claude-code' },
  { pattern: /copilot/i, name: 'copilot' },
  { pattern: /cursor/i, name: 'cursor' },
  { pattern: /aider/i, name: 'aider' },
  { pattern: /codeium/i, name: 'codeium' },
  { pattern: /tabnine/i, name: 'tabnine' },
  { pattern: /windsurf|cascade/i, name: 'windsurf' },
  { pattern: /devin-ai|devin/i, name: 'devin' },
  { pattern: /amazon\s*q|aws-q/i, name: 'amazon-q' },
  { pattern: /gemini/i, name: 'gemini' },
  { pattern: /\bbolt\b|stackblitz/i, name: 'bolt' },
];

function detectAgent(author: string, message: string): { isAgent: boolean; agentName?: string } {
  for (const { pattern, name } of AGENT_PATTERNS) {
    if (pattern.test(author)) return { isAgent: true, agentName: name };
  }
  if (message.includes('Co-Authored-By')) {
    for (const { pattern, name } of AGENT_PATTERNS) {
      if (pattern.test(message)) return { isAgent: true, agentName: name };
    }
  }
  return { isAgent: false };
}

// ── Conventional Commit parser (mirrors tracker.ts logic) ──

type ConventionalType =
  | 'feat' | 'fix' | 'refactor' | 'docs' | 'chore'
  | 'test' | 'style' | 'perf' | 'ci' | 'build' | 'revert'
  | 'other';

const CONVENTIONAL_RE = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/;
const VALID_TYPES = new Set<ConventionalType>([
  'feat', 'fix', 'refactor', 'docs', 'chore',
  'test', 'style', 'perf', 'ci', 'build', 'revert',
]);

function parseConventional(message: string): { type: ConventionalType; scope?: string; subject: string } {
  const match = message.match(CONVENTIONAL_RE);
  if (match) {
    const rawType = match[1].toLowerCase();
    return {
      type: VALID_TYPES.has(rawType as ConventionalType) ? rawType as ConventionalType : 'other',
      scope: match[2] || undefined,
      subject: match[3],
    };
  }
  return { type: 'other', subject: message };
}

// ── Tests ──

describe('detectAgent', () => {
  it('detects claude from author name', () => {
    const result = detectAgent('Claude', 'fix: something');
    expect(result.isAgent).toBe(true);
    expect(result.agentName).toBe('claude-code');
  });

  it('detects copilot from author name', () => {
    const result = detectAgent('GitHub Copilot', 'add feature');
    expect(result.isAgent).toBe(true);
    expect(result.agentName).toBe('copilot');
  });

  it('detects cursor from author name', () => {
    const result = detectAgent('Cursor AI', 'refactor code');
    expect(result.isAgent).toBe(true);
    expect(result.agentName).toBe('cursor');
  });

  it('detects claude from Co-Authored-By in message', () => {
    const result = detectAgent('John Doe', 'fix: bug\n\nCo-Authored-By: Claude <noreply@anthropic.com>');
    expect(result.isAgent).toBe(true);
    expect(result.agentName).toBe('claude-code');
  });

  it('detects copilot from Co-Authored-By in message', () => {
    const result = detectAgent('Jane', 'feat: new\n\nCo-Authored-By: Copilot <copilot@github.com>');
    expect(result.isAgent).toBe(true);
    expect(result.agentName).toBe('copilot');
  });

  it('does not detect agent for normal human author', () => {
    const result = detectAgent('John Doe', 'fix: normal commit message');
    expect(result.isAgent).toBe(false);
    expect(result.agentName).toBeUndefined();
  });

  it('does not false-positive on Co-Authored-By without agent name', () => {
    const result = detectAgent('John', 'feat: thing\n\nCo-Authored-By: Jane <jane@example.com>');
    expect(result.isAgent).toBe(false);
  });

  it('detects windsurf/cascade', () => {
    expect(detectAgent('Windsurf', 'hi').agentName).toBe('windsurf');
    expect(detectAgent('cascade-bot', 'hi').agentName).toBe('windsurf');
  });

  it('detects devin', () => {
    expect(detectAgent('devin-ai', 'hi').agentName).toBe('devin');
    expect(detectAgent('Devin', 'hi').agentName).toBe('devin');
  });

  it('detects amazon-q', () => {
    expect(detectAgent('Amazon Q', 'hi').agentName).toBe('amazon-q');
    expect(detectAgent('aws-q', 'hi').agentName).toBe('amazon-q');
  });

  it('detects gemini', () => {
    expect(detectAgent('Gemini', 'hi').agentName).toBe('gemini');
  });

  it('detects bolt/stackblitz', () => {
    expect(detectAgent('bolt', 'hi').agentName).toBe('bolt');
    expect(detectAgent('StackBlitz', 'hi').agentName).toBe('bolt');
  });

  it('is case-insensitive for author names', () => {
    expect(detectAgent('CLAUDE', 'msg').isAgent).toBe(true);
    expect(detectAgent('aider', 'msg').isAgent).toBe(true);
    expect(detectAgent('CODEIUM', 'msg').isAgent).toBe(true);
    expect(detectAgent('TabNine', 'msg').isAgent).toBe(true);
  });
});

describe('parseConventional', () => {
  it('parses feat commit', () => {
    const result = parseConventional('feat: add new feature');
    expect(result.type).toBe('feat');
    expect(result.subject).toBe('add new feature');
    expect(result.scope).toBeUndefined();
  });

  it('parses fix commit with scope', () => {
    const result = parseConventional('fix(parser): handle edge case');
    expect(result.type).toBe('fix');
    expect(result.scope).toBe('parser');
    expect(result.subject).toBe('handle edge case');
  });

  it('parses breaking change indicator', () => {
    const result = parseConventional('feat!: breaking API change');
    expect(result.type).toBe('feat');
    expect(result.subject).toBe('breaking API change');
  });

  it('parses all valid conventional types', () => {
    const types = ['feat', 'fix', 'refactor', 'docs', 'chore', 'test', 'style', 'perf', 'ci', 'build', 'revert'];
    for (const t of types) {
      const result = parseConventional(`${t}: something`);
      expect(result.type).toBe(t);
    }
  });

  it('returns other for unknown types', () => {
    const result = parseConventional('wip: work in progress');
    expect(result.type).toBe('other');
    expect(result.subject).toBe('work in progress');
  });

  it('returns other for non-conventional messages', () => {
    const result = parseConventional('Initial commit');
    expect(result.type).toBe('other');
    expect(result.subject).toBe('Initial commit');
  });

  it('parses messages without space after colon (regex uses \\s* not \\s+)', () => {
    const result = parseConventional('feat:no space');
    // The regex /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/ uses \s* (zero or more spaces)
    // so "feat:no space" matches as type=feat, subject="no space"
    expect(result.type).toBe('feat');
    expect(result.subject).toBe('no space');
  });

  it('handles scope with special characters', () => {
    const result = parseConventional('fix(ui/modal): close on escape');
    expect(result.scope).toBe('ui/modal');
    expect(result.subject).toBe('close on escape');
  });
});

// The real AgentTracker.getCoChanges (R675) — this block used to test a copy of it kept in this file.
// getCoChanges only reads the commits it is given; the tracker's own folder does not matter.
describe('getCoChanges', () => {
  const tracker = new AgentTracker(process.cwd());
  const getCoChanges = (commits: GitCommit[], minFrequency?: number) => tracker.getCoChanges(commits, minFrequency).pairs;
  let seq = 0;
  function makeCommit(files: string[], message = 'test'): GitCommit {
    seq += 1;
    return {
      hash: `h${seq}`,
      shortHash: `s${seq}`,
      author: 'Test',
      email: 'test@test.com',
      timestamp: seq * 1000,
      message,
      conventionalType: 'feat',
      subject: message,
      files,
      isAgent: false,
    };
  }

  it('detects frequently co-changed file pairs', () => {
    const commits = [
      makeCommit(['a.ts', 'b.ts']),
      makeCommit(['a.ts', 'b.ts']),
      makeCommit(['a.ts', 'b.ts']),
    ];
    const result = getCoChanges(commits, 3);
    expect(result).toHaveLength(1);
    expect(result[0].fileA).toBe('a.ts');
    expect(result[0].fileB).toBe('b.ts');
    expect(result[0].frequency).toBe(3);
    expect(result[0].coupling).toBe(1); // 3/3
  });

  it('filters out pairs below minFrequency', () => {
    const commits = [
      makeCommit(['a.ts', 'b.ts']),
      makeCommit(['a.ts', 'b.ts']),
    ];
    const result = getCoChanges(commits, 3);
    expect(result).toHaveLength(0);
  });

  it('computes coupling correctly with different individual counts', () => {
    const commits = [
      makeCommit(['a.ts', 'b.ts']),
      makeCommit(['a.ts', 'b.ts']),
      makeCommit(['a.ts', 'b.ts']),
      makeCommit(['a.ts']), // a changes alone
    ];
    const result = getCoChanges(commits, 3);
    expect(result).toHaveLength(1);
    expect(result[0].frequency).toBe(3);
    // coupling = 3 / max(4, 3) = 3/4 = 0.75
    expect(result[0].coupling).toBe(0.75);
  });

  it('deduplicates files within a single commit', () => {
    const commits = [
      makeCommit(['a.ts', 'b.ts', 'a.ts']), // a.ts appears twice
      makeCommit(['a.ts', 'b.ts']),
      makeCommit(['a.ts', 'b.ts']),
    ];
    const result = getCoChanges(commits, 3);
    expect(result).toHaveLength(1);
    expect(result[0].frequency).toBe(3);
  });

  it('returns empty for no commits', () => {
    const result = getCoChanges([], 1);
    expect(result).toEqual([]);
  });

  it('sorts results by coupling descending', () => {
    const commits = [
      makeCommit(['a.ts', 'b.ts', 'c.ts']),
      makeCommit(['a.ts', 'b.ts', 'c.ts']),
      makeCommit(['a.ts', 'b.ts', 'c.ts']),
      makeCommit(['a.ts', 'b.ts']), // a-b stronger coupling
    ];
    const result = getCoChanges(commits, 3);
    // a-b: freq=4, a-c: freq=3, b-c: freq=3
    // coupling: a-b = 4/4 = 1.0, a-c = 3/4 = 0.75, b-c = 3/4 = 0.75
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].coupling).toBeGreaterThanOrEqual(result[result.length - 1].coupling);
  });

  it('breaks a coupling tie by the number of shared commits', () => {
    const commits = [
      ...Array.from({ length: 3 }, () => makeCommit(['few1.ts', 'few2.ts'])),
      ...Array.from({ length: 6 }, () => makeCommit(['many1.ts', 'many2.ts'])),
    ];
    // both pairs are 100%; the one seen together 6 times is better evidence than 3
    expect(getCoChanges(commits, 3).map(c => [c.fileA, c.frequency])).toEqual([['many1.ts', 6], ['few1.ts', 3]]);
  });

  it('carries the newest shared commits and counts the large ones among all of them (R675)', () => {
    const bulk = Array.from({ length: 40 }, (_, i) => `bulk${i}.ts`);
    const commits = [
      makeCommit(['a.ts', 'b.ts', ...bulk], 'v0.1.0 dump'),
      makeCommit(['a.ts', 'b.ts'], 'fix: a needs b'),
      makeCommit(['a.ts', 'b.ts', 'c.ts'], 'feat: c'),
    ].reverse(); // git log order: newest first
    const pair = getCoChanges(commits, 3).find(c => c.fileA === 'a.ts' && c.fileB === 'b.ts');
    expect(pair?.largeShared).toBe(1);
    expect(pair?.shared.map(s => [s.message, s.files])).toEqual([['feat: c', 3], ['fix: a needs b', 2], ['v0.1.0 dump', 42]]);
  });

  it('lists at most coChangeEvidenceCommits commits per pair but counts all of them', () => {
    const commits = Array.from({ length: 8 }, (_, i) => makeCommit(['a.ts', 'b.ts'], `c${i}`)).reverse();
    const [pair] = getCoChanges(commits, 3);
    expect(pair.frequency).toBe(8);
    expect(pair.shared.map(s => s.message)).toEqual(['c7', 'c6', 'c5', 'c4', 'c3']);
  });

  it('reports every pair that reached the threshold, not only the listed ones', () => {
    const files = Array.from({ length: 12 }, (_, i) => `f${i}.ts`); // 66 pairs > maxCoChangePairs 50
    const commits = Array.from({ length: 3 }, () => makeCommit(files));
    const result = tracker.getCoChanges(commits, 3);
    expect(result.pairs).toHaveLength(50);
    expect(result.totalPairs).toBe(66);
  });
});

describe('git command injection prevention', () => {
  // The git() helper in tracker.ts rejects shell metacharacters.
  // We test the regex pattern used for rejection.
  const SHELL_META_RE = /[;&|`$(){}]/;

  it('rejects semicolon', () => {
    expect(SHELL_META_RE.test('log; rm -rf /')).toBe(true);
  });

  it('rejects pipe', () => {
    expect(SHELL_META_RE.test('log | cat')).toBe(true);
  });

  it('rejects backtick', () => {
    expect(SHELL_META_RE.test('log `whoami`')).toBe(true);
  });

  it('rejects dollar sign', () => {
    expect(SHELL_META_RE.test('log $HOME')).toBe(true);
  });

  it('rejects parentheses', () => {
    expect(SHELL_META_RE.test('log $(whoami)')).toBe(true);
  });

  it('allows safe git commands', () => {
    expect(SHELL_META_RE.test('log -n 200 --format="%H"')).toBe(false);
    expect(SHELL_META_RE.test('branch --show-current')).toBe(false);
    expect(SHELL_META_RE.test('status --porcelain')).toBe(false);
    expect(SHELL_META_RE.test('rev-parse --is-inside-work-tree')).toBe(false);
  });
});

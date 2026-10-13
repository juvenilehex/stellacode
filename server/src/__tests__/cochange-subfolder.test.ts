import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentTracker } from '../agent/tracker.js';
import { buildGraph } from '../graph/builder.js';
import { TargetSession } from '../target-session.js';
import type { ParsedFile } from '../parser/types.js';

// R639 finding: opening a SUBFOLDER of a repo listed co-change pairs but drew 0 co-change lines.
// git prints repo-root-relative paths ('sub/a.ts'); node ids are relative to the opened folder ('a.ts').

function makeFile(relativePath: string): ParsedFile {
  return {
    path: `/x/${relativePath}`, relativePath, language: 'typescript',
    symbols: [], imports: [], lineCount: 1, size: 1,
  };
}

let repo: string;

function git(args: string[]) {
  execFileSync('git', args, { cwd: repo, windowsHide: true, stdio: 'pipe' });
}

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-sub-'));
  git(['init', '-q']);
  git(['config', 'user.email', 't@t']);
  git(['config', 'user.name', 't']);
  fs.mkdirSync(path.join(repo, 'sub'));
  fs.mkdirSync(path.join(repo, 'other'));
  fs.mkdirSync(path.join(repo, '한글 폴더'));
  // Three commits that touch sub/a.ts + sub/b.ts + other/x.ts together
  for (let i = 0; i < 3; i++) {
    for (const f of ['sub/a.ts', 'sub/b.ts', 'other/x.ts', '한글 폴더/가.ts', '한글 폴더/나.ts']) {
      fs.writeFileSync(path.join(repo, f), `export const v = ${i};\n`);
    }
    git(['add', '-A']);
    git(['commit', '-q', '-m', `c${i}`]);
  }
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('co-change edges when a subfolder of a git repo is opened', () => {
  it('[SPEC] the real build of a subfolder target draws its co-change line', async () => {
    const session = new TargetSession(path.join(repo, 'sub'), {
      onFileChange: () => {}, onLiveEvent: () => {}, onBuildRecorded: () => {},
    });
    try {
      const edges = session.getGraphData().edges.filter(e => e.type === 'co-change');
      expect(edges.map(e => [e.source, e.target].sort().join('|'))).toEqual(['file:a.ts|file:b.ts']);
    } finally {
      await session.close();
    }
  });

  it('draws the pair inside the subfolder and drops pairs that leave it', () => {
    const tracker = new AgentTracker(path.join(repo, 'sub'));
    const commits = tracker.getGitLog(50);
    const coChanges = tracker.getCoChanges(commits);
    // The git scan itself sees all three pairs, spelled repo-root-relative
    expect(coChanges.map(c => [c.fileA, c.fileB].sort().join('|')).filter(k => !k.includes('한글')).sort()).toEqual([
      'other/x.ts|sub/a.ts', 'other/x.ts|sub/b.ts', 'sub/a.ts|sub/b.ts',
    ]);

    const graph = buildGraph([makeFile('a.ts'), makeFile('b.ts')], path.join(repo, 'sub'), {
      coChanges,
      fileGitMeta: tracker.getFileGitMeta(commits),
      gitPathPrefix: tracker.getRepoPrefix(),
    });
    const edges = graph.edges.filter(e => e.type === 'co-change');
    expect(edges).toHaveLength(1);
    expect([edges[0].source, edges[0].target].sort()).toEqual(['file:a.ts', 'file:b.ts']);

    // Per-file git meta is joined the same way (commitCount was missing for every subfolder node)
    const a = graph.nodes.find(n => n.id === 'file:a.ts');
    expect(a?.meta?.commitCount).toBe(3);
  });

  it('repo root keeps working with an empty prefix', () => {
    const tracker = new AgentTracker(repo);
    expect(tracker.getRepoPrefix()).toBe('');
    const commits = tracker.getGitLog(50);
    const graph = buildGraph(
      [makeFile('sub/a.ts'), makeFile('sub/b.ts'), makeFile('other/x.ts')], repo,
      { coChanges: tracker.getCoChanges(commits), gitPathPrefix: tracker.getRepoPrefix() },
    );
    expect(graph.edges.filter(e => e.type === 'co-change')).toHaveLength(3);
  });

  it('[SPEC] a subfolder with a non-ASCII name and spaces draws its line (git log must not octal-quote paths)', async () => {
    const session = new TargetSession(path.join(repo, '한글 폴더'), {
      onFileChange: () => {}, onLiveEvent: () => {}, onBuildRecorded: () => {},
    });
    try {
      const data = session.getGraphData();
      const edges = data.edges.filter(e => e.type === 'co-change');
      expect(edges.map(e => [e.source, e.target].sort().join('|'))).toEqual(['file:가.ts|file:나.ts']);
      expect(data.nodes.find(n => n.id === 'file:가.ts')?.meta?.commitCount).toBe(3);
    } finally {
      await session.close();
    }
  });
});

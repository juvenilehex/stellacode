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
    // The raw git scan sees all three pairs, spelled repo-root-relative
    const raw = tracker.getCoChanges(tracker.getGitLog(50)).pairs;
    expect(raw.map(c => [c.fileA, c.fileB].sort().join('|')).filter(k => !k.includes('한글')).sort()).toEqual([
      'other/x.ts|sub/a.ts', 'other/x.ts|sub/b.ts', 'sub/a.ts|sub/b.ts',
    ]);

    // The co-change history is scoped to the opened folder before anything is ranked or joined
    const commits = tracker.getCoChangeLog();
    const coChanges = tracker.getCoChanges(commits).pairs;
    expect(coChanges.map(c => [c.fileA, c.fileB].sort().join('|'))).toEqual(['a.ts|b.ts']);

    const graph = buildGraph([makeFile('a.ts'), makeFile('b.ts')], path.join(repo, 'sub'), {
      coChanges,
      fileGitMeta: tracker.getFileGitMeta(commits),
      fileAgentMeta: tracker.getFileAgentMeta(commits),
    });
    const edges = graph.edges.filter(e => e.type === 'co-change');
    expect(edges).toHaveLength(1);
    expect([edges[0].source, edges[0].target].sort()).toEqual(['file:a.ts', 'file:b.ts']);

    // Per-file git meta is joined the same way (commitCount was missing for every subfolder node)
    const a = graph.nodes.find(n => n.id === 'file:a.ts');
    expect(a?.meta?.commitCount).toBe(3);
    expect(a?.meta).toHaveProperty('agentRatio', 0);
  });

  it('repo root keeps working with an empty prefix', () => {
    const tracker = new AgentTracker(repo);
    expect(tracker.getRepoPrefix()).toBe('');
    const commits = tracker.getCoChangeLog();
    const graph = buildGraph(
      [makeFile('sub/a.ts'), makeFile('sub/b.ts'), makeFile('other/x.ts')], repo,
      { coChanges: tracker.getCoChanges(commits).pairs, fileGitMeta: tracker.getFileGitMeta(commits) },
    );
    expect(graph.nodes.find(n => n.id === 'file:other/x.ts')?.meta?.commitCount).toBe(3);
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

describe('Git panel lists when a subfolder of a git repo is opened', () => {
  it('Hot / Co-Change / timeline name only files inside the opened folder, folder-relative', () => {
    const tracker = new AgentTracker(path.join(repo, 'sub'));
    const stats = tracker.getGitStats();
    expect(stats.coChanges.map(c => [c.fileA, c.fileB].sort().join('|'))).toEqual(['a.ts|b.ts']);
    // R675: the panel gets the pair's evidence, counted inside the opened folder, and the totals it states
    expect(stats.coChanges[0].shared.length).toBe(stats.coChanges[0].frequency);
    expect(stats.coChanges[0].shared.every(s => s.files === 2 && /^[0-9a-f]{7,}$/.test(s.shortHash))).toBe(true);
    expect(stats.coChangeTotal).toBe(1);
    expect(stats.largeChangesetFiles).toBe(30);
    expect(stats.hotFiles.map(h => h.path).sort()).toEqual(['a.ts', 'b.ts']);
    const paths = tracker.getTimeline(50).flatMap(c => c.fileStatuses.map(f => f.path));
    expect(paths.length).toBeGreaterThan(0);
    expect([...new Set(paths)].sort()).toEqual(['a.ts', 'b.ts']);
  });

  it('at the repo root the lists stay repo-wide with repo-root paths', () => {
    const tracker = new AgentTracker(repo);
    const hot = tracker.getGitStats().hotFiles.map(h => h.path);
    expect(hot).toContain('other/x.ts');
    expect(hot).toContain('sub/a.ts');
  });
});

// R657 finding: the graph ranked co-change pairs repo-wide (top maxCoChangePairs) and only then
// dropped pairs outside the opened folder, while the Git panel ranked inside the folder. In a
// subfolder whose pairs are weaker than the rest of the repo, the panel listed pairs whose two
// files were both nodes and yet no line was drawn (19 of 50 in client/src of this repo).
describe('one co-change analysis for the graph and the Git panel', () => {
  let crowded: string;
  const g = (args: string[]) => execFileSync('git', args, { cwd: crowded, windowsHide: true, stdio: 'pipe' });

  beforeAll(() => {
    crowded = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-crowd-'));
    g(['init', '-q']);
    g(['config', 'user.email', 't@t']);
    g(['config', 'user.name', 't']);
    fs.mkdirSync(path.join(crowded, 'sub'));
    fs.mkdirSync(path.join(crowded, 'other'));
    // 12 files outside 'sub' always change together: 66 pairs at 100% coupling, more than
    // maxCoChangePairs (50), all ranked above the in-folder pair.
    const others = Array.from({ length: 12 }, (_, i) => `other/o${i}.ts`);
    const write = (files: string[], v: string) => {
      for (const f of files) fs.writeFileSync(path.join(crowded, f), `export const v = '${v}';\n`);
      g(['add', '-A']);
      g(['commit', '-q', '-m', v]);
    };
    for (let i = 0; i < 3; i++) write(others, `o${i}`);
    // sub/a.ts + sub/b.ts change together 3 times, and each once alone: coupling 0.75
    for (let i = 0; i < 3; i++) write(['sub/a.ts', 'sub/b.ts'], `ab${i}`);
    write(['sub/a.ts'], 'a');
    write(['sub/b.ts'], 'b');
  });

  afterAll(() => {
    fs.rmSync(crowded, { recursive: true, force: true });
  });

  it('[SPEC] a subfolder pair outranked repo-wide still gets its line, and the panel lists the same pair', async () => {
    const session = new TargetSession(path.join(crowded, 'sub'), {
      onFileChange: () => {}, onLiveEvent: () => {}, onBuildRecorded: () => {},
    });
    try {
      const data = session.getGraphData();
      const drawn = data.edges.filter(e => e.type === 'co-change')
        .map(e => [e.source, e.target].map(id => id.replace(/^file:/, '')).sort().join('|'));
      expect(drawn).toEqual(['a.ts|b.ts']);
      const listed = session.agentTracker.getGitStats().coChanges.map(c => [c.fileA, c.fileB].sort().join('|'));
      expect(listed).toEqual(drawn);
      // Per-file meta joins on the same folder-relative keys
      const a = data.nodes.find(n => n.id === 'file:a.ts');
      expect(a?.meta?.commitCount).toBe(4);
      expect(a?.meta).toHaveProperty('agentRatio', 0);
    } finally {
      await session.close();
    }
  });
});

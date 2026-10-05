import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TargetSession } from '../target-session.js';
import type { IntegrityResult } from '../routes/quality.js';
import type { FileChangeEvent } from '../watcher.js';

/**
 * TargetSession runs the real procedure (R575): parse → build → integrity check →
 * commit or refuse, with real file and live-agent watchers on temporary directories.
 * Before R575 this code lived in index.ts, which starts the server on import, so
 * only a stubbed switchTarget was ever tested.
 */

const dirs: string[] = [];
let session: TargetSession | null = null;

afterEach(async () => {
  await session?.close();
  session = null;
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function tempProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-session-'));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

const TWO_FILES = { 'a.ts': "import { b } from './b';\nexport const a = b;\n", 'b.ts': 'export const b = 1;\n' };

function open(dir: string) {
  const recorded: IntegrityResult[] = [];
  const changes: FileChangeEvent[] = [];
  session = new TargetSession(dir, {
    onFileChange: (e) => changes.push(e),
    onLiveEvent: () => {},
    onBuildRecorded: (i) => recorded.push(i),
  });
  return { s: session, recorded, changes };
}

function removeSources(dir: string) {
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f));
}

describe('TargetSession — startup', () => {
  it('[SPEC] builds the target on construction and records that build', () => {
    const dir = tempProject(TWO_FILES);
    const { s, recorded } = open(dir);
    expect(s.getTargetDir()).toBe(dir);
    expect(s.getGraphData().stats.totalFiles).toBe(2);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].valid).toBe(true);
    expect(s.getLastIntegrity()).toBe(recorded[0]);
    expect(recorded[0].buildId).toBe(s.getGraphData().buildId);
  });

  it('[SPEC] with no previous graph a failing build is still shown — and reported as failed', () => {
    const { s, recorded } = open(tempProject({ 'readme.txt': 'no source' }));
    expect(s.getGraphData().nodes).toHaveLength(0);
    expect(recorded[0].valid).toBe(false);
    expect(s.getLastIntegrity().valid).toBe(false);
  });
});

describe('TargetSession — switchTarget', () => {
  it('[SPEC] a directory that fails the integrity check changes nothing and records nothing', () => {
    const dir = tempProject(TWO_FILES);
    const { s, recorded } = open(dir);
    s.agentTracker.trackFileChange('a.ts', 'file_edit');
    const graph = s.getGraphData();
    const integrity = s.getLastIntegrity();

    const result = s.switchTarget(tempProject({ 'notes.md': '# nothing to parse' }));

    expect(result.valid).toBe(false);
    expect(s.getTargetDir()).toBe(dir);
    expect(s.getGraphData()).toBe(graph);
    expect(s.getLastIntegrity()).toBe(integrity);
    expect(recorded).toHaveLength(1);
    // agent history survives a refused switch (updateTarget would have cleared it)
    expect(s.agentTracker.getEvents()).toHaveLength(1);
  });

  it('[SPEC] a valid directory becomes the target with its graph, build record and a fresh agent history', () => {
    const { s, recorded } = open(tempProject(TWO_FILES));
    s.agentTracker.trackFileChange('a.ts', 'file_edit');
    const next = tempProject({ 'only.ts': 'export const x = 1;\n' });

    const result = s.switchTarget(next);

    expect(result.valid).toBe(true);
    expect(s.getTargetDir()).toBe(next);
    expect(s.getGraphData().rootDir).toBe(path.basename(next));
    expect(s.getGraphData().stats.totalFiles).toBe(1);
    expect(recorded).toHaveLength(2);
    expect(s.getLastIntegrity()).toBe(result);
    expect(s.agentTracker.getEvents()).toHaveLength(0);
  });
});

describe('TargetSession — rebuild', () => {
  it('[SPEC] a failing rebuild keeps the graph but records the failure; the next good build clears it', () => {
    const dir = tempProject(TWO_FILES);
    const { s, recorded } = open(dir);
    const kept = s.getGraphData();

    removeSources(dir);
    expect(s.rebuild()).toBe(false);
    expect(s.getGraphData()).toBe(kept);
    const failed = s.getLastIntegrity();
    expect(failed.valid).toBe(false);
    expect(failed.nodeCount).toBe(0);
    expect(recorded.at(-1)).toBe(failed);
    // the failed build is newer than the graph on screen — the client orders statuses by it
    expect(failed.buildEpoch).toBe(kept.buildEpoch);
    expect(failed.buildId).toBeGreaterThan(kept.buildId);

    fs.writeFileSync(path.join(dir, 'back.ts'), 'export const back = 1;\n');
    expect(s.rebuild()).toBe(true);
    expect(s.getGraphData().stats.totalFiles).toBe(1);
    expect(s.getLastIntegrity().valid).toBe(true);
    expect(recorded).toHaveLength(3);
  });

  it('[SPEC] the real file watcher reports a deleted source file to onFileChange', async () => {
    const dir = tempProject(TWO_FILES);
    const { changes } = open(dir);
    await new Promise(r => setTimeout(r, 600)); // chokidar needs its initial scan before events
    fs.rmSync(path.join(dir, 'b.ts'));
    const deadline = Date.now() + 5000;
    while (!changes.some(c => c.type === 'unlink') && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 50));
    }
    expect(changes.find(c => c.type === 'unlink')?.relativePath).toBe('b.ts');
  });
});

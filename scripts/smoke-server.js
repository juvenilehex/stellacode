// Smoke test through the published entry point (bin/stellacode.js): start it on a tiny
// project, check the graph API, open a WebSocket like a browser tab, then stop it the
// way a terminal Ctrl+C does and require a clean exit.
//
// On macOS/Linux the CLI runs in its own process group and the group gets SIGINT, so
// both the wrapper and the server receive it (the wrapper also forwards SIGTERM) --
// the same signals a terminal sends. Both must be gone within the deadline, the
// wrapper with exit code 0, and the port must stop answering.
// On Windows a signal is a forced kill, so the shutdown path is not exercised there;
// the process tree is killed and only startup is checked.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'bin', 'stellacode.js');
const serverEntry = path.join(repoRoot, 'server', 'dist', 'index.js');
const isWindows = process.platform === 'win32';
const START_DEADLINE_MS = 15_000;
const EXIT_DEADLINE_MS = 10_000;

if (!existsSync(serverEntry)) {
  console.error('[smoke] Server build not found. Run `npm run build` first.');
  process.exit(1);
}

const targetDir = mkdtempSync(path.join(tmpdir(), 'stellacode-smoke-'));
writeFileSync(path.join(targetDir, 'index.ts'), "import { helper } from './helper';\nexport function main() { return helper(); }\n");
writeFileSync(path.join(targetDir, 'helper.ts'), "export function helper() { return 'stars'; }\n");

const port = String(43000 + Math.floor(Math.random() * 1000));
const baseUrl = `http://127.0.0.1:${port}`;
const logs = { stdout: '', stderr: '' };

const child = spawn(process.execPath, [cliEntry, '--no-open', targetDir], {
  cwd: repoRoot,
  env: { ...process.env, STELLA_PORT: port },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: !isWindows, // own process group, so the group can be signalled like a terminal does
  windowsHide: true,
});
child.stdout.on('data', chunk => { logs.stdout += chunk.toString(); });
child.stderr.on('data', chunk => { logs.stderr += chunk.toString(); });
let exitInfo = null;
const exited = new Promise(resolve => {
  child.on('exit', (code, signal) => { exitInfo = { code, signal }; resolve(exitInfo); });
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const within = (promise, ms) => Promise.race([promise, sleep(ms).then(() => null)]);

async function waitForGraph() {
  const deadline = Date.now() + START_DEADLINE_MS;
  while (Date.now() < deadline) {
    if (exitInfo) throw new Error(`CLI exited before responding (code ${exitInfo.code}, signal ${exitInfo.signal})`);
    try {
      const res = await fetch(`${baseUrl}/api/graph`);
      if (res.ok) return res.json();
    } catch {
      // Server is still starting.
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${baseUrl}/api/graph`);
}

async function stillAnswering() {
  try {
    await fetch(`${baseUrl}/api/stats`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

function killTree(signal) {
  if (isWindows) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (err) {
    if (err?.code !== 'ESRCH') throw err; // ESRCH: the group is already gone
  }
}

let ws = null;
let failed = false;
try {
  const graph = await waitForGraph();
  if (!graph?.stats || graph.stats.totalFiles < 2 || graph.stats.totalEdges < 1) {
    throw new Error(`unexpected graph stats: ${JSON.stringify(graph?.stats)}`);
  }
  console.log(`[smoke] Server started and built graph: ${graph.stats.totalFiles} files, ${graph.stats.totalEdges} edges`);

  ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });

  if (isWindows) {
    killTree('SIGKILL');
    if (!(await within(exited, EXIT_DEADLINE_MS))) throw new Error('CLI did not exit after taskkill');
    console.log('[smoke] Windows: stopped by killing the process tree (signals are forced kills here; the Ctrl+C path is checked on macOS/Linux)');
  } else {
    killTree('SIGINT');
    const result = await within(exited, EXIT_DEADLINE_MS);
    if (!result) throw new Error(`CLI did not exit within ${EXIT_DEADLINE_MS / 1000}s after SIGINT (Ctrl+C)`);
    if (result.code !== 0) throw new Error(`CLI exited with code ${result.code} (signal ${result.signal}) after SIGINT, expected 0`);
    console.log('[smoke] Ctrl+C (SIGINT to the process group) stopped the CLI and server with exit code 0');
  }
  if (await stillAnswering()) throw new Error(`port ${port} still answers after the CLI exited -- the server outlived it`);
} catch (err) {
  failed = true;
  console.error('[smoke] Failed:', err instanceof Error ? err.message : err);
} finally {
  ws?.terminate();
  if (!exitInfo || (await stillAnswering())) {
    killTree('SIGKILL');
    await within(exited, 5_000);
  }
  if (failed) {
    if (logs.stdout.trim()) console.error('[smoke] stdout:\n' + logs.stdout.trim());
    if (logs.stderr.trim()) console.error('[smoke] stderr:\n' + logs.stderr.trim());
  }
  rmSync(targetDir, { recursive: true, force: true });
}
// Exit explicitly: a leftover child holding our stdout pipe must not keep the job
// running for hours (that is how the June-August CI runs hit the 6-hour limit).
process.exit(failed ? 1 : 0);

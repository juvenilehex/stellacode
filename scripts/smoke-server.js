import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const serverEntry = path.join(repoRoot, 'server', 'dist', 'index.js');

if (!existsSync(serverEntry)) {
  console.error('[smoke] Server build not found. Run `npm run build` first.');
  process.exit(1);
}

const targetDir = mkdtempSync(path.join(tmpdir(), 'stellacode-smoke-'));
writeFileSync(path.join(targetDir, 'index.ts'), "import { helper } from './helper';\nexport function main() { return helper(); }\n");
writeFileSync(path.join(targetDir, 'helper.ts'), "export function helper() { return 'stars'; }\n");

const port = String(43000 + Math.floor(Math.random() * 1000));
const logs = { stdout: '', stderr: '' };
let childExited = false;

const child = spawn(process.execPath, [serverEntry, targetDir], {
  cwd: repoRoot,
  env: {
    ...process.env,
    STELLA_PORT: port,
    STELLA_TARGET: targetDir,
    NODE_ENV: 'test',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

child.stdout.on('data', chunk => { logs.stdout += chunk.toString(); });
child.stderr.on('data', chunk => { logs.stderr += chunk.toString(); });
child.on('exit', () => { childExited = true; });

async function waitForGraph() {
  const url = `http://127.0.0.1:${port}/api/graph`;
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (childExited) {
      throw new Error('server exited before responding');
    }

    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
    } catch {
      // Server is still starting.
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw new Error(`timed out waiting for ${url}`);
}

try {
  const graph = await waitForGraph();
  if (!graph?.stats || graph.stats.totalFiles < 2 || graph.stats.totalEdges < 1) {
    throw new Error(`unexpected graph stats: ${JSON.stringify(graph?.stats)}`);
  }
  console.log(`[smoke] Server started and built graph: ${graph.stats.totalFiles} files, ${graph.stats.totalEdges} edges`);
} catch (err) {
  console.error('[smoke] Failed:', err instanceof Error ? err.message : err);
  if (logs.stdout.trim()) console.error('[smoke] stdout:\n' + logs.stdout.trim());
  if (logs.stderr.trim()) console.error('[smoke] stderr:\n' + logs.stderr.trim());
  process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
  rmSync(targetDir, { recursive: true, force: true });
}

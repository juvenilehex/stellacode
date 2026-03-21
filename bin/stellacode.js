#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Help ──
function printHelp() {
  console.log(`
  stellacode - Code Observatory

  Usage:
    stellacode [options] [path]

  Arguments:
    path              Directory to analyze (default: current directory)

  Options:
    -p, --port PORT   Server port (default: 3001, env: STELLA_PORT)
    --no-open         Don't auto-open the browser
    -h, --help        Show this help message
    -v, --version     Show version
`);
}

// ── Parse args ──
const args = process.argv.slice(2);
let targetDir = '.';
let port = process.env.STELLA_PORT || '3001';
let autoOpen = true;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '-h' || arg === '--help') {
    printHelp();
    process.exit(0);
  }
  if (arg === '-v' || arg === '--version') {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    console.log(`stellacode v${pkg.version}`);
    process.exit(0);
  }
  if (arg === '-p' || arg === '--port') {
    const val = args[++i];
    if (!val || !/^\d+$/.test(val)) {
      console.error('[stellacode] Error: --port requires a numeric value');
      process.exit(1);
    }
    port = val;
    continue;
  }
  if (arg === '--no-open') {
    autoOpen = false;
    continue;
  }
  // Positional = target directory
  if (!arg.startsWith('-')) {
    targetDir = arg;
  }
}

// ── Resolve and validate target ──
targetDir = resolve(targetDir);

if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
  console.error(`[stellacode] Error: "${targetDir}" is not a valid directory`);
  process.exit(1);
}

// ── Locate server entry point ──
const serverEntry = join(__dirname, '..', 'server', 'dist', 'index.js');
if (!existsSync(serverEntry)) {
  console.error('[stellacode] Error: Server build not found. Run `npm run build` first.');
  process.exit(1);
}

// ── Start server ──
console.log(`[stellacode] Target: ${targetDir}`);
console.log(`[stellacode] Port: ${port}`);

const child = spawn(process.execPath, [serverEntry, targetDir], {
  env: {
    ...process.env,
    STELLA_TARGET: targetDir,
    STELLA_PORT: port,
    NODE_ENV: 'production',
  },
  stdio: 'inherit',
});

// ── Auto-open browser ──
if (autoOpen) {
  // Small delay to let the server start
  setTimeout(async () => {
    const url = `http://localhost:${port}`;
    try {
      const { platform } = await import('node:os');
      const os = platform();
      const cmd = os === 'win32' ? 'start' : os === 'darwin' ? 'open' : 'xdg-open';
      const openArgs = os === 'win32' ? ['', url] : [url];
      spawn(cmd, openArgs, { shell: true, stdio: 'ignore', detached: true }).unref();
      console.log(`[stellacode] Opening ${url}`);
    } catch {
      console.log(`[stellacode] Open ${url} in your browser`);
    }
  }, 1500);
}

// ── Graceful shutdown ──
function shutdown() {
  child.kill('SIGTERM');
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AgentEvent } from './types.js';

/** Tools that touch files — extract filePath from input */
const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SEARCH_TOOLS = new Set(['Grep', 'Glob']);
const EXEC_TOOLS = new Set(['Bash']);

interface ToolUseBlock {
  type: 'tool_use';
  name: string;
  input: Record<string, unknown>;
}

interface JournalLine {
  type: 'user' | 'assistant' | string;
  message?: {
    role?: string;
    content?: Array<ToolUseBlock | { type: string }>;
  };
  timestamp?: string;
  cwd?: string;
}

type EventCallback = (event: AgentEvent) => void;

/**
 * Watches Claude Code JSONL session transcripts in real-time.
 * Detects tool_use blocks (Read, Edit, Write, Bash, etc.) and
 * emits AgentEvents with file paths relative to the target directory.
 */
export class LiveAgentWatcher {
  private targetDir: string;
  private claudeProjectDir: string;
  private watchers: fs.FSWatcher[] = [];
  private filePositions = new Map<string, number>();
  private onEvent: EventCallback;
  private eventId = 0;
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private scanRetries = 0;
  private readonly MAX_SCAN_RETRIES = 60; // 5 minutes at 5s intervals
  private knownFiles = new Set<string>();

  constructor(targetDir: string, onEvent: EventCallback) {
    this.targetDir = path.resolve(targetDir);
    this.onEvent = onEvent;

    // Claude Code stores sessions under ~/.claude/projects/{encoded-path}/
    const encoded = this.targetDir.replace(/[/\\:]/g, '-');
    // Try multiple encoding patterns Claude Code might use
    const homeDir = os.homedir();
    this.claudeProjectDir = path.join(homeDir, '.claude', 'projects');

    this.start();
  }

  private start() {
    // Find the matching project directory
    const projectDir = this.findProjectDir();
    if (!projectDir) {
      console.log('[LiveAgent] No Claude Code session directory found for this project');
      // Keep scanning periodically in case sessions start later (capped retries)
      this.scanInterval = setInterval(() => {
        this.scanRetries++;
        if (this.scanRetries >= this.MAX_SCAN_RETRIES) {
          if (this.scanInterval) clearInterval(this.scanInterval);
          this.scanInterval = null;
          console.log('[LiveAgent] Gave up scanning after', this.MAX_SCAN_RETRIES, 'attempts');
          return;
        }
        const dir = this.findProjectDir();
        if (dir) this.watchDirectory(dir);
      }, 5000);
      return;
    }

    this.watchDirectory(projectDir);
  }

  private findProjectDir(): string | null {
    if (!fs.existsSync(this.claudeProjectDir)) return null;

    try {
      const dirs = fs.readdirSync(this.claudeProjectDir);

      // Extract the last meaningful path segments for matching
      // e.g. "C:\Users\juven\OneDrive\Desktop\PJ00_SUB\SPJ11_stellaagent"
      //   -> segments: ["PJ00_SUB", "SPJ11_stellaagent"] or similar
      const segments = this.targetDir.replace(/\\/g, '/').split('/')
        .filter(s => s && !s.includes(':'));
      // Use last 2 segments as search key (lowercased, no underscores)
      const lastSegments = segments.slice(-2).join('-').toLowerCase()
        .replace(/_/g, '-');

      for (const dir of dirs) {
        const fullPath = path.join(this.claudeProjectDir, dir);
        try {
          if (!fs.statSync(fullPath).isDirectory()) continue;
        } catch { continue; }

        const dirLower = dir.toLowerCase().replace(/_/g, '-');
        // Check if the directory name ends with our project identifier
        if (dirLower.endsWith(lastSegments) || dirLower.includes(lastSegments)) {
          return fullPath;
        }
      }
    } catch {
      // Ignore read errors
    }

    return null;
  }

  private findJsonlFiles(dir: string): string[] {
    const results: string[] = [];
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (entry.endsWith('.jsonl')) {
          results.push(path.join(dir, entry));
        }
      }
    } catch { /* ignore */ }
    return results;
  }

  private watchDirectory(projectDir: string) {
    console.log(`[LiveAgent] Watching Claude sessions in: ${projectDir}`);

    // Watch for new JSONL files
    try {
      const watcher = fs.watch(projectDir, (eventType, filename) => {
        if (filename?.endsWith('.jsonl')) {
          const filePath = path.join(projectDir, filename);
          if (!this.knownFiles.has(filePath)) {
            this.knownFiles.add(filePath);
            this.tailFile(filePath);
          }
        }
      });
      watcher.on('error', () => { /* ignore watch errors */ });
      this.watchers.push(watcher);
    } catch { /* ignore */ }

    // Start tailing existing JSONL files (most recent ones)
    const jsonlFiles = this.findJsonlFiles(projectDir)
      .map(f => ({ path: f, mtime: fs.statSync(f).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 3); // Only watch 3 most recent sessions

    for (const f of jsonlFiles) {
      this.knownFiles.add(f.path);
      this.tailFile(f.path);
    }
  }

  private tailFile(filePath: string) {
    // Start from end of file (only new lines)
    try {
      const stat = fs.statSync(filePath);
      this.filePositions.set(filePath, stat.size);
    } catch {
      this.filePositions.set(filePath, 0);
    }

    // Watch for changes
    try {
      const watcher = fs.watch(filePath, () => {
        this.readNewLines(filePath);
      });
      watcher.on('error', () => { /* ignore watch errors */ });
      this.watchers.push(watcher);
    } catch { /* ignore */ }
  }

  private readNewLines(filePath: string) {
    const lastPos = this.filePositions.get(filePath) ?? 0;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch { return; }

    if (stat.size <= lastPos) return;

    // Cap read size to prevent excessive memory allocation (10MB max)
    const readSize = Math.min(stat.size - lastPos, 10 * 1024 * 1024);
    const readEnd = lastPos + readSize;

    let fd: number;
    try {
      fd = fs.openSync(filePath, 'r');
    } catch { return; }

    const buf = Buffer.alloc(readSize);
    try {
      fs.readSync(fd, buf, 0, buf.length, lastPos);
    } finally {
      fs.closeSync(fd);
    }

    this.filePositions.set(filePath, readEnd);

    const text = buf.toString('utf-8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed: JournalLine = JSON.parse(line);
        this.processLine(parsed);
      } catch {
        // Incomplete JSON line, skip
      }
    }
  }

  private processLine(line: JournalLine) {
    if (line.type !== 'assistant') return;

    const content = line.message?.content;
    if (!Array.isArray(content)) return;

    for (const block of content) {
      if (block.type !== 'tool_use') continue;
      const tool = block as ToolUseBlock;
      this.processToolUse(tool, line.timestamp);
    }
  }

  private processToolUse(tool: ToolUseBlock, timestamp?: string) {
    const ts = timestamp ? new Date(timestamp).getTime() : Date.now();
    const toolName = tool.name;

    if (FILE_TOOLS.has(toolName)) {
      const filePath = tool.input.file_path as string | undefined;
      if (!filePath) return;
      const relative = this.toRelativePath(filePath);
      if (!relative) return;

      const eventType = toolName === 'Read' ? 'file_read' as const :
                        toolName === 'Write' ? 'file_create' as const :
                        'file_edit' as const;

      this.emitEvent({
        id: `live-${this.eventId++}`,
        timestamp: ts,
        type: eventType,
        agent: 'claude-code',
        filePath: relative,
        description: `${toolName}: ${relative}`,
      });
    } else if (SEARCH_TOOLS.has(toolName)) {
      const searchPath = (tool.input.path as string) || (tool.input.file_path as string);
      const relative = searchPath ? this.toRelativePath(searchPath) : undefined;

      this.emitEvent({
        id: `live-${this.eventId++}`,
        timestamp: ts,
        type: 'command',
        agent: 'claude-code',
        filePath: relative,
        description: `${toolName}: ${(tool.input.pattern as string) || ''}`,
      });
    } else if (EXEC_TOOLS.has(toolName)) {
      const cmd = tool.input.command as string | undefined;
      this.emitEvent({
        id: `live-${this.eventId++}`,
        timestamp: ts,
        type: 'command',
        agent: 'claude-code',
        description: cmd ? `$ ${cmd.slice(0, 80)}` : 'bash',
      });
    }
  }

  private toRelativePath(absPath: string): string | undefined {
    const normalized = absPath.replace(/\\/g, '/');
    const targetNorm = this.targetDir.replace(/\\/g, '/');
    if (normalized.startsWith(targetNorm)) {
      return normalized.slice(targetNorm.length + 1);
    }
    return undefined;
  }

  private emitEvent(event: AgentEvent) {
    this.onEvent(event);
  }

  updateTarget(newTarget: string) {
    this.close();
    this.targetDir = path.resolve(newTarget);
    this.filePositions.clear();
    this.knownFiles.clear();
    this.start();
  }

  close() {
    for (const w of this.watchers) {
      try { w.close(); } catch { /* ignore */ }
    }
    this.watchers = [];
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  extension: string;
  size: number;
}

/** Maximum directory depth to prevent runaway recursion */
const MAX_DEPTH = 30;

/** Maximum files to scan to prevent memory exhaustion */
const MAX_FILES = 10_000;

/** Maximum individual file size to parse (10 MB) — larger files are skipped */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function scanDirectory(rootDir: string): ScannedFile[] {
  const root = path.resolve(rootDir);
  const files: ScannedFile[] = [];
  const visitedInodes = new Set<string>();

  function walk(dir: string, depth: number) {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      console.warn('[Scanner]', dir, 'readdir failed:', (err as Error).message);
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.isDirectory()) continue;
      if (CONFIG.scanner.ignoreDirs.has(entry.name) && entry.isDirectory()) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Symlink loop protection: track visited directories by real path
        try {
          const realPath = fs.realpathSync(fullPath);
          if (visitedInodes.has(realPath)) continue;
          visitedInodes.add(realPath);
        } catch {
          // intentionally ignored: broken symlink cannot be resolved — skip entry
          continue;
        }
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (CONFIG.scanner.supportedExtensions.has(ext)) {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > MAX_FILE_SIZE) {
              console.warn(`[Scanner] Skipping oversized file (${stat.size} bytes): ${fullPath}`);
            } else {
              files.push({
                absolutePath: fullPath,
                relativePath: path.relative(root, fullPath).replace(/\\/g, '/'),
                extension: ext,
                size: stat.size,
              });
            }
          } catch (err) {
            console.warn('[Scanner]', fullPath, 'stat failed:', (err as Error).message);
          }
        }
      }
    }
  }

  walk(root, 0);

  if (files.length >= MAX_FILES) {
    console.warn(`[Scanner] Hit file limit (${MAX_FILES}). Some files were skipped.`);
  }

  return files;
}

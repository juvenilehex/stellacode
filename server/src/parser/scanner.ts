import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  extension: string;
  size: number;
}

export function scanDirectory(rootDir: string): ScannedFile[] {
  const root = path.resolve(rootDir);
  const files: ScannedFile[] = [];

  function walk(dir: string) {
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
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (CONFIG.scanner.supportedExtensions.has(ext)) {
          try {
            const stat = fs.statSync(fullPath);
            files.push({
              absolutePath: fullPath,
              relativePath: path.relative(root, fullPath).replace(/\\/g, '/'),
              extension: ext,
              size: stat.size,
            });
          } catch (err) {
            console.warn('[Scanner]', fullPath, 'stat failed:', (err as Error).message);
          }
        }
      }
    }
  }

  walk(root);
  return files;
}

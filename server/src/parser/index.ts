import { scanDirectory, type ScannedFile } from './scanner.js';
import { parseTsFile } from './ts-parser.js';
import { parsePythonFile } from './python-parser.js';
import { parseGoFile } from './go-parser.js';
import type { ParsedFile } from './types.js';

export type { ParsedFile, ParsedSymbol, ParsedImport } from './types.js';
export { scanDirectory } from './scanner.js';

export interface ParseProjectResult {
  files: ParsedFile[];
  scannedCount: number;
  parseSuccessCount: number;
  parseFailureCount: number;
  /** Number of files served from cache (incremental parsing) */
  cacheHits: number;
}

/** Parser function signature — implement this to add a new language */
type ParserFn = (absolutePath: string, relativePath: string) => ParsedFile;

/**
 * Parser registry: maps file extensions to parser functions.
 * To add a new language, register it here:
 *   parserRegistry.set('.go', parseGoFile);
 */
const parserRegistry = new Map<string, ParserFn>([
  ['.ts', parseTsFile],
  ['.tsx', parseTsFile],
  ['.js', parseTsFile],
  ['.jsx', parseTsFile],
  ['.mjs', parseTsFile],
  ['.cjs', parseTsFile],
  ['.py', parsePythonFile],
  ['.go', parseGoFile],
]);

export { parserRegistry };

export function parseFile(file: ScannedFile): ParsedFile {
  const parser = parserRegistry.get(file.extension) ?? parseTsFile;
  return parser(file.absolutePath, file.relativePath);
}

// ── Incremental parsing cache ──
// Caches parsed results by file path + mtime + size.
// On rebuild, only files that changed since last scan are re-parsed.

interface CacheEntry {
  mtimeMs: number;
  size: number;
  result: ParsedFile;
}

const parseCache = new Map<string, CacheEntry>();

/** Clear the incremental parse cache (e.g. on target change) */
export function clearParseCache(): void {
  parseCache.clear();
}

export function parseProject(rootDir: string): ParseProjectResult {
  const scanned = scanDirectory(rootDir);
  const files: ParsedFile[] = [];
  let parseFailureCount = 0;
  let cacheHits = 0;

  // Track current file set to prune stale cache entries
  const currentPaths = new Set<string>();

  for (const scannedFile of scanned) {
    currentPaths.add(scannedFile.relativePath);

    // Check cache: skip re-parse if file hasn't changed
    const cached = parseCache.get(scannedFile.relativePath);
    if (cached && cached.mtimeMs === scannedFile.mtimeMs && cached.size === scannedFile.size) {
      files.push(cached.result);
      cacheHits++;
      continue;
    }

    // Parse the file (new or changed)
    const parsed = parseFile(scannedFile);
    files.push(parsed);

    // Update cache
    parseCache.set(scannedFile.relativePath, {
      mtimeMs: scannedFile.mtimeMs,
      size: scannedFile.size,
      result: parsed,
    });

    if (scannedFile.size > 0 && parsed.size === 0 && parsed.lineCount === 0) {
      parseFailureCount++;
    }
  }

  // Prune cache entries for deleted files
  for (const key of parseCache.keys()) {
    if (!currentPaths.has(key)) {
      parseCache.delete(key);
    }
  }

  return {
    files,
    scannedCount: scanned.length,
    parseSuccessCount: scanned.length - parseFailureCount,
    parseFailureCount,
    cacheHits,
  };
}

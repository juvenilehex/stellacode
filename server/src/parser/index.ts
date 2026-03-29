import { scanDirectory, type ScannedFile } from './scanner.js';
import { parseTsFile } from './ts-parser.js';
import { parsePythonFile } from './python-parser.js';
import type { ParsedFile } from './types.js';

export type { ParsedFile, ParsedSymbol, ParsedImport } from './types.js';
export { scanDirectory } from './scanner.js';

export interface ParseProjectResult {
  files: ParsedFile[];
  scannedCount: number;
  parseSuccessCount: number;
  parseFailureCount: number;
}

export function parseFile(file: ScannedFile): ParsedFile {
  if (file.extension === '.py') {
    return parsePythonFile(file.absolutePath, file.relativePath);
  }
  return parseTsFile(file.absolutePath, file.relativePath);
}

export function parseProject(rootDir: string): ParseProjectResult {
  const scanned = scanDirectory(rootDir);
  const files: ParsedFile[] = [];
  let parseFailureCount = 0;

  for (const scannedFile of scanned) {
    const parsed = parseFile(scannedFile);
    files.push(parsed);
    // A file with size 0 after parsing (when the scanned file had size > 0) indicates a read failure
    if (scannedFile.size > 0 && parsed.size === 0 && parsed.lineCount === 0) {
      parseFailureCount++;
    }
  }

  return {
    files,
    scannedCount: scanned.length,
    parseSuccessCount: scanned.length - parseFailureCount,
    parseFailureCount,
  };
}

import { scanDirectory, type ScannedFile } from './scanner.js';
import { parseTsFile } from './ts-parser.js';
import { parsePythonFile } from './python-parser.js';
import type { ParsedFile } from './types.js';

export type { ParsedFile, ParsedSymbol, ParsedImport } from './types.js';
export { scanDirectory } from './scanner.js';

export function parseFile(file: ScannedFile): ParsedFile {
  if (file.extension === '.py') {
    return parsePythonFile(file.absolutePath, file.relativePath);
  }
  return parseTsFile(file.absolutePath, file.relativePath);
}

export function parseProject(rootDir: string): ParsedFile[] {
  const scanned = scanDirectory(rootDir);
  return scanned.map(parseFile);
}

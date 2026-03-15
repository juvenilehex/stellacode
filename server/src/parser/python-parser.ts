import fs from 'node:fs';
import type { ParsedFile, ParsedSymbol, ParsedImport } from './types.js';

const PATTERNS = {
  functionDef: /^(\s*)def\s+(\w+)\s*\(/,
  asyncFunctionDef: /^(\s*)async\s+def\s+(\w+)\s*\(/,
  classDef: /^(\s*)class\s+(\w+)/,
  importFrom: /^from\s+(\S+)\s+import\s+(.+)/,
  importModule: /^import\s+(\S+)(?:\s+as\s+\w+)?/,
  variable: /^(\w+)\s*[=:]/,
};

export function parsePythonFile(absolutePath: string, relativePath: string): ParsedFile {
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf-8');
  } catch (err) {
    console.warn('[Parser]', relativePath, 'read failed:', (err as Error).message);
    return {
      path: absolutePath, relativePath, language: 'python',
      symbols: [], imports: [], lineCount: 0, size: 0,
    };
  }

  const lines = content.split('\n');
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  let currentClass = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const lineNum = i + 1;
    const indent = line.length - trimmed.length;

    if (trimmed.startsWith('#') || trimmed === '') continue;

    // Track class scope by indentation
    if (indent === 0) currentClass = false;

    // Classes
    const classMatch = line.match(PATTERNS.classDef);
    if (classMatch && classMatch[1].length === 0) {
      symbols.push({ name: classMatch[2], kind: 'class', line: lineNum, exported: true });
      currentClass = true;
      continue;
    }

    // Functions / methods
    const funcMatch = line.match(PATTERNS.functionDef) || line.match(PATTERNS.asyncFunctionDef);
    if (funcMatch) {
      const isMethod = currentClass && funcMatch[1].length > 0;
      const name = funcMatch[2];
      if (!name.startsWith('_') || name === '__init__') {
        symbols.push({
          name,
          kind: isMethod ? 'method' : 'function',
          line: lineNum,
          exported: !name.startsWith('_'),
        });
      }
      continue;
    }

    // from X import Y
    const fromMatch = trimmed.match(PATTERNS.importFrom);
    if (fromMatch) {
      const specifiers = fromMatch[2].split(',').map(s => { const parts = s.trim().split(/\s+as\s+/); return (parts[parts.length - 1] ?? '').trim(); }).filter(Boolean);
      imports.push({ source: fromMatch[1], specifiers, isDefault: false, isNamespace: false, line: lineNum });
      continue;
    }

    // import X
    const importMatch = trimmed.match(PATTERNS.importModule);
    if (importMatch) {
      imports.push({ source: importMatch[1], specifiers: [importMatch[1]], isDefault: true, isNamespace: false, line: lineNum });
      continue;
    }

    // Top-level variables
    if (indent === 0) {
      const varMatch = trimmed.match(PATTERNS.variable);
      if (varMatch && varMatch[1] === varMatch[1].toUpperCase() && varMatch[1].length > 1) {
        symbols.push({ name: varMatch[1], kind: 'variable', line: lineNum, exported: true });
      }
    }
  }

  return {
    path: absolutePath, relativePath, language: 'python',
    symbols, imports, lineCount: lines.length, size: content.length,
  };
}

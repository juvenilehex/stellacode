import fs from 'node:fs';
import type { ParsedFile, ParsedSymbol, ParsedImport } from './types.js';

// Regex-based TS/JS parser (no native deps, Windows-safe)
// Extracts: functions, classes, interfaces, types, enums, imports, exports

const PATTERNS = {
  // Functions
  functionDecl: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
  arrowConst: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/,
  arrowConstArrow: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\w+\s*=>/,

  // Classes
  classDecl: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
  method: /^\s+(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?(\w+)\s*\(/,

  // TypeScript specific
  interfaceDecl: /^(?:export\s+)?interface\s+(\w+)/,
  typeDecl: /^(?:export\s+)?type\s+(\w+)\s*=/,
  enumDecl: /^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/,

  // Imports
  importFrom: /^import\s+(?:type\s+)?(.+?)\s+from\s+['"](.+?)['"]/,
  importSide: /^import\s+['"](.+?)['"]/,
  require: /(?:const|let|var)\s+(.+?)\s*=\s*require\(['"](.+?)['"]\)/,
};

function parseImportSpecifiers(raw: string): { specifiers: string[]; isDefault: boolean; isNamespace: boolean } {
  const trimmed = raw.trim();

  // import * as X from '...'
  if (trimmed.startsWith('*')) {
    const match = trimmed.match(/\*\s+as\s+(\w+)/);
    return { specifiers: [match?.[1] ?? '*'], isDefault: false, isNamespace: true };
  }

  // import { A, B } from '...'
  const braceMatch = trimmed.match(/\{(.+?)\}/);
  if (braceMatch) {
    const named = braceMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean);
    // Check for default import before braces
    const beforeBrace = trimmed.slice(0, trimmed.indexOf('{')).trim().replace(/,\s*$/, '');
    if (beforeBrace) {
      return { specifiers: [beforeBrace, ...named], isDefault: true, isNamespace: false };
    }
    return { specifiers: named, isDefault: false, isNamespace: false };
  }

  // import X from '...'
  return { specifiers: [trimmed], isDefault: true, isNamespace: false };
}

export function parseTsFile(absolutePath: string, relativePath: string): ParsedFile {
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf-8');
  } catch (err) {
    console.warn('[Parser]', relativePath, 'read failed:', (err as Error).message);
    return {
      path: absolutePath,
      relativePath,
      language: relativePath.endsWith('.py') ? 'python' : 'typescript',
      symbols: [],
      imports: [],
      lineCount: 0,
      size: 0,
    };
  }

  const lines = content.split('\n');
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  let inClass = false;
  let braceDepth = 0;
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const lineNum = i + 1;

    // Track block comments /* ... */
    if (inBlockComment) {
      if (trimmed.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }

    // Skip comments and empty lines
    if (trimmed === '' || trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) {
        inBlockComment = true;
      }
      continue;
    }

    // Track brace depth for class methods
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    if (braceDepth <= 0) inClass = false;

    const isExported = trimmed.startsWith('export');

    // Multi-line import: accumulate lines until closing from '...'
    if (trimmed.startsWith('import') && trimmed.includes('{') && !trimmed.includes('}')) {
      let accumulated = trimmed;
      while (i + 1 < lines.length && !accumulated.includes('}')) {
        i++;
        accumulated += ' ' + lines[i].trim();
      }
      const multiMatch = accumulated.match(PATTERNS.importFrom);
      if (multiMatch) {
        const { specifiers, isDefault, isNamespace } = parseImportSpecifiers(multiMatch[1]);
        imports.push({ source: multiMatch[2], specifiers, isDefault, isNamespace, line: lineNum });
      }
      continue;
    }

    // Imports
    let importMatch = trimmed.match(PATTERNS.importFrom);
    if (importMatch) {
      const { specifiers, isDefault, isNamespace } = parseImportSpecifiers(importMatch[1]);
      imports.push({ source: importMatch[2], specifiers, isDefault, isNamespace, line: lineNum });
      continue;
    }

    const sideMatch = trimmed.match(PATTERNS.importSide);
    if (sideMatch) {
      imports.push({ source: sideMatch[1], specifiers: [], isDefault: false, isNamespace: false, line: lineNum });
      continue;
    }

    const requireMatch = trimmed.match(PATTERNS.require);
    if (requireMatch) {
      const { specifiers, isDefault, isNamespace } = parseImportSpecifiers(requireMatch[1]);
      imports.push({ source: requireMatch[2], specifiers, isDefault, isNamespace, line: lineNum });
      continue;
    }

    // Classes
    const classMatch = trimmed.match(PATTERNS.classDecl);
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: 'class', line: lineNum, exported: isExported });
      inClass = true;
      continue;
    }

    // Methods (inside class)
    if (inClass && braceDepth > 0) {
      const methodMatch = trimmed.match(PATTERNS.method);
      if (methodMatch && methodMatch[1] !== 'if' && methodMatch[1] !== 'for' && methodMatch[1] !== 'while') {
        symbols.push({ name: methodMatch[1], kind: 'method', line: lineNum, exported: false });
        continue;
      }
    }

    // Interfaces
    const ifaceMatch = trimmed.match(PATTERNS.interfaceDecl);
    if (ifaceMatch) {
      symbols.push({ name: ifaceMatch[1], kind: 'interface', line: lineNum, exported: isExported });
      continue;
    }

    // Type aliases
    const typeMatch = trimmed.match(PATTERNS.typeDecl);
    if (typeMatch) {
      symbols.push({ name: typeMatch[1], kind: 'type', line: lineNum, exported: isExported });
      continue;
    }

    // Enums
    const enumMatch = trimmed.match(PATTERNS.enumDecl);
    if (enumMatch) {
      symbols.push({ name: enumMatch[1], kind: 'enum', line: lineNum, exported: isExported });
      continue;
    }

    // Functions
    const funcMatch = trimmed.match(PATTERNS.functionDecl);
    if (funcMatch) {
      symbols.push({ name: funcMatch[1], kind: 'function', line: lineNum, exported: isExported });
      continue;
    }

    // Arrow functions
    const arrowMatch = trimmed.match(PATTERNS.arrowConst) || trimmed.match(PATTERNS.arrowConstArrow);
    if (arrowMatch) {
      symbols.push({ name: arrowMatch[1], kind: 'function', line: lineNum, exported: isExported });
      continue;
    }
  }

  const ext = relativePath.split('.').pop()?.toLowerCase() ?? '';
  const language = ['ts', 'tsx'].includes(ext) ? 'typescript' as const
    : ['js', 'jsx', 'mjs', 'cjs'].includes(ext) ? 'javascript' as const
    : 'unknown' as const;

  return {
    path: absolutePath,
    relativePath,
    language,
    symbols,
    imports,
    lineCount: lines.length,
    size: content.length,
  };
}

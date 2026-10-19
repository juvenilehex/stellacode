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
  // Use possessive-equivalent character classes ([^=\n]+, [^'"]+) instead of
  // lazy .+? quantifiers to prevent catastrophic backtracking (ReDoS) on
  // pathological input such as lines with many spaces before '='.
  require: /(?:const|let|var)\s+([^=\n]+?)\s*=\s*require\(['"]([^'"]+)['"]\)/,
  // Re-exports name another file too (R675): export { a, b as c } from · export * from ·
  // export * as ns from · export type { T } from · export type * from
  reExport: /^export\s+(?:type\s+)?(\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s+['"]([^'"]+)['"]/,
  reExportOpen: /^export\s+(?:type\s+)?\{/,
};

/** Names a re-export takes from the other file — the left side of `a as b` (what that file must export). */
function reExportSpecifiers(clause: string): { specifiers: string[]; isNamespace: boolean } {
  if (clause.startsWith('*')) {
    const ns = clause.match(/\*\s+as\s+(\w+)/);
    return { specifiers: [ns?.[1] ?? '*'], isNamespace: true };
  }
  const inner = clause.slice(1, -1);
  const names = inner.split(',')
    .map(s => (s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0] ?? '').trim())
    .filter(Boolean);
  return { specifiers: names, isNamespace: false };
}

/**
 * Literal `import('…')` calls in the code part of one line (R675) — what a dynamic import or a type-position
 * `import('…').T` points at. A small scanner rather than a regex so that the same text inside a string,
 * a template literal or a trailing comment is not taken for code (test fixtures and docs hold such text).
 * `inTemplate` carries a template literal across lines; the returned flag says whether this line ends inside one.
 * Limits: `${…}` code inside a template is treated as string; a non-literal `import(x)` cannot be resolved by
 * any static reader and is skipped; regex literals are not recognised, so a quote inside one can hide the rest of that line.
 */
export function scanDynamicImports(line: string, inTemplate: boolean): { sources: string[]; endsInTemplate: boolean } {
  const sources: string[] = [];
  let quote: string | null = inTemplate ? '`' : null;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '/' && line[i + 1] === '/') break;
    if (ch === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; i++; continue; }
    if (line.startsWith('import', i) && !/[\w$.]/.test(line[i - 1] ?? '')) {
      const call = /^import\s*\(\s*(['"`])/.exec(line.slice(i));
      if (call) {
        const open = i + call[0].length;
        const close = line.indexOf(call[1], open);
        if (close === -1) { i = open; quote = call[1]; continue; }
        const src = line.slice(open, close);
        if (!(call[1] === '`' && src.includes('${'))) sources.push(src);
        i = close + 1;
        continue;
      }
    }
    i++;
  }
  return { sources, endsInTemplate: quote === '`' };
}

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
    const named = braceMatch[1].split(',').map(s => { const parts = s.trim().split(/\s+as\s+/); return (parts[parts.length - 1] ?? '').trim(); }).filter(Boolean);
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
  let inTemplate = false;

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

    // A line that starts inside a multi-line template literal is string text: its `import … from` and
    // `import('…')` are fixtures, not references. Imports are read only from code after the closing backtick.
    const startsInTemplate = inTemplate;
    const dynamic = scanDynamicImports(line, inTemplate);
    inTemplate = dynamic.endsInTemplate;
    for (const source of dynamic.sources) {
      imports.push({ source, specifiers: [], isDefault: false, isNamespace: false, line: lineNum, kind: 'dynamic' });
    }

    // Skip comments and empty lines
    if (trimmed === '' || trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('/*')) {
      if (!startsInTemplate && !trimmed.includes('*/')) {
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

    if (!startsInTemplate) {
      // Multi-line import / re-export: accumulate lines until the closing brace
      const multiImport = trimmed.startsWith('import') && trimmed.includes('{') && !trimmed.includes('}');
      const multiReExport = PATTERNS.reExportOpen.test(trimmed) && !trimmed.includes('}');
      if (multiImport || multiReExport) {
        let accumulated = trimmed;
        let maxLines = 50;
        while (i + 1 < lines.length && !accumulated.includes('}') && --maxLines > 0) {
          i++;
          accumulated += ' ' + lines[i].trim();
        }
        if (multiImport) {
          const multiMatch = accumulated.match(PATTERNS.importFrom);
          if (multiMatch) {
            const { specifiers, isDefault, isNamespace } = parseImportSpecifiers(multiMatch[1]);
            imports.push({ source: multiMatch[2], specifiers, isDefault, isNamespace, line: lineNum, kind: 'import' });
          }
        } else {
          const multiMatch = accumulated.match(PATTERNS.reExport);
          if (multiMatch) {
            const { specifiers, isNamespace } = reExportSpecifiers(multiMatch[1]);
            imports.push({ source: multiMatch[2], specifiers, isDefault: false, isNamespace, line: lineNum, kind: 're-export' });
          }
        }
        continue;
      }

      // Imports
      const importMatch = trimmed.match(PATTERNS.importFrom);
      if (importMatch) {
        const { specifiers, isDefault, isNamespace } = parseImportSpecifiers(importMatch[1]);
        imports.push({ source: importMatch[2], specifiers, isDefault, isNamespace, line: lineNum, kind: 'import' });
        continue;
      }

      const sideMatch = trimmed.match(PATTERNS.importSide);
      if (sideMatch) {
        imports.push({ source: sideMatch[1], specifiers: [], isDefault: false, isNamespace: false, line: lineNum, kind: 'import' });
        continue;
      }

      const reExportMatch = trimmed.match(PATTERNS.reExport);
      if (reExportMatch) {
        const { specifiers, isNamespace } = reExportSpecifiers(reExportMatch[1]);
        imports.push({ source: reExportMatch[2], specifiers, isDefault: false, isNamespace, line: lineNum, kind: 're-export' });
        continue;
      }

      const requireMatch = trimmed.match(PATTERNS.require);
      if (requireMatch) {
        const { specifiers, isDefault, isNamespace } = parseImportSpecifiers(requireMatch[1]);
        imports.push({ source: requireMatch[2], specifiers, isDefault, isNamespace, line: lineNum, kind: 'import' });
        continue;
      }
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

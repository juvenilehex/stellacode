import fs from 'node:fs';
import type { ParsedFile, ParsedSymbol, ParsedImport } from './types.js';

// Regex-based Go parser (no native deps, Windows-safe)
// Extracts: package, functions, methods, structs, interfaces, imports

const PATTERNS = {
  // package main
  packageDecl: /^package\s+(\w+)/,
  // func Name(...)
  funcDecl: /^func\s+(\w+)\s*\(/,
  // func (r Type) Name(...)
  methodDecl: /^func\s+\(\s*\w+\s+\*?(\w+)\s*\)\s+(\w+)\s*\(/,
  // type Name struct {
  structDecl: /^type\s+(\w+)\s+struct\s*\{/,
  // type Name interface {
  interfaceDecl: /^type\s+(\w+)\s+interface\s*\{/,
  // type Name = ... or type Name SomeType
  typeAlias: /^type\s+(\w+)\s+(?!=)/,
  // Single-line import: import "fmt"
  singleImport: /^import\s+"([^"]+)"/,
  // Single-line import with alias: import alias "fmt"
  singleImportAlias: /^import\s+(\w+)\s+"([^"]+)"/,
  // Grouped import block start: import (
  importBlockStart: /^import\s*\(/,
  // Import line inside block: "fmt" or alias "fmt"
  importLine: /^\s+"([^"]+)"/,
  importLineAlias: /^\s+(\w+|\.)\s+"([^"]+)"/,
  // Block end
  blockEnd: /^\s*\)/,
  // Single-line comment
  lineComment: /^\s*\/\//,
  // var/const block or single
  varDecl: /^var\s+(\w+)\s/,
  constDecl: /^const\s+(\w+)\s/,
};

export function parseGoFile(absolutePath: string, relativePath: string): ParsedFile {
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf-8');
  } catch (err) {
    console.warn('[Parser]', relativePath, 'read failed:', (err as Error).message);
    return {
      path: absolutePath, relativePath, language: 'go',
      symbols: [], imports: [], lineCount: 0, size: 0,
    };
  }

  const lines = content.split('\n');
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  let inImportBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const lineNum = i + 1;

    // Skip empty lines and comments
    if (trimmed === '' || PATTERNS.lineComment.test(line)) continue;

    // ── Import block handling ──
    if (inImportBlock) {
      if (PATTERNS.blockEnd.test(line)) {
        inImportBlock = false;
        continue;
      }
      // alias "path"
      const aliasMatch = line.match(PATTERNS.importLineAlias);
      if (aliasMatch) {
        const importPath = aliasMatch[2];
        const alias = aliasMatch[1];
        imports.push({
          source: importPath,
          specifiers: [alias],
          isDefault: false,
          isNamespace: alias === '.',
          line: lineNum,
        });
        continue;
      }
      // "path"
      const lineMatch = line.match(PATTERNS.importLine);
      if (lineMatch) {
        const importPath = lineMatch[1];
        const pkgName = importPath.includes('/') ? importPath.split('/').pop()! : importPath;
        imports.push({
          source: importPath,
          specifiers: [pkgName],
          isDefault: true,
          isNamespace: false,
          line: lineNum,
        });
      }
      continue;
    }

    // import ( ... )
    if (PATTERNS.importBlockStart.test(trimmed)) {
      inImportBlock = true;
      continue;
    }

    // import alias "path"
    const singleAliasMatch = trimmed.match(PATTERNS.singleImportAlias);
    if (singleAliasMatch) {
      imports.push({
        source: singleAliasMatch[2],
        specifiers: [singleAliasMatch[1]],
        isDefault: false,
        isNamespace: singleAliasMatch[1] === '.',
        line: lineNum,
      });
      continue;
    }

    // import "path"
    const singleMatch = trimmed.match(PATTERNS.singleImport);
    if (singleMatch) {
      const importPath = singleMatch[1];
      const pkgName = importPath.includes('/') ? importPath.split('/').pop()! : importPath;
      imports.push({
        source: importPath,
        specifiers: [pkgName],
        isDefault: true,
        isNamespace: false,
        line: lineNum,
      });
      continue;
    }

    // ── Symbol declarations ──

    // Method: func (r Type) Name(...)
    const methodMatch = trimmed.match(PATTERNS.methodDecl);
    if (methodMatch) {
      const name = methodMatch[2];
      const exported = name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
      symbols.push({ name, kind: 'method', line: lineNum, exported });
      continue;
    }

    // Function: func Name(...)
    const funcMatch = trimmed.match(PATTERNS.funcDecl);
    if (funcMatch) {
      const name = funcMatch[1];
      const exported = name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
      symbols.push({ name, kind: 'function', line: lineNum, exported });
      continue;
    }

    // Struct: type Name struct {
    const structMatch = trimmed.match(PATTERNS.structDecl);
    if (structMatch) {
      const name = structMatch[1];
      const exported = name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
      symbols.push({ name, kind: 'class', line: lineNum, exported });
      continue;
    }

    // Interface: type Name interface {
    const ifaceMatch = trimmed.match(PATTERNS.interfaceDecl);
    if (ifaceMatch) {
      const name = ifaceMatch[1];
      const exported = name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
      symbols.push({ name, kind: 'interface', line: lineNum, exported });
      continue;
    }

    // Package declaration (stored as a special symbol for context)
    const pkgMatch = trimmed.match(PATTERNS.packageDecl);
    if (pkgMatch) {
      // Not a user-facing symbol, but useful for graph context
      continue;
    }

    // Top-level var/const (exported only)
    const varMatch = trimmed.match(PATTERNS.varDecl);
    if (varMatch) {
      const name = varMatch[1];
      const exported = name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
      if (exported) {
        symbols.push({ name, kind: 'variable', line: lineNum, exported });
      }
      continue;
    }

    const constMatch = trimmed.match(PATTERNS.constDecl);
    if (constMatch) {
      const name = constMatch[1];
      const exported = name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
      if (exported) {
        symbols.push({ name, kind: 'variable', line: lineNum, exported });
      }
      continue;
    }
  }

  return {
    path: absolutePath, relativePath, language: 'go',
    symbols, imports, lineCount: lines.length, size: content.length,
  };
}

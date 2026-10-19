export interface ParsedSymbol {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'enum' | 'method';
  line: number;
  endLine?: number;
  exported: boolean;
}

/**
 * How the file names the other file (R675). Every kind is a reference written in the code, so every
 * kind draws an import line and keeps a co-change pair out of "hidden":
 * import = `import … from` / side-effect import / require · re-export = `export … from` ·
 * dynamic = `import('…')` with a literal path (also the type-position `import('…').T`).
 */
export type ImportKind = 'import' | 're-export' | 'dynamic';

export interface ParsedImport {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  isNamespace: boolean;
  line: number;
  kind: ImportKind;
}

export interface ParsedFile {
  path: string;
  relativePath: string;
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'unknown';
  symbols: ParsedSymbol[];
  imports: ParsedImport[];
  lineCount: number;
  size: number;
}

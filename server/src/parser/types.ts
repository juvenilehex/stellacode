export interface ParsedSymbol {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'interface' | 'type' | 'enum' | 'method';
  line: number;
  endLine?: number;
  exported: boolean;
}

export interface ParsedImport {
  source: string;
  specifiers: string[];
  isDefault: boolean;
  isNamespace: boolean;
  line: number;
}

export interface ParsedFile {
  path: string;
  relativePath: string;
  language: 'typescript' | 'javascript' | 'python' | 'unknown';
  symbols: ParsedSymbol[];
  imports: ParsedImport[];
  lineCount: number;
  size: number;
}

import { describe, it, expect } from 'vitest';
import { buildGraph } from '../graph/builder.js';
import type { ParsedFile } from '../parser/types.js';

function makeFile(relativePath: string, overrides?: Partial<ParsedFile>): ParsedFile {
  return {
    path: `/root/${relativePath}`,
    relativePath,
    language: 'typescript',
    symbols: [],
    imports: [],
    lineCount: 10,
    size: 200,
    ...overrides,
  };
}

describe('buildGraph - nodes', () => {
  it('creates file nodes for each parsed file', () => {
    const files: ParsedFile[] = [
      makeFile('src/index.ts'),
      makeFile('src/utils.ts'),
    ];
    const graph = buildGraph(files, '/root');
    const fileNodes = graph.nodes.filter(n => n.type === 'file');
    expect(fileNodes).toHaveLength(2);
    expect(fileNodes.map(n => n.id)).toContain('file:src/index.ts');
    expect(fileNodes.map(n => n.id)).toContain('file:src/utils.ts');
  });

  it('creates directory nodes from file paths', () => {
    const files: ParsedFile[] = [
      makeFile('src/parser/index.ts'),
    ];
    const graph = buildGraph(files, '/root');
    const dirNodes = graph.nodes.filter(n => n.type === 'directory');
    expect(dirNodes.map(n => n.id)).toContain('dir:src');
    expect(dirNodes.map(n => n.id)).toContain('dir:src/parser');
  });

  it('sets correct parent for nested directories', () => {
    const files: ParsedFile[] = [
      makeFile('src/graph/builder.ts'),
    ];
    const graph = buildGraph(files, '/root');
    const parserDir = graph.nodes.find(n => n.id === 'dir:src/graph');
    expect(parserDir?.parent).toBe('dir:src');
  });

  it('sets correct parent for files', () => {
    const files: ParsedFile[] = [
      makeFile('src/index.ts'),
    ];
    const graph = buildGraph(files, '/root');
    const fileNode = graph.nodes.find(n => n.id === 'file:src/index.ts');
    expect(fileNode?.parent).toBe('dir:src');
  });

  it('assigns scale based on symbol count', () => {
    const files: ParsedFile[] = [
      makeFile('a.ts', { symbols: [] }),
      makeFile('b.ts', { symbols: [
        { name: 'f1', kind: 'function', line: 1, exported: true },
        { name: 'f2', kind: 'function', line: 2, exported: true },
        { name: 'f3', kind: 'function', line: 3, exported: true },
        { name: 'f4', kind: 'function', line: 4, exported: true },
        { name: 'f5', kind: 'function', line: 5, exported: true },
      ] }),
    ];
    const graph = buildGraph(files, '/root');
    const nodeA = graph.nodes.find(n => n.id === 'file:a.ts');
    const nodeB = graph.nodes.find(n => n.id === 'file:b.ts');
    expect(nodeA!.scale).toBe(0.5); // 0.5 + min(0/10, 1.5) = 0.5
    expect(nodeB!.scale).toBe(1.0); // 0.5 + min(5/10, 1.5) = 1.0
  });
});

describe('buildGraph - edges', () => {
  it('creates directory containment edges', () => {
    const files: ParsedFile[] = [
      makeFile('src/index.ts'),
    ];
    const graph = buildGraph(files, '/root');
    const containEdges = graph.edges.filter(e => e.type === 'directory');
    expect(containEdges).toHaveLength(1);
    expect(containEdges[0].source).toBe('dir:src');
    expect(containEdges[0].target).toBe('file:src/index.ts');
  });

  it('creates import edges for relative imports', () => {
    const files: ParsedFile[] = [
      makeFile('src/index.ts', {
        imports: [{ source: './utils', specifiers: ['helper'], isDefault: false, isNamespace: false, line: 1 }],
      }),
      makeFile('src/utils.ts'),
    ];
    const graph = buildGraph(files, '/root');
    const importEdges = graph.edges.filter(e => e.type === 'import');
    expect(importEdges).toHaveLength(1);
    expect(importEdges[0].source).toBe('file:src/index.ts');
    expect(importEdges[0].target).toBe('file:src/utils.ts');
  });

  it('does not create edges for external (non-relative) imports', () => {
    const files: ParsedFile[] = [
      makeFile('src/index.ts', {
        imports: [{ source: 'express', specifiers: ['default'], isDefault: true, isNamespace: false, line: 1 }],
      }),
    ];
    const graph = buildGraph(files, '/root');
    const importEdges = graph.edges.filter(e => e.type === 'import');
    expect(importEdges).toHaveLength(0);
  });

  it('deduplicates import edges to the same target', () => {
    const files: ParsedFile[] = [
      makeFile('src/index.ts', {
        imports: [
          { source: './utils', specifiers: ['a'], isDefault: false, isNamespace: false, line: 1 },
          { source: './utils', specifiers: ['b'], isDefault: false, isNamespace: false, line: 2 },
        ],
      }),
      makeFile('src/utils.ts'),
    ];
    const graph = buildGraph(files, '/root');
    const importEdges = graph.edges.filter(e => e.type === 'import');
    expect(importEdges).toHaveLength(1);
  });

  it('updates degree for connected nodes', () => {
    const files: ParsedFile[] = [
      makeFile('src/a.ts', {
        imports: [{ source: './b', specifiers: ['x'], isDefault: false, isNamespace: false, line: 1 }],
      }),
      makeFile('src/b.ts'),
    ];
    const graph = buildGraph(files, '/root');
    const nodeA = graph.nodes.find(n => n.id === 'file:src/a.ts');
    const nodeB = graph.nodes.find(n => n.id === 'file:src/b.ts');
    expect(nodeA!.degree).toBe(1);
    expect(nodeB!.degree).toBe(1);
  });
});

describe('buildGraph - co-change edges', () => {
  it('adds co-change edges when coChanges option is provided', () => {
    const files: ParsedFile[] = [
      makeFile('src/a.ts'),
      makeFile('src/b.ts'),
    ];
    const graph = buildGraph(files, '/root', {
      coChanges: [
        { fileA: 'src/a.ts', fileB: 'src/b.ts', frequency: 5, coupling: 0.7 },
      ],
    });
    const coChangeEdges = graph.edges.filter(e => e.type === 'co-change');
    expect(coChangeEdges).toHaveLength(1);
    expect(coChangeEdges[0].strength).toBe(0.7);
    expect(coChangeEdges[0].label).toBe('5 co-changes');
  });

  it('caps co-change strength at 0.8', () => {
    const files: ParsedFile[] = [
      makeFile('src/a.ts'),
      makeFile('src/b.ts'),
    ];
    const graph = buildGraph(files, '/root', {
      coChanges: [
        { fileA: 'src/a.ts', fileB: 'src/b.ts', frequency: 10, coupling: 0.95 },
      ],
    });
    const coChangeEdges = graph.edges.filter(e => e.type === 'co-change');
    expect(coChangeEdges[0].strength).toBe(0.8);
  });

  it('ignores co-changes referencing unknown files', () => {
    const files: ParsedFile[] = [
      makeFile('src/a.ts'),
    ];
    const graph = buildGraph(files, '/root', {
      coChanges: [
        { fileA: 'src/a.ts', fileB: 'src/unknown.ts', frequency: 5, coupling: 0.7 },
      ],
    });
    const coChangeEdges = graph.edges.filter(e => e.type === 'co-change');
    expect(coChangeEdges).toHaveLength(0);
  });
});

describe('buildGraph - circular dependency detection', () => {
  it('marks circular import edges', () => {
    const files: ParsedFile[] = [
      makeFile('src/a.ts', {
        imports: [{ source: './b', specifiers: ['x'], isDefault: false, isNamespace: false, line: 1 }],
      }),
      makeFile('src/b.ts', {
        imports: [{ source: './a', specifiers: ['y'], isDefault: false, isNamespace: false, line: 1 }],
      }),
    ];
    const graph = buildGraph(files, '/root');
    const circularEdges = graph.edges.filter(e => e.label?.includes('circular'));
    expect(circularEdges.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildGraph - dead code detection', () => {
  it('marks files with all unused exports as deadExports', () => {
    const files: ParsedFile[] = [
      makeFile('src/index.ts'), // imports nothing from orphan
      makeFile('src/orphan.ts', {
        symbols: [
          { name: 'unused', kind: 'function', line: 1, exported: true },
        ],
      }),
    ];
    const graph = buildGraph(files, '/root');
    const orphanNode = graph.nodes.find(n => n.id === 'file:src/orphan.ts');
    expect(orphanNode?.meta?.deadExports).toBe(true);
  });

  it('marks island files (no incoming imports, no exports)', () => {
    const files: ParsedFile[] = [
      makeFile('src/index.ts'),
      makeFile('src/island.ts', {
        symbols: [
          { name: 'localOnly', kind: 'function', line: 1, exported: false },
        ],
      }),
    ];
    const graph = buildGraph(files, '/root');
    const islandNode = graph.nodes.find(n => n.id === 'file:src/island.ts');
    expect(islandNode?.meta?.islandFile).toBe(true);
  });

  it('does not mark files that are imported by others', () => {
    const files: ParsedFile[] = [
      makeFile('src/index.ts', {
        imports: [{ source: './utils', specifiers: ['helper'], isDefault: false, isNamespace: false, line: 1 }],
      }),
      makeFile('src/utils.ts', {
        symbols: [
          { name: 'helper', kind: 'function', line: 1, exported: true },
        ],
      }),
    ];
    const graph = buildGraph(files, '/root');
    const utilsNode = graph.nodes.find(n => n.id === 'file:src/utils.ts');
    expect(utilsNode?.meta?.deadExports).toBeUndefined();
  });
});

describe('buildGraph - stats', () => {
  it('computes correct stats', () => {
    const files: ParsedFile[] = [
      makeFile('src/a.ts', {
        symbols: [{ name: 'f', kind: 'function', line: 1, exported: true }],
      }),
      makeFile('src/b.ts', {
        language: 'javascript',
        symbols: [
          { name: 'g', kind: 'function', line: 1, exported: true },
          { name: 'h', kind: 'function', line: 2, exported: true },
        ],
      }),
    ];
    const graph = buildGraph(files, '/root');
    expect(graph.stats.totalFiles).toBe(2);
    expect(graph.stats.totalSymbols).toBe(3);
    expect(graph.stats.languages['typescript']).toBe(1);
    expect(graph.stats.languages['javascript']).toBe(1);
  });

  it('includes timestamp', () => {
    const graph = buildGraph([], '/root');
    expect(graph.timestamp).toBeGreaterThan(0);
  });
});

describe('buildGraph - layout', () => {
  it('produces finite coordinates for all nodes', () => {
    const files: ParsedFile[] = [
      makeFile('src/a.ts'),
      makeFile('src/b.ts'),
      makeFile('lib/c.ts'),
    ];
    const graph = buildGraph(files, '/root');
    for (const node of graph.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(Number.isFinite(node.z)).toBe(true);
    }
  });
});

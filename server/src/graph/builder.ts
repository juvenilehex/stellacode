import path from 'node:path';
import type { ParsedFile } from '../parser/types.js';
import type { GraphNode, GraphEdge, GraphData } from './types.js';
import type { GitCoChange } from '../agent/types.js';
import { computeLayout, type LayoutOptions } from './layout.js';

export interface BuildGraphOptions {
  coChanges?: GitCoChange[];
  fileGitMeta?: Map<string, { lastModified: number; firstCommit: number; commitCount: number }>;
  fileAgentMeta?: Map<string, { primaryAgent: string | null; agentRatio: number; lastAgent: string | null }>;
  layout?: LayoutOptions;
}

export function buildGraph(files: ParsedFile[], rootDir: string, options?: BuildGraphOptions): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const dirSet = new Set<string>();
  const fileMap = new Map<string, GraphNode>();
  const languages: Record<string, number> = {};
  let totalSymbols = 0;

  // Collect all directories
  for (const file of files) {
    const parts = file.relativePath.split('/');
    for (let i = 1; i < parts.length; i++) {
      dirSet.add(parts.slice(0, i).join('/'));
    }
    languages[file.language] = (languages[file.language] || 0) + 1;
    totalSymbols += file.symbols.length;
  }

  // Create directory nodes
  for (const dir of dirSet) {
    const parts = dir.split('/');
    const parent = parts.length > 1 ? parts.slice(0, -1).join('/') : undefined;
    nodes.push({
      id: `dir:${dir}`,
      label: parts[parts.length - 1],
      type: 'directory',
      parent: parent ? `dir:${parent}` : undefined,
      symbolCount: 0,
      lineCount: 0,
      size: 0,
      x: 0, y: 0, z: 0,
      degree: 0,
      scale: 1,
    });
  }

  // Create file nodes
  for (const file of files) {
    const parts = file.relativePath.split('/');
    const parentDir = parts.length > 1 ? parts.slice(0, -1).join('/') : undefined;
    const node: GraphNode = {
      id: `file:${file.relativePath}`,
      label: parts[parts.length - 1],
      type: 'file',
      language: file.language,
      parent: parentDir ? `dir:${parentDir}` : undefined,
      symbolCount: file.symbols.length,
      lineCount: file.lineCount,
      size: file.size,
      x: 0, y: 0, z: 0,
      degree: 0,
      scale: 0.5 + Math.min(file.symbols.length / 10, 1.5),
      meta: {
        symbols: file.symbols,
        imports: file.imports,
        ...(options?.fileGitMeta?.get(file.relativePath) ?? {}),
        ...(options?.fileAgentMeta?.get(file.relativePath) ?? {}),
      },
    };
    nodes.push(node);
    fileMap.set(file.relativePath, node);

    // Directory containment edge
    if (parentDir) {
      edges.push({
        id: `contain:${file.relativePath}`,
        source: `dir:${parentDir}`,
        target: `file:${file.relativePath}`,
        type: 'directory',
        strength: 0.3,
      });
    }
  }

  // Build import edges (deduplicate: same file may import same target multiple times)
  const relPathSet = new Set(files.map(f => f.relativePath));
  const seenEdgeIds = new Set<string>();

  for (const file of files) {
    for (const imp of file.imports) {
      const resolved = resolveImport(file.relativePath, imp.source, relPathSet);
      if (resolved) {
        const edgeId = `import:${file.relativePath}->${resolved}`;
        if (seenEdgeIds.has(edgeId)) continue;
        seenEdgeIds.add(edgeId);
        edges.push({
          id: edgeId,
          source: `file:${file.relativePath}`,
          target: `file:${resolved}`,
          type: 'import',
          strength: 0.6,
          label: imp.specifiers.join(', '),
        });

        // Update degree
        const srcNode = fileMap.get(file.relativePath);
        const tgtNode = fileMap.get(resolved);
        if (srcNode) srcNode.degree++;
        if (tgtNode) tgtNode.degree++;
      }
    }
  }

  // Add co-change edges from git history (temporal coupling)
  if (options?.coChanges) {
    for (const cc of options.coChanges) {
      const srcId = `file:${cc.fileA}`;
      const tgtId = `file:${cc.fileB}`;
      if (fileMap.has(cc.fileA) && fileMap.has(cc.fileB)) {
        edges.push({
          id: `cochange:${cc.fileA}<>${cc.fileB}`,
          source: srcId,
          target: tgtId,
          type: 'co-change',
          strength: Math.min(cc.coupling, 0.8),
          label: `${cc.frequency} co-changes`,
        });
        const srcNode = fileMap.get(cc.fileA);
        const tgtNode = fileMap.get(cc.fileB);
        if (srcNode) srcNode.degree++;
        if (tgtNode) tgtNode.degree++;
      }
    }
  }

  // ── Circular dependency detection ──
  const circularEdgeIds = detectCircularDeps(edges);
  for (const edge of edges) {
    if (circularEdgeIds.has(edge.id)) {
      if (!edge.label) edge.label = '';
      edge.label = (edge.label ? edge.label + ' | ' : '') + 'circular';
    }
  }

  // ── Dead code detection (exported symbols no one imports) ──
  const importedSpecifiers = new Set<string>();
  for (const file of files) {
    for (const imp of file.imports) {
      for (const spec of imp.specifiers) {
        importedSpecifiers.add(spec);
      }
    }
  }
  for (const file of files) {
    const node = fileMap.get(file.relativePath);
    if (!node) continue;
    const exportedSymbols = file.symbols.filter(s => s.exported);
    const unusedExports = exportedSymbols.filter(s => !importedSpecifiers.has(s.name));
    if (exportedSymbols.length > 0 && unusedExports.length === exportedSymbols.length) {
      // All exports are unused — potential dead code
      if (node.meta) node.meta.deadExports = true;
    }
    // Files with zero imports pointing to them and zero exports
    const hasIncomingImport = edges.some(e => e.target === node.id && e.type === 'import');
    if (!hasIncomingImport && exportedSymbols.length === 0 && file.symbols.length > 0) {
      if (node.meta) node.meta.islandFile = true;
    }
  }

  // Run force layout
  computeLayout(nodes, edges, options?.layout);

  return {
    nodes,
    edges,
    rootDir: path.resolve(rootDir),
    timestamp: Date.now(),
    stats: {
      totalFiles: files.length,
      totalDirs: dirSet.size,
      totalSymbols,
      totalEdges: edges.length,
      languages,
    },
  };
}

/** Detect circular dependencies using DFS cycle detection on import edges */
function detectCircularDeps(edges: GraphEdge[]): Set<string> {
  const importEdges = edges.filter(e => e.type === 'import');
  const adj = new Map<string, Array<{ target: string; edgeId: string }>>();

  for (const edge of importEdges) {
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    adj.get(edge.source)!.push({ target: edge.target, edgeId: edge.id });
  }

  const cycleEdgeIds = new Set<string>();
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stackEdges = new Map<string, string>(); // node -> edge that led to it

  function dfs(node: string) {
    visited.add(node);
    inStack.add(node);

    for (const { target, edgeId } of adj.get(node) ?? []) {
      if (inStack.has(target)) {
        // Found cycle — mark the edge that closes it
        cycleEdgeIds.add(edgeId);
        // Also mark the edge that points from target (if in stack)
        const backEdge = stackEdges.get(target);
        if (backEdge) cycleEdgeIds.add(backEdge);
      } else if (!visited.has(target)) {
        stackEdges.set(target, edgeId);
        dfs(target);
      }
    }

    inStack.delete(node);
  }

  for (const node of adj.keys()) {
    if (!visited.has(node)) dfs(node);
  }

  return cycleEdgeIds;
}

function resolveImport(fromFile: string, importSource: string, knownFiles: Set<string>): string | undefined {
  // Skip external/node_modules imports
  if (!importSource.startsWith('.') && !importSource.startsWith('/')) return undefined;

  const fromDir = path.dirname(fromFile);
  const resolved = path.posix.normalize(path.posix.join(fromDir, importSource));

  // Try exact match, then with extensions
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];
  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (knownFiles.has(candidate)) return candidate;
  }

  return undefined;
}

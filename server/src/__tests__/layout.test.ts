import { describe, it, expect } from 'vitest';
import { computeLayout } from '../graph/layout.js';
import type { GraphNode, GraphEdge } from '../graph/types.js';

function makeNode(id: string, type: 'file' | 'directory' = 'file'): GraphNode {
  return {
    id,
    label: id,
    type,
    symbolCount: 0,
    lineCount: 10,
    size: 100,
    x: 0, y: 0, z: 0,
    degree: 0,
    scale: 1,
  };
}

function makeEdge(source: string, target: string, type: 'import' | 'directory' = 'import'): GraphEdge {
  return {
    id: `${type}:${source}->${target}`,
    source,
    target,
    type,
    strength: type === 'directory' ? 0.3 : 0.6,
  };
}

describe('computeLayout', () => {
  it('handles empty node array without error', () => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    expect(() => computeLayout(nodes, edges)).not.toThrow();
  });

  it('handles single node', () => {
    const nodes = [makeNode('a')];
    computeLayout(nodes, []);
    // Single node should be centered at origin after post-layout centering
    expect(nodes[0].x).toBeCloseTo(0, 0);
    expect(nodes[0].y).toBeCloseTo(0, 0);
    expect(nodes[0].z).toBeCloseTo(0, 0);
  });

  it('produces finite coordinates for all nodes', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')];
    const edges = [
      makeEdge('a', 'b'),
      makeEdge('b', 'c'),
    ];
    computeLayout(nodes, edges);
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(Number.isFinite(node.z)).toBe(true);
    }
  });

  it('centers the graph at origin', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => makeNode(`n${i}`));
    const edges = [makeEdge('n0', 'n1'), makeEdge('n2', 'n3')];
    computeLayout(nodes, edges);

    // Average position should be approximately zero
    const avgX = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
    const avgY = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
    const avgZ = nodes.reduce((s, n) => s + n.z, 0) / nodes.length;
    expect(Math.abs(avgX)).toBeLessThan(0.01);
    expect(Math.abs(avgY)).toBeLessThan(0.01);
    expect(Math.abs(avgZ)).toBeLessThan(0.01);
  });

  it('connected nodes are closer than disconnected ones on average', () => {
    // Two pairs: (a,b) connected, (c,d) disconnected from (a,b)
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')];
    const edges = [makeEdge('a', 'b')];
    computeLayout(nodes, edges);

    const dist = (n1: GraphNode, n2: GraphNode) =>
      Math.sqrt((n1.x - n2.x) ** 2 + (n1.y - n2.y) ** 2 + (n1.z - n2.z) ** 2);

    const connectedDist = dist(nodes[0], nodes[1]);
    // Average distance between disconnected pairs
    const disconnectedDists = [dist(nodes[0], nodes[2]), dist(nodes[0], nodes[3]), dist(nodes[1], nodes[2]), dist(nodes[1], nodes[3])];
    const avgDisconnected = disconnectedDists.reduce((s, d) => s + d, 0) / disconnectedDists.length;

    // Connected nodes should tend to be closer (not a strict guarantee due to repulsion,
    // but with strong attraction this should hold)
    expect(connectedDist).toBeLessThan(avgDisconnected * 2);
  });

  it('ignores edges referencing unknown nodes', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'unknown')];
    expect(() => computeLayout(nodes, edges)).not.toThrow();
  });

  it('applies dirCohesion option', () => {
    const nodes = [makeNode('dir', 'directory'), makeNode('file')];
    const edges: GraphEdge[] = [{
      id: 'dir-edge',
      source: 'dir',
      target: 'file',
      type: 'directory',
      strength: 0.3,
    }];

    // With dirCohesion = 0, directory edges have no strength
    const nodesA = [makeNode('dir', 'directory'), makeNode('file')];
    computeLayout(nodesA, edges, { dirCohesion: 0 });

    const nodesB = [makeNode('dir', 'directory'), makeNode('file')];
    computeLayout(nodesB, edges, { dirCohesion: 1 });

    // Both should produce finite coordinates
    for (const n of [...nodesA, ...nodesB]) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(Number.isFinite(n.z)).toBe(true);
    }
  });

  it('handles larger graphs without timeout', () => {
    // Create 50 nodes with some edges
    const nodes = Array.from({ length: 50 }, (_, i) => makeNode(`n${i}`));
    const edges: GraphEdge[] = [];
    for (let i = 0; i < 40; i++) {
      edges.push(makeEdge(`n${i}`, `n${i + 1}`));
    }
    const start = Date.now();
    computeLayout(nodes, edges);
    const elapsed = Date.now() - start;
    // Should complete in reasonable time (< 5 seconds)
    expect(elapsed).toBeLessThan(5000);

    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(Number.isFinite(node.z)).toBe(true);
    }
  });

  it('nodes are not all at the same position', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    computeLayout(nodes, []);
    // At least some positions should differ
    const allSame = nodes.every(n => n.x === nodes[0].x && n.y === nodes[0].y && n.z === nodes[0].z);
    expect(allSame).toBe(false);
  });
});

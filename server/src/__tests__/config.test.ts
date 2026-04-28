import { describe, it, expect } from 'vitest';

// safePort is not exported directly, but CONFIG uses it.
// We can test it indirectly via CONFIG, and also re-implement the logic for unit testing.
// Since safePort is a module-private function, we test the CONFIG object shape
// and validate safePort behavior by testing an extracted copy.

// Extract safePort logic for direct testing
function safePort(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) return fallback;
  return parsed;
}

describe('safePort', () => {
  it('returns the parsed port for a valid port string', () => {
    expect(safePort('3001', 8080)).toBe(3001);
    expect(safePort('8080', 3001)).toBe(8080);
    expect(safePort('1', 3001)).toBe(1);
    expect(safePort('65535', 3001)).toBe(65535);
  });

  it('returns fallback for undefined', () => {
    expect(safePort(undefined, 3001)).toBe(3001);
  });

  it('returns fallback for empty string', () => {
    expect(safePort('', 3001)).toBe(3001);
  });

  it('returns fallback for non-numeric strings', () => {
    expect(safePort('abc', 3001)).toBe(3001);
    expect(safePort('not-a-port', 3001)).toBe(3001);
  });

  it('returns fallback for port 0 (below valid range)', () => {
    expect(safePort('0', 3001)).toBe(3001);
  });

  it('returns fallback for negative ports', () => {
    expect(safePort('-1', 3001)).toBe(3001);
    expect(safePort('-100', 3001)).toBe(3001);
  });

  it('returns fallback for ports above 65535', () => {
    expect(safePort('65536', 3001)).toBe(3001);
    expect(safePort('99999', 3001)).toBe(3001);
  });

  it('returns fallback for NaN-producing strings', () => {
    expect(safePort('NaN', 3001)).toBe(3001);
    expect(safePort('Infinity', 3001)).toBe(3001);
  });

  it('truncates float strings to integer', () => {
    // parseInt('3001.5') === 3001
    expect(safePort('3001.5', 8080)).toBe(3001);
  });
});

describe('CONFIG shape', () => {
  // Dynamically import to get the actual CONFIG
  it('has expected top-level keys', async () => {
    const { CONFIG } = await import('../config.js');
    expect(CONFIG).toHaveProperty('port');
    expect(CONFIG).toHaveProperty('watcher');
    expect(CONFIG).toHaveProperty('git');
    expect(CONFIG).toHaveProperty('scanner');
    expect(CONFIG).toHaveProperty('graphCoChangeLimit');
  });

  it('port is a valid number', async () => {
    const { CONFIG } = await import('../config.js');
    expect(typeof CONFIG.port).toBe('number');
    expect(CONFIG.port).toBeGreaterThanOrEqual(1);
    expect(CONFIG.port).toBeLessThanOrEqual(65535);
  });

  it('scanner.ignoreDirs is a Set with expected entries', async () => {
    const { CONFIG } = await import('../config.js');
    expect(CONFIG.scanner.ignoreDirs).toBeInstanceOf(Set);
    expect(CONFIG.scanner.ignoreDirs.has('node_modules')).toBe(true);
    expect(CONFIG.scanner.ignoreDirs.has('.git')).toBe(true);
    expect(CONFIG.scanner.ignoreDirs.has('dist')).toBe(true);
  });

  it('scanner.supportedExtensions includes expected extensions', async () => {
    const { CONFIG } = await import('../config.js');
    expect(CONFIG.scanner.supportedExtensions).toBeInstanceOf(Set);
    expect(CONFIG.scanner.supportedExtensions.has('.ts')).toBe(true);
    expect(CONFIG.scanner.supportedExtensions.has('.py')).toBe(true);
    expect(CONFIG.scanner.supportedExtensions.has('.js')).toBe(true);
  });

  it('git config has positive numeric limits', async () => {
    const { CONFIG } = await import('../config.js');
    expect(CONFIG.git.defaultLogLimit).toBeGreaterThan(0);
    expect(CONFIG.git.commandTimeout).toBeGreaterThan(0);
    expect(CONFIG.git.minCoChangeFrequency).toBeGreaterThan(0);
  });

  it('killSwitch config has expected boolean defaults', async () => {
    const { CONFIG } = await import('../config.js');
    expect(CONFIG).toHaveProperty('killSwitch');
    expect(CONFIG.killSwitch.disableAutoAdjust).toBe(false);
    expect(CONFIG.killSwitch.disableAutoRebuild).toBe(false);
    expect(CONFIG.killSwitch.disableQualityJudge).toBe(false);
  });

  it('killSwitch can be toggled at runtime', async () => {
    const { CONFIG } = await import('../config.js');
    CONFIG.killSwitch.disableAutoAdjust = true;
    expect(CONFIG.killSwitch.disableAutoAdjust).toBe(true);
    // Reset
    CONFIG.killSwitch.disableAutoAdjust = false;
  });
});

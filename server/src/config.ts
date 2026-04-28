/** Centralized server configuration */

function safePort(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) return fallback;
  return parsed;
}

export const CONFIG = {
  /** HTTP/WS server port */
  port: safePort(process.env.STELLA_PORT, 3001),

  watcher: {
    /** File extensions to watch for changes */
    extensions: /\.(ts|tsx|js|jsx|mjs|cjs|py)$/,
    /** Directories to ignore during file watching */
    ignorePatterns: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/__pycache__/**',
      '**/.vite/**',
      '**/.next/**',
    ],
    /** Debounce delay (ms) before triggering graph rebuild */
    rebuildDelay: 500,
    /** Stability threshold (ms) for awaitWriteFinish */
    stabilityThreshold: 300,
    /** Poll interval (ms) for awaitWriteFinish */
    pollInterval: 100,
  },

  git: {
    /** Default number of commits to fetch */
    defaultLogLimit: 200,
    /** Maximum commits for stats aggregation */
    statsLogLimit: 500,
    /** Maximum commits for co-change analysis */
    coChangeLogLimit: 500,
    /** Maximum git log limit from API */
    maxApiLogLimit: 500,
    /** Git command timeout (ms) */
    commandTimeout: 10_000,
    /** Minimum co-change frequency to include */
    minCoChangeFrequency: 3,
    /** Maximum co-change pairs to return */
    maxCoChangePairs: 50,
    /** Hot files count */
    hotFilesLimit: 20,
    /** Recent commits in stats */
    recentCommitsLimit: 30,
    /** Activity heatmap lookback (days) */
    heatmapDays: 30,
  },

  scanner: {
    /** Directories to skip during scanning */
    ignoreDirs: new Set([
      'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
      '.vite', '.cache', 'coverage', '.nyc_output', '.turbo',
      'vendor', 'venv', '.venv', 'env', '.env',
    ]),
    /** File extensions to parse */
    supportedExtensions: new Set([
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py',
    ]),
  },

  /** Graph rebuild co-change commit limit */
  graphCoChangeLimit: 300,

  /** L5 kill switches: emergency stop for autonomous features */
  killSwitch: {
    /** Disable auto-config adjustments (L6 auto-tuning) */
    disableAutoAdjust: false,
    /** Disable automatic graph rebuild on file change */
    disableAutoRebuild: false,
    /** Disable quality judgment alerts */
    disableQualityJudge: false,
  },
};

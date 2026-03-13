import chokidar from 'chokidar';
import path from 'node:path';
import { CONFIG } from './config.js';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  filePath: string;
  relativePath: string;
  timestamp: number;
}

export type ChangeCallback = (event: FileChangeEvent) => void;

export function createWatcher(rootDir: string, onChange: ChangeCallback) {
  const root = path.resolve(rootDir);

  const watcher = chokidar.watch(root, {
    ignored: CONFIG.watcher.ignorePatterns,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: CONFIG.watcher.stabilityThreshold,
      pollInterval: CONFIG.watcher.pollInterval,
    },
  });

  function handleEvent(type: FileChangeEvent['type']) {
    return (filePath: string) => {
      if (!CONFIG.watcher.extensions.test(filePath)) return;
      onChange({
        type,
        filePath,
        relativePath: path.relative(root, filePath).replace(/\\/g, '/'),
        timestamp: Date.now(),
      });
    };
  }

  watcher.on('add', handleEvent('add'));
  watcher.on('change', handleEvent('change'));
  watcher.on('unlink', handleEvent('unlink'));
  watcher.on('error', (err) => console.error('[Watch] Watcher error:', err));

  return watcher;
}

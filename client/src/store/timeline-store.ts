import { create } from 'zustand';
import { useGraphStore } from './graph-store';

export interface TimelineCommit {
  hash: string;
  shortHash: string;
  timestamp: number;
  message: string;
  author: string;
  isAgent: boolean;
  agentName?: string;
  conventionalType: string;
  fileStatuses: Array<{ status: 'A' | 'M' | 'D' | 'R'; path: string; oldPath?: string }>;
}

interface TimelineState {
  commits: TimelineCommit[];
  loaded: boolean;

  // Playback
  mode: 'live' | 'replay';
  currentIndex: number;
  playing: boolean;
  speed: number; // commits per second

  // Derived
  visibleFiles: Set<string>;

  // Cached snapshots (every 50 commits) for fast scrubbing
  snapshots: Map<number, Set<string>>;

  // Actions
  fetchTimeline: () => Promise<void>;
  enterReplay: () => void;
  exitReplay: () => void;
  play: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
  scrubTo: (index: number) => void;
  tickPlayback: (delta: number) => void;
}

const SNAPSHOT_INTERVAL = 50;

/** Compute visible files from commit 0..index */
function computeVisibleFiles(
  commits: TimelineCommit[],
  toIndex: number,
  snapshots: Map<number, Set<string>>,
): Set<string> {
  // Find nearest cached snapshot before toIndex
  let startIdx = 0;
  let files = new Set<string>();

  for (const [idx, snap] of snapshots) {
    if (idx <= toIndex && idx >= startIdx) {
      startIdx = idx;
      files = new Set(snap);
    }
  }

  // Apply remaining commits
  for (let i = startIdx; i <= toIndex && i < commits.length; i++) {
    if (i === startIdx && snapshots.has(i)) continue; // already applied
    for (const fs of commits[i].fileStatuses) {
      switch (fs.status) {
        case 'A': files.add(fs.path); break;
        case 'D': files.delete(fs.path); break;
        case 'R':
          if (fs.oldPath) files.delete(fs.oldPath);
          files.add(fs.path);
          break;
        // M: no change to set
      }
    }
  }

  return files;
}

// Accumulator for fractional commit advancement
let playbackAccumulator = 0;

export const useTimelineStore = create<TimelineState>((set, get) => ({
  commits: [],
  loaded: false,
  mode: 'live',
  currentIndex: -1,
  playing: false,
  speed: 2,
  visibleFiles: new Set(),
  snapshots: new Map(),

  fetchTimeline: async () => {
    const res = await fetch('/api/timeline');
    const data = await res.json();
    const commits = data.commits as TimelineCommit[];

    // Pre-cache snapshots every SNAPSHOT_INTERVAL commits
    const snapshots = new Map<number, Set<string>>();
    const files = new Set<string>();
    for (let i = 0; i < commits.length; i++) {
      for (const fs of commits[i].fileStatuses) {
        switch (fs.status) {
          case 'A': files.add(fs.path); break;
          case 'D': files.delete(fs.path); break;
          case 'R':
            if (fs.oldPath) files.delete(fs.oldPath);
            files.add(fs.path);
            break;
        }
      }
      if (i % SNAPSHOT_INTERVAL === 0) {
        snapshots.set(i, new Set(files));
      }
    }
    // Always cache the last commit
    snapshots.set(commits.length - 1, new Set(files));

    set({ commits, loaded: true, snapshots });
  },

  enterReplay: () => {
    const { loaded, fetchTimeline } = get();
    if (!loaded) {
      fetchTimeline().then(() => {
        set({ mode: 'replay', currentIndex: -1, visibleFiles: new Set(), playing: false });
        useGraphStore.getState().setTimelineVisibleIds(new Set());
      });
    } else {
      set({ mode: 'replay', currentIndex: -1, visibleFiles: new Set(), playing: false });
      useGraphStore.getState().setTimelineVisibleIds(new Set());
    }
    playbackAccumulator = 0;
  },

  exitReplay: () => {
    set({ mode: 'live', playing: false, currentIndex: -1, visibleFiles: new Set() });
    useGraphStore.getState().setTimelineVisibleIds(null);
    playbackAccumulator = 0;
  },

  play: () => set({ playing: true }),
  pause: () => { set({ playing: false }); playbackAccumulator = 0; },

  setSpeed: (speed) => set({ speed }),

  scrubTo: (index) => {
    const { commits, snapshots } = get();
    if (index < 0) {
      set({ currentIndex: -1, visibleFiles: new Set() });
      useGraphStore.getState().setTimelineVisibleIds(new Set());
      return;
    }
    const clamped = Math.min(index, commits.length - 1);
    const visible = computeVisibleFiles(commits, clamped, snapshots);

    // Map file paths to node IDs (file:relativePath)
    const nodeIds = new Set<string>();
    for (const f of visible) {
      nodeIds.add(`file:${f}`);
    }
    // Also show directory nodes if any child file is visible
    const graphData = useGraphStore.getState().data;
    if (graphData) {
      for (const node of graphData.nodes) {
        if (node.type === 'directory') {
          const dirPrefix = node.id.replace('dir:', '');
          for (const f of visible) {
            if (f.startsWith(dirPrefix)) {
              nodeIds.add(node.id);
              break;
            }
          }
        }
      }
    }

    set({ currentIndex: clamped, visibleFiles: visible });
    useGraphStore.getState().setTimelineVisibleIds(nodeIds);
  },

  tickPlayback: (delta) => {
    const { playing, currentIndex, commits, speed, scrubTo } = get();
    if (!playing || commits.length === 0) return;
    if (currentIndex >= commits.length - 1) {
      set({ playing: false });
      return;
    }

    playbackAccumulator += delta * speed;
    if (playbackAccumulator >= 1) {
      const advance = Math.floor(playbackAccumulator);
      playbackAccumulator -= advance;
      scrubTo(Math.min(currentIndex + advance, commits.length - 1));
    }
  },
}));

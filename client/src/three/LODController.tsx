import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useGraphStore } from '../store/graph-store';

export type LODLevel = 'project' | 'directory' | 'file';

const THRESHOLDS = {
  project: 40,    // Camera > 40 units → show directory clusters only
  directory: 15,  // Camera 15-40 → show files
  file: 5,        // Camera < 15 → show symbols (future)
};

/** Reactive LOD controller - updates store based on camera distance */
export function LODController() {
  const camera = useThree(s => s.camera);
  const lastLevel = useRef<LODLevel>('project');

  useFrame(() => {
    const dist = camera.position.length();
    let level: LODLevel;

    if (dist > THRESHOLDS.project) {
      level = 'project';
    } else if (dist > THRESHOLDS.file) {
      level = 'directory';
    } else {
      level = 'file';
    }

    if (level !== lastLevel.current) {
      lastLevel.current = level;
      // Future: update store with LOD level for conditional rendering
    }
  });

  return null;
}

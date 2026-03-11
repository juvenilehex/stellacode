import { useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { useGraphStore } from '../store/graph-store';
import type { LODLevel } from '../store/graph-store';

const THRESHOLDS = {
  project: 120,   // Camera > 120 units: directory clusters only
  directory: 40,  // Camera 40-120: show files
  file: 12,       // Camera < 12: full detail
};

export function LODController() {
  const camera = useThree(s => s.camera);
  const lastLevel = useRef<LODLevel>('directory');
  const setLodLevel = useGraphStore(s => s.setLodLevel);

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
      setLodLevel(level);
    }
  });

  return null;
}

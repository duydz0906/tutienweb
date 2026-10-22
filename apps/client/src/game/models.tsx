import { useEffect, useMemo } from 'react';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ThreeElements } from '@react-three/fiber';

type MeshProps = Omit<ThreeElements['mesh'], 'geometry'>;
type Vec3 = [number, number, number];

/**
 * Beveled box used wherever a hard cube used to read as an untextured block.
 * Same footprint as `<boxGeometry>`, so it drops into existing layouts.
 */
export function Rounded({ size, radius = 0.05, smooth = 3, ...props }: MeshProps & {
  size: Vec3; radius?: number; smooth?: number;
}) {
  const [width, height, depth] = size;
  const geometry = useMemo(() => new RoundedBoxGeometry(width, height, depth, smooth, Math.min(radius, Math.min(width, height, depth) / 2)),
    [width, height, depth, smooth, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh {...props} geometry={geometry} />;
}

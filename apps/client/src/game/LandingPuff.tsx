import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * The dust ring a rider kicks up on touchdown.
 *
 * It exists because a smooth landing still needs a *contact beat* — without one, settling onto the
 * ground at 0.9 m/s reads as "did I land?". The ring is deliberately quiet: it expands and fades in
 * half a second, it never brightens, and it is gone before the next jump. Everything is driven off
 * the mount time, so React only renders it once per landing.
 */
const DURATION = 0.55;

export function LandingPuff({ x, z, color = '#dfe9e4' }: { x: number; z: number; color?: string }) {
  const ring = useRef<THREE.Mesh>(null);
  const motes = useRef<THREE.Points>(null);
  const started = useRef<number | null>(null);
  const geometry = useMemo(() => {
    const count = 18;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.12;
      positions[i * 3] = Math.sin(angle) * 0.55;
      positions[i * 3 + 1] = 0.06 + (i % 4) * 0.02;
      positions[i * 3 + 2] = Math.cos(angle) * 0.55;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    if (started.current === null) started.current = now;
    const t = Math.min(1, (now - started.current) / DURATION);
    // Fast out, slow settle — the same easing family as the flight curves.
    const ease = 1 - (1 - t) ** 3;
    if (ring.current) {
      ring.current.scale.setScalar(0.6 + ease * 3.2);
      const material = ring.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.5 * (1 - t) ** 2;
      ring.current.visible = t < 1;
    }
    if (motes.current) {
      motes.current.scale.setScalar(0.6 + ease * 2.1);
      motes.current.position.y = ease * 0.25;
      const material = motes.current.material as THREE.PointsMaterial;
      material.opacity = 0.65 * (1 - t) ** 2;
      motes.current.visible = t < 1;
    }
  });

  return <group position={[x, 0.04, z]}>
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.62, 0.78, 40]} />
      <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
    <points ref={motes} geometry={geometry}>
      <pointsMaterial color={color} size={0.16} transparent opacity={0.65} depthWrite={false} />
    </points>
  </group>;
}

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
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

/** Rounded, tapered limb made from a capsule: reads as a muscle instead of a cylinder. */
function Limb({ from, to, radius, color, roughness = 0.68 }: {
  from: Vec3; to: Vec3; radius: number; color: string; roughness?: number;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const middle = start.clone().add(end).multiplyScalar(0.5);
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    return { position: middle.toArray() as Vec3, quaternion: rotation, length: direction.length() };
  }, [from[0], from[1], from[2], to[0], to[1], to[2]]);
  return <mesh castShadow position={position} quaternion={quaternion}>
    <capsuleGeometry args={[radius, Math.max(0.01, length - radius * 2), 8, 18]} />
    <meshStandardMaterial color={color} roughness={roughness} metalness={0.05} />
  </mesh>;
}

export type BeastKind = 'wolf' | 'boar' | 'stag' | 'fox' | 'serpent';

/**
 * Smooth, sculpted spirit beast. Built from capsule limbs and high-segment ellipsoids instead of
 * boxes so wolves, boars, stags, pets and flying mounts share one organic silhouette.
 */
export function SpiritBeast({ kind = 'wolf', color = '#8b95a2', glow = '#d8f4ff', wings = false,
  scale = 1, saddle = false, floating = false }: {
  kind?: BeastKind; color?: string; glow?: string; wings?: boolean; scale?: number;
  saddle?: boolean; floating?: boolean;
}) {
  const palette = useMemo(() => {
    const base = new THREE.Color(color);
    const shade = (amount: number) => `#${base.clone().multiplyScalar(amount).getHexString()}`;
    return { body: color, dark: shade(0.72), light: shade(1.22), belly: shade(1.42), hoof: '#3d3a36' };
  }, [color]);
  const ears = kind === 'boar' ? 'small' : kind === 'stag' ? 'wide' : 'pointed';
  const torsoLength = kind === 'boar' ? 1.12 : kind === 'serpent' ? 1.5 : 1.3;
  const torsoHeight = kind === 'boar' ? 0.72 : 0.8;
  const legTop = kind === 'boar' ? 0.5 : 0.62;
  const headY = kind === 'boar' ? 0.86 : 1.02;
  const headZ = kind === 'boar' ? 0.74 : 0.82;
  return <group scale={scale} position={floating ? [0, 0.12, 0] : [0, 0, 0]}>
    {/* Torso: two overlapping ellipsoids give a chest and a haunch without a hard seam. */}
    <mesh castShadow position={[0, torsoHeight, 0]} scale={[0.86, 0.9, torsoLength]}>
      <sphereGeometry args={[0.44, 32, 24]} />
      <meshStandardMaterial color={palette.body} roughness={0.66} metalness={0.04} />
    </mesh>
    <mesh castShadow position={[0, torsoHeight - 0.04, torsoLength * 0.34]} scale={[0.92, 1.02, 0.78]}>
      <sphereGeometry args={[0.4, 32, 24]} />
      <meshStandardMaterial color={palette.light} roughness={0.62} metalness={0.04} />
    </mesh>
    <mesh castShadow position={[0, torsoHeight - 0.02, -torsoLength * 0.42]} scale={[0.88, 0.92, 0.72]}>
      <sphereGeometry args={[0.38, 32, 24]} />
      <meshStandardMaterial color={palette.body} roughness={0.66} metalness={0.04} />
    </mesh>
    {/* Belly highlight keeps the silhouette readable under moonlight. */}
    <mesh position={[0, torsoHeight - 0.24, 0.02]} scale={[0.66, 0.4, torsoLength * 0.9]}>
      <sphereGeometry args={[0.42, 24, 18]} />
      <meshStandardMaterial color={palette.belly} roughness={0.8} />
    </mesh>
    {/* Neck and head */}
    <Limb from={[0, torsoHeight + 0.14, torsoLength * 0.28]} to={[0, headY - 0.08, headZ - 0.1]} radius={0.15} color={palette.light} />
    <mesh castShadow position={[0, headY, headZ]} scale={[0.86, 0.9, 1.02]}>
      <sphereGeometry args={[0.245, 32, 24]} />
      <meshStandardMaterial color={palette.light} roughness={0.58} />
    </mesh>
    <mesh castShadow position={[0, headY - 0.09, headZ + 0.22]} scale={[0.82, 0.7, 1.05]}>
      <sphereGeometry args={[0.16, 28, 20]} />
      <meshStandardMaterial color={palette.belly} roughness={0.7} />
    </mesh>
    <mesh position={[0, headY - 0.07, headZ + 0.34]}>
      <sphereGeometry args={[0.052, 18, 14]} />
      <meshStandardMaterial color="#2b2724" roughness={0.4} />
    </mesh>
    {/* Eyes glow in the dark; ears are cones with enough segments to stay round. */}
    {[-1, 1].map((side) => <group key={`face-${side}`}>
      <mesh position={[side * 0.112, headY + 0.035, headZ + 0.19]}>
        <sphereGeometry args={[0.036, 16, 12]} />
        <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={2.2} roughness={0.2} />
      </mesh>
      <mesh castShadow position={[side * 0.13, headY + 0.15, headZ - 0.02]}
        rotation={[ears === 'wide' ? -0.25 : -0.1, 0, side * (ears === 'wide' ? 0.7 : 0.34)]}
        scale={ears === 'small' ? [0.7, 0.55, 0.7] : ears === 'wide' ? [1.15, 0.85, 0.6] : [0.9, 1, 0.7]}>
        <coneGeometry args={[0.086, ears === 'small' ? 0.14 : 0.26, 18]} />
        <meshStandardMaterial color={palette.dark} roughness={0.72} />
      </mesh>
    </group>)}
    {kind === 'boar' && [-1, 1].map((side) => <mesh key={`tusk-${side}`} position={[side * 0.1, headY - 0.12, headZ + 0.3]}
      rotation={[-0.5, 0, side * 0.3]}>
      <coneGeometry args={[0.032, 0.18, 14]} />
      <meshStandardMaterial color="#f3e7d4" roughness={0.35} />
    </mesh>)}
    {kind === 'stag' && [-1, 1].map((side) => <group key={`antler-${side}`} position={[side * 0.14, headY + 0.2, headZ - 0.04]}>
      <mesh castShadow rotation={[0.1, 0, side * 0.45]} position={[side * 0.1, 0.22, 0]}>
        <coneGeometry args={[0.036, 0.52, 14]} />
        <meshStandardMaterial color="#e9e4cf" roughness={0.55} />
      </mesh>
      <mesh castShadow rotation={[0.2, 0, side * 1.05]} position={[side * 0.26, 0.42, -0.02]}>
        <coneGeometry args={[0.026, 0.34, 12]} />
        <meshStandardMaterial color="#e9e4cf" roughness={0.55} />
      </mesh>
    </group>)}
    {/* Four tapered legs with paw caps */}
    {[[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([side, front], index) => {
      const z = front * torsoLength * 0.36;
      return <group key={`leg-${index}`}>
        <Limb from={[side * 0.24, legTop + 0.16, z]} to={[side * 0.26, 0.12, z + front * 0.02]} radius={0.072} color={palette.dark} />
        <mesh castShadow position={[side * 0.26, 0.06, z + front * 0.05]} scale={[1, 0.7, 1.25]}>
          <sphereGeometry args={[0.078, 18, 14]} />
          <meshStandardMaterial color={palette.hoof} roughness={0.55} />
        </mesh>
      </group>;
    })}
    {/* Tail: a smooth tapering capsule, bushier for the fox and wolf. */}
    <Limb from={[0, torsoHeight + 0.06, -torsoLength * 0.58]}
      to={[0, torsoHeight + (kind === 'fox' ? 0.24 : 0.02), -torsoLength * 0.95]}
      radius={kind === 'boar' ? 0.035 : kind === 'fox' ? 0.1 : 0.075} color={kind === 'fox' ? palette.light : palette.dark} />
    {wings && <group position={[0, torsoHeight + 0.14, -0.06]}>
      {[-1, 1].map((side) => <group key={`wing-${side}`} rotation={[0.12, side * 0.5, side * 0.36]}>
        <mesh castShadow position={[side * 0.52, 0.16, -0.06]} scale={[0.62, 0.09, 0.34]}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshStandardMaterial color={palette.belly} roughness={0.62} transparent opacity={0.94} />
        </mesh>
        {[0.72, 0.94, 1.14].map((spread, i) => <mesh key={i} castShadow position={[side * spread, 0.1 - i * 0.03, -0.1 - i * 0.04]}
          rotation={[0.1, side * 0.42, side * (0.2 + i * 0.16)]} scale={[0.5 - i * 0.06, 0.045, 0.2]}>
          <sphereGeometry args={[1, 18, 12]} />
          <meshStandardMaterial color={palette.light} roughness={0.66} transparent opacity={0.9} />
        </mesh>)}
      </group>)}
    </group>}
    {/* Spirit aura underneath ties the beast to the jade palette of the game. */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <ringGeometry args={[0.52, 0.62, 48]} />
      <meshBasicMaterial color={glow} transparent opacity={0.34} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
    {floating && <pointLight color={glow} intensity={1.4} distance={4.2} position={[0, 0.6, 0]} />}
    {saddle && <group position={[0, torsoHeight + 0.34, -0.05]}>
      <mesh castShadow scale={[0.62, 0.22, 0.78]}><sphereGeometry args={[0.42, 24, 18]} />
        <meshStandardMaterial color="#5b3f2c" roughness={0.72} /></mesh>
      <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.026, 12, 32]} />
        <meshStandardMaterial color="#d8b477" metalness={0.75} roughness={0.32} />
      </mesh>
    </group>}
  </group>;
}

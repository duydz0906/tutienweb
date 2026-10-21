import * as THREE from 'three';
import type { Habitat } from '@van-thuong/shared';
import { BillboardLabel } from './Billboard';

/** Each server-owned monster habitat gets a recognisable, walkable biome.
 * Decorations are visual only: no client-side hitboxes or invisible walls. */
function BiomeProp({ habitat, index }: { habitat: Habitat; index: number }) {
  const angle = (index / 6) * Math.PI * 2 + 0.36;
  const distance = habitat.radius - 1.15 + index % 2 * 0.35;
  const x = Math.sin(angle) * distance;
  const z = Math.cos(angle) * distance;
  const size = 0.85 + index % 3 * 0.17;
  const { biome, color } = habitat;
  return <group position={[x, 0, z]} rotation={[0, angle, 0]} scale={size}>
    {(biome === 'pine' || biome === 'grove') && <>
      <mesh castShadow position={[0, 1.3, 0]}><cylinderGeometry args={[0.11, 0.22, 2.6, 7]} />
        <meshStandardMaterial color={biome === 'grove' ? '#a5a393' : '#5b5148'} roughness={1} /></mesh>
      {biome === 'pine' ? [1.9, 2.6].map((height, j) => <mesh key={j} castShadow position={[0, height, 0]}>
        <coneGeometry args={[1.05 - j * 0.21, 1.85, 7]} /><meshStandardMaterial color={j ? '#4f8070' : '#36584d'} roughness={1} flatShading />
      </mesh>) : <mesh castShadow position={[0, 2.85, 0]} scale={[1.1, 0.85, 1.05]}>
        <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.24} roughness={0.88} flatShading />
      </mesh>}
    </>}
    {biome === 'rock' && <>
      <mesh castShadow position={[0, 0.42, 0]} rotation={[0.2, angle, 0.1]}><dodecahedronGeometry args={[0.72, 0]} />
        <meshStandardMaterial color="#7c766c" roughness={1} flatShading /></mesh>
      <mesh position={[0.23, 0.93, 0.05]} rotation={[0, 0, index * 0.4]}><octahedronGeometry args={[0.23, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.37} roughness={0.45} /></mesh>
    </>}
    {biome === 'swamp' && <>
      <mesh position={[0, 0.108, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.98, 18]} />
        <meshStandardMaterial color="#4a7a71" transparent opacity={0.76} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      {[-0.38, 0.05, 0.39].map((offset, j) => <mesh key={j} position={[offset, 0.4 + j * 0.12, 0.21]} rotation={[0, 0, offset * 0.5]}>
        <cylinderGeometry args={[0.028, 0.05, 0.8 + j * 0.24, 5]} /><meshStandardMaterial color="#96a877" roughness={1} /></mesh>)}
      <mesh position={[0, 0.18, -0.15]}><sphereGeometry args={[0.16, 8, 6]} /><meshBasicMaterial color={color} transparent opacity={0.75} /></mesh>
    </>}
    {biome === 'mist' && <>
      <mesh castShadow position={[0, 1.15, 0]} rotation={[0, index, 0.1]} scale={[0.52, 1.7, 0.46]}>
        <octahedronGeometry args={[0.95, 0]} /><meshStandardMaterial color="#59637a" roughness={0.42} metalness={0.3} flatShading /></mesh>
      <mesh position={[0, 1.6, 0.47]} scale={[0.35, 0.72, 0.2]}><octahedronGeometry args={[0.9, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.75} transparent opacity={0.75} /></mesh>
    </>}
    {biome === 'ruins' && <>
      <mesh castShadow position={[0, 0.2, 0]}><cylinderGeometry args={[0.7, 0.86, 0.4, 8]} /><meshStandardMaterial color="#777b70" roughness={1} /></mesh>
      <mesh castShadow position={[0, 1.25, 0]} rotation={[0, 0, (index % 2 ? -1 : 1) * 0.13]}>
        <cylinderGeometry args={[0.27, 0.38, 1.95, 8]} /><meshStandardMaterial color="#b2ad94" roughness={1} flatShading /></mesh>
      {index % 2 === 0 && <mesh position={[0, 2.22, 0]}><boxGeometry args={[0.85, 0.25, 0.82]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.19} /></mesh>}
    </>}
    {biome === 'cloud' && <>
      {[-0.48, 0.12, 0.57].map((dx, j) => <mesh key={j} position={[dx, 1.0 + j * 0.19, 0]} scale={[0.7, 0.4, 0.55]}>
        <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={color} emissive="#7497ba" emissiveIntensity={0.32} flatShading transparent opacity={0.82} /></mesh>)}
      <mesh position={[0, 0.54, 0]}><cylinderGeometry args={[0.22, 0.4, 1.1, 7]} />
        <meshStandardMaterial color="#a4bac0" roughness={0.8} /></mesh>
    </>}
    {biome === 'crystal' && [0, 1, 2].map((j) => <mesh key={j}
      position={[(j - 1) * 0.35, 0.65 + j * 0.3, j * 0.24]} rotation={[0, j * 0.8, 0.11 * (j - 1)]}
      scale={[0.36, 0.85 + j * 0.33, 0.39]}><octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={j % 2 ? '#e5dbff' : color} emissive={color} emissiveIntensity={0.72} transparent opacity={0.88} flatShading /></mesh>)}
  </group>;
}

export function HabitatGround({ habitat }: { habitat: Habitat }) {
  const { x, z } = habitat.center;
  return <group position={[x, 0, z]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.097, 0]}>
      <circleGeometry args={[habitat.radius + 0.6, 48]} />
      <meshBasicMaterial color={habitat.color} transparent opacity={0.13} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.105, 0]}>
      <ringGeometry args={[habitat.radius + 0.25, habitat.radius + 0.35, 48]} />
      <meshBasicMaterial color={habitat.color} transparent opacity={0.67} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
    {Array.from({ length: 6 }, (_, index) => <BiomeProp key={index} habitat={habitat} index={index} />)}
    <group position={[0, 0, habitat.radius + 0.95]}>
      <mesh castShadow position={[0, 0.86, 0]}><cylinderGeometry args={[0.18, 0.29, 1.72, 7]} />
        <meshStandardMaterial color="#4c5756" roughness={0.86} /></mesh>
      <mesh position={[0, 1.84, 0]}><octahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color={habitat.color} emissive={habitat.color} emissiveIntensity={1.08} /></mesh>
      <BillboardLabel text={`${habitat.name.toUpperCase()} · CẤP ${habitat.level}`} position={[0, 2.72, 0]}
        color={habitat.color} width={4.7} />
    </group>
  </group>;
}

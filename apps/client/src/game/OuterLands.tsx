import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BillboardLabel } from './Billboard';

/**
 * The outer lands.
 *
 * The world was expanded twenty times in area (radius ×√20), so the hand-placed heart of each map —
 * the sect halls, the village square, the gates — now sits in the middle of a much larger country.
 * Everything out here fills that ring with districts a cultivator would actually cross: outer
 * disciple courtyards, terraced fields, bamboo and pine forests, stone roads with waymarkers,
 * watchtowers, ruined shrines and spirit wells.
 *
 * All of it is instanced or built from shared geometry: the old maps had ~200 props inside a 68 m
 * radius, and the new ring holds thousands without adding thousands of draw calls.
 */

/** Deterministic scatter: the same forest on every client, and no `Math.random` during render. */
function scatter(seed: number, count: number, min: number, max: number, filter?: (x: number, z: number) => boolean) {
  const spots: { x: number; z: number; rot: number; scale: number }[] = [];
  let state = seed;
  const random = () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
  for (let i = 0; i < count * 3 && spots.length < count; i++) {
    const angle = random() * Math.PI * 2;
    // sqrt keeps the density even instead of clumping at the centre of the band.
    const radius = Math.sqrt(min * min + random() * (max * max - min * min));
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    if (filter && !filter(x, z)) continue;
    spots.push({ x, z, rot: random() * Math.PI * 2, scale: 0.75 + random() * 0.7 });
  }
  return spots;
}

type Spot = { x: number; z: number; rot: number; scale: number };

function Instanced({ spots, children, size = [1, 1, 1], color, lift = 0, cast = true }: {
  spots: Spot[]; children: React.ReactNode; size?: [number, number, number]; color: string; lift?: number; cast?: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!mesh.current) return;
    const dummy = new THREE.Object3D();
    for (const [index, spot] of spots.entries()) {
      dummy.position.set(spot.x, lift * spot.scale, spot.z);
      dummy.rotation.set(0, spot.rot, 0);
      dummy.scale.set(size[0] * spot.scale, size[1] * spot.scale, size[2] * spot.scale);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(index, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [spots, size, lift]);
  return <instancedMesh ref={mesh} args={[undefined, undefined, Math.max(1, spots.length)]} castShadow={cast} receiveShadow>
    {children}
    <meshStandardMaterial color={color} roughness={0.92} flatShading />
  </instancedMesh>;
}

function PineForest({ spots, tone }: { spots: Spot[]; tone: 'cool' | 'warm' | 'spirit' }) {
  const canopy = tone === 'cool' ? '#4f7a68' : tone === 'warm' ? '#5d7f52' : '#7c9bb0';
  return <>
    <Instanced spots={spots} size={[0.5, 1, 0.5]} color="#6b5a45" lift={2.4}>
      <cylinderGeometry args={[0.34, 0.52, 4.8, 8]} />
    </Instanced>
    <Instanced spots={spots} size={[2.1, 1, 2.1]} color={canopy} lift={6.4}>
      <coneGeometry args={[1, 3.4, 9]} />
    </Instanced>
    <Instanced spots={spots} size={[1.35, 1, 1.35]} color={canopy} lift={8.2}>
      <coneGeometry args={[1, 2.6, 9]} />
    </Instanced>
  </>;
}

function RockField({ spots }: { spots: Spot[] }) {
  return <Instanced spots={spots} size={[1, 0.8, 1]} color="#7b857c" lift={0.6} cast={false}>
    <dodecahedronGeometry args={[1, 0]} />
  </Instanced>;
}

/** A carved waystone gate: two pillars and a lintel, the standard road furniture of the genre. */
function ShrineGate({ x, z, rotation, label, color = '#e9d3a0' }: { x: number; z: number; rotation: number; label: string; color?: string }) {
  return <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
    {[-1, 1].map((side) => <mesh key={side} castShadow position={[side * 2.4, 2.1, 0]}>
      <boxGeometry args={[0.42, 4.2, 0.42]} /><meshStandardMaterial color="#8d8577" roughness={0.95} />
    </mesh>)}
    <mesh castShadow position={[0, 4.35, 0]}><boxGeometry args={[6.2, 0.46, 0.72]} /><meshStandardMaterial color="#6f6353" roughness={0.9} /></mesh>
    <mesh position={[0, 4.05, 0]}><boxGeometry args={[4.4, 0.14, 0.5]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} /></mesh>
    <BillboardLabel text={label} position={[0, 5.3, 0]} width={5.4} color={color} />
  </group>;
}

/** Watchtower with a lamp: a landmark that reads from a long way off, and cheap to draw. */
function Watchtower({ x, z, rotation }: { x: number; z: number; rotation: number }) {
  return <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
    <mesh castShadow position={[0, 3.2, 0]}><cylinderGeometry args={[1.5, 2.1, 6.4, 8]} /><meshStandardMaterial color="#7d7f74" roughness={1} flatShading /></mesh>
    <mesh receiveShadow position={[0, 6.5, 0]}><cylinderGeometry args={[2.5, 2.5, 0.3, 8]} /><meshStandardMaterial color="#918678" roughness={0.95} /></mesh>
    {[-1, 0, 1].map((side) => <mesh key={side} castShadow position={[side * 2.2, 7.6, 0]} rotation={[0, 0, side * 0.12]}>
      <boxGeometry args={[0.22, 2.2, 0.22]} /><meshStandardMaterial color="#5f564a" />
    </mesh>)}
    <mesh castShadow position={[0, 9.1, 0]} rotation={[0, Math.PI / 4, 0]}>
      <coneGeometry args={[3.4, 1.5, 4]} /><meshStandardMaterial color="#455c58" roughness={0.85} flatShading />
    </mesh>
    <mesh position={[0, 7.4, 1.5]}><boxGeometry args={[0.7, 0.7, 0.7]} />
      <meshStandardMaterial color="#ffe0a1" emissive="#ffbe6a" emissiveIntensity={1.5} /></mesh>
  </group>;
}

/** Ruined shrine: a broken platform, two standing pillars and drifting qi. */
function Ruin({ x, z, rotation }: { x: number; z: number; rotation: number }) {
  const glow = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (glow.current) glow.current.position.y = 1.4 + Math.sin(clock.elapsedTime * 0.9 + x) * 0.18; });
  return <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
    <mesh receiveShadow position={[0, 0.2, 0]}><cylinderGeometry args={[3.2, 3.6, 0.4, 10]} /><meshStandardMaterial color="#8b8478" roughness={1} /></mesh>
    <mesh castShadow position={[-1.5, 1.9, 0]} rotation={[0, 0, 0.1]}><cylinderGeometry args={[0.3, 0.4, 3.4, 8]} /><meshStandardMaterial color="#a09787" roughness={1} /></mesh>
    <mesh castShadow position={[1.6, 1.3, 0.4]} rotation={[0.2, 0, -0.24]}><cylinderGeometry args={[0.28, 0.36, 2.4, 8]} /><meshStandardMaterial color="#968e80" roughness={1} /></mesh>
    <mesh castShadow position={[0.2, 0.55, -1.2]} rotation={[0.4, 0.6, 0.3]}><boxGeometry args={[2.4, 0.4, 1.2]} /><meshStandardMaterial color="#8f887b" roughness={1} /></mesh>
    <mesh ref={glow} position={[0, 1.4, 0]}><octahedronGeometry args={[0.28, 0]} />
      <meshStandardMaterial color="#bfe8de" emissive="#6fd8c4" emissiveIntensity={1.7} /></mesh>
  </group>;
}

/** Terraced fields: the village valley grows rice all the way to the foot of the mountain. */
function Terraces({ centre, rings }: { centre: [number, number]; rings: number }) {
  return <group position={[centre[0], 0, centre[1]]}>
    {Array.from({ length: rings }, (_, i) => {
      const radius = 18 + i * 11;
      return <group key={i}>
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05 + i * 0.18, 0]}>
          <ringGeometry args={[radius, radius + 8, 48, 1, i * 0.7, Math.PI * 1.45]} />
          <meshStandardMaterial color={i % 2 ? '#5f8a58' : '#6d9761'} roughness={1} side={THREE.DoubleSide} />
        </mesh>
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02 + i * 0.18, 0]}>
          <ringGeometry args={[radius - 0.4, radius, 48, 1, i * 0.7, Math.PI * 1.45]} />
          <meshStandardMaterial color="#8a7f63" roughness={1} side={THREE.DoubleSide} />
        </mesh>
      </group>;
    })}
  </group>;
}

/** Outer disciple courtyard: a ring of small houses around a training yard. */
function Courtyard({ x, z, rotation, count = 6, radius = 13, label }: {
  x: number; z: number; rotation: number; count?: number; radius?: number; label: string;
}) {
  return <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
      <circleGeometry args={[radius * 1.4, 40]} /><meshStandardMaterial color="#9c998a" roughness={0.98} />
    </mesh>
    {Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      return <group key={i} position={[Math.sin(angle) * radius, 0, Math.cos(angle) * radius]} rotation={[0, angle + Math.PI, 0]}>
        <mesh castShadow position={[0, 1.3, 0]}><boxGeometry args={[5.2, 2.6, 4] } /><meshStandardMaterial color={i % 2 ? '#cfc6ae' : '#c2b9a2'} roughness={0.94} /></mesh>
        <mesh castShadow position={[0, 3.1, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[4.4, 1.5, 4]} /><meshStandardMaterial color={i % 2 ? '#5c6a5c' : '#6b5a4c'} roughness={0.9} flatShading />
        </mesh>
        <mesh position={[0, 1.1, 2.02]}><boxGeometry args={[1, 1.9, 0.1]} /><meshStandardMaterial color="#4f4335" /></mesh>
      </group>;
    })}
    <mesh position={[0, 2.6, 0]}><BillboardLabel text={label} position={[0, 0, 0]} width={6} color="#f0dcaa" /></mesh>
  </group>;
}

/**
 * Everything outside the old island. `zone` picks the palette and the content; the ring is measured
 * from the centre so nothing overlaps the hand-placed heart of the map.
 */
export function OuterLands({ zone }: { zone: 'overworld' | 'village' | 'wilderness' | 'ascendant' }) {
  const sect = zone === 'overworld';
  const village = zone === 'village';
  const ascendant = zone === 'ascendant';

  // The heart of each map stays clear: sect halls reach z = 36, the village square r = 30.
  const inner = village ? 48 : sect ? 62 : 34;

  const pines = useMemo(() => scatter(village ? 91 : sect ? 17 : 41, village ? 220 : 320, inner + 12, village ? 138 : 268), [inner, sect, village]);
  const rocks = useMemo(() => scatter(23, village ? 90 : 150, inner + 6, village ? 150 : 280), [inner, village]);
  const grove = useMemo(() => scatter(57, 130, inner + 30, village ? 140 : 250), [inner, village]);

  const shrines = useMemo(() => [
    { x: 0, z: sect ? 72 : 0, rot: 0, label: sect ? 'NGOẠI MÔN · SƠN ĐẠO' : 'SƠN ĐẠO' },
    { x: 0, z: -(sect ? 74 : 68), rot: Math.PI, label: 'CỔ ĐẠO' },
    { x: sect ? 86 : 74, z: 0, rot: -Math.PI / 2, label: 'ĐÔNG ĐẠO' },
    { x: -(sect ? 86 : 74), z: 0, rot: Math.PI / 2, label: 'TÂY ĐẠO' },
  ], [sect]);

  const towers = useMemo(() => [
    { x: 118, z: 96, rot: 0.4 }, { x: -132, z: -88, rot: -0.6 },
    { x: 96, z: -156, rot: 1.1 }, { x: -104, z: 162, rot: 2.2 },
  ], []);

  const ruins = useMemo(() => [
    { x: -176, z: 44, rot: 0.6 }, { x: 168, z: -62, rot: -1.2 },
    { x: 44, z: 208, rot: 2.4 }, { x: -58, z: -212, rot: 0.9 },
  ], []);

  return <>
    {/* Roads: a ring plus four arms, so the enlarged map still has a readable geography. */}
    {[86, 168].map((radius) => <mesh key={radius} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.075, 0]}>
      <ringGeometry args={[radius - 1.6, radius + 1.6, 128]} />
      <meshStandardMaterial color={village ? '#a79d85' : '#8f937f'} roughness={1} side={THREE.DoubleSide} transparent opacity={0.75} />
    </mesh>)}
    {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((angle) => <mesh key={angle} rotation={[-Math.PI / 2, 0, angle]}
      position={[Math.sin(angle) * 96, 0.073, Math.cos(angle) * 96]}>
      <planeGeometry args={[3.2, 190]} />
      <meshStandardMaterial color={village ? '#a79d85' : '#8f937f'} roughness={1} side={THREE.DoubleSide} transparent opacity={0.7} />
    </mesh>)}

    <PineForest spots={pines} tone={ascendant ? 'spirit' : village ? 'warm' : 'cool'} />
    <RockField spots={rocks} />
    {/* Broadleaf groves, instanced like the pines so the ring costs two draw calls, not 260. */}
    <Instanced spots={grove} size={[0.32, 1, 0.32]} color="#6f6249" lift={1.3}>
      <cylinderGeometry args={[0.5, 0.8, 2.6, 7]} />
    </Instanced>
    <Instanced spots={grove} size={[1.5, 1.4, 1.5]} color={village ? '#6f9a5f' : ascendant ? '#93bcae' : '#547f66'} lift={3}>
      <icosahedronGeometry args={[1, 1]} />
    </Instanced>

    {shrines.map((shrine) => <ShrineGate key={shrine.label} x={shrine.x} z={shrine.z} rotation={shrine.rot} label={shrine.label} />)}
    {towers.map((tower, i) => <Watchtower key={`tower-${i}`} x={tower.x} z={tower.z} rotation={tower.rot} />)}
    {ruins.map((ruin, i) => <Ruin key={`ruin-${i}`} x={ruin.x} z={ruin.z} rotation={ruin.rot} />)}

    {village && <>
      <Terraces centre={[0, -96]} rings={4} />
      <Terraces centre={[-112, 58]} rings={3} />
      <Courtyard x={96} z={64} rotation={0.4} count={7} radius={14} label="VÂN CỐC · ĐÔNG THÔN" />
      <Courtyard x={-88} z={-84} rotation={-0.7} count={6} radius={12} label="VÂN CỐC · NAM THÔN" />
      <Courtyard x={-76} z={104} rotation={1.2} count={5} radius={11} label="VÂN CỐC · MỤC TRƯỜNG" />
    </>}

    {sect && <>
      <Courtyard x={0} z={-104} rotation={0.2} count={8} radius={17} label="NGOẠI MÔN · DIỄN VŨ TRƯỜNG" />
      <Courtyard x={-142} z={26} rotation={0.9} count={7} radius={14} label="NGOẠI MÔN · XÁ" />
      <Courtyard x={148} z={-22} rotation={-0.6} count={7} radius={14} label="TẠP DỊCH XÁ" />
      <Courtyard x={-28} z={168} rotation={Math.PI} count={6} radius={13} label="TÀNG KINH CÁC" />
    </>}

    {ascendant && <>
      {/* The higher realm: orthodox sect enclosures floating on their own plateaus. */}
      <Courtyard x={-160} z={140} rotation={0.5} count={8} radius={18} label="LINH GIỚI · THIÊN KIẾM TÔNG" />
      <Courtyard x={170} z={132} rotation={-0.5} count={7} radius={16} label="LINH GIỚI · NGỌC HUYỀN MÔN" />
      <Courtyard x={-152} z={-150} rotation={0.9} count={7} radius={16} label="LINH GIỚI · THÁI HƯ ĐIỆN" />
      <Courtyard x={168} z={-168} rotation={-0.9} count={8} radius={18} label="LINH GIỚI · CỬU THIÊN CUNG" />
      {[-160, 170, -152, 168].map((x, i) => <group key={`plateau-${i}`} position={[x, 0, [140, 132, -150, -168][i]!]}>
        <mesh receiveShadow position={[0, -1.2, 0]}><cylinderGeometry args={[34, 28, 3.2, 32]} />
          <meshStandardMaterial color="#8ea9a6" roughness={1} flatShading /></mesh>
      </group>)}
    </>}
  </>;
}

/** Spirit wells that dot the outer ring: ambient light without a shadow-casting lantern budget. */
export function SpiritWells({ spots }: { spots: [number, number][] }) {
  return <>{spots.map(([x, z]) => <group key={`${x}-${z}`} position={[x, 0, z]}>
    <mesh receiveShadow position={[0, 0.24, 0]}><cylinderGeometry args={[1.5, 1.7, 0.48, 10]} /><meshStandardMaterial color="#84887c" roughness={1} /></mesh>
    <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[1.1, 1.1, 0.12, 10]} />
      <meshStandardMaterial color="#5fb9b3" emissive="#3f8f8a" emissiveIntensity={0.9} /></mesh>
    <pointLight position={[0, 1.6, 0]} color="#9fe6d6" intensity={3} distance={16} />
  </group>)}</>;
}

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { HerbState, MonsterState, Vector3 } from '@van-thuong/shared';
import { BillboardLabel } from './Billboard';
import { PortalGate } from './PortalGate';

function Monster({ monster, selected, onSelect }: { monster: MonsterState; selected: boolean; onSelect: (id: string) => void }) {
  const group = useRef<THREE.Group>(null);
  const health = useRef<THREE.Group>(null);
  const alive = monster.hp > 0;
  const isWolf = monster.kind === 'wolf';
  const isBoar = monster.kind === 'boar';
  const isStag = monster.kind === 'spirit_stag';
  const isGhost = monster.kind === 'shade' || monster.kind === 'sky_wraith';
  const color = isWolf ? '#737e8b' : isBoar ? '#7a6665' : isStag ? '#c1c6c0' : monster.kind === 'sky_wraith' ? '#85aac1' : '#584773';
  const glow = isWolf ? '#bbdff0' : isBoar ? '#e1a888' : isStag ? '#b8f7dc' : monster.kind === 'sky_wraith' ? '#a3e7f8' : '#c28bff';
  useFrame(({ clock, camera }) => {
    if (group.current) group.current.position.y = Math.sin(clock.elapsedTime * 2.2 + monster.position.x) * 0.06;
    if (health.current) health.current.quaternion.copy(camera.quaternion);
  });
  if (!alive) return <group position={[monster.position.x, 0, monster.position.z]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.095, 0]}>
      <ringGeometry args={[0.72, 0.78, 22]} /><meshBasicMaterial color="#4d6660" transparent opacity={0.2} depthWrite={false} />
    </mesh>
  </group>;
  return <group position={[monster.position.x, 0, monster.position.z]} onClick={(event) => { event.stopPropagation(); onSelect(monster.id); }}
    onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'crosshair'; }}
    onPointerOut={() => { document.body.style.cursor = ''; }}>
    <group ref={group}>
      {isGhost ? <>
        <mesh castShadow position={[0, 1.25, 0]}><coneGeometry args={[0.9, 2.15, 9]} /><meshStandardMaterial color={color} roughness={0.68} emissive="#2c1642" emissiveIntensity={0.7} /></mesh>
        <mesh position={[0, 2.27, 0]}><sphereGeometry args={[0.46, 14, 10]} /><meshStandardMaterial color="#3f3059" emissive="#4e2a79" emissiveIntensity={1} /></mesh>
        {[-0.22, 0.22].map((x) => <mesh key={x} position={[x, 2.28, 0.42]}><sphereGeometry args={[0.075, 8, 6]} /><meshBasicMaterial color="#efaeff" /></mesh>)}
      </> : <>
        <mesh castShadow position={[0, 0.84, 0]} scale={isBoar ? [1.35, 0.82, 0.9] : [0.98, 0.75, 1.28]}>
          <sphereGeometry args={[0.87, 14, 10]} /><meshStandardMaterial color={color} roughness={0.88} /></mesh>
        <mesh castShadow position={[0, 1.04, 0.91]} scale={[0.64, 0.56, 0.72]}>
          <sphereGeometry args={[0.7, 12, 9]} /><meshStandardMaterial color={color} roughness={0.9} /></mesh>
        <mesh position={[0, 0.91, 1.48]}><sphereGeometry args={[0.22, 9, 6]} /><meshStandardMaterial color={isBoar ? '#b99384' : '#506070'} roughness={0.9} /></mesh>
        {isStag && [-1, 1].map((sign) => <group key={`antler-${sign}`} position={[sign * 0.42, 1.68, 1.07]}>
          <mesh rotation={[0, 0, -sign * 0.3]}><coneGeometry args={[0.1, 1.32, 7]} /><meshStandardMaterial color="#e8ead6" /></mesh>
          <mesh position={[sign * 0.3, 0.44, 0]} rotation={[0, 0, sign * 0.68]}><coneGeometry args={[0.06, 0.69, 6]} /><meshStandardMaterial color="#e8ead6" /></mesh>
        </group>)}
        {[-1, 1].map((sign) => <group key={sign}>
          <mesh castShadow position={[sign * 0.57, 0.32, 0.39]}><cylinderGeometry args={[0.13, 0.2, 0.62, 7]} /><meshStandardMaterial color={color} /></mesh>
          <mesh position={[sign * 0.46, 1.5, 0.93]} rotation={[0, 0, sign * 0.37]}><coneGeometry args={[isBoar ? 0.17 : 0.28, 0.76, 7]} /><meshStandardMaterial color={isBoar ? '#f0ddd0' : color} /></mesh>
          <mesh position={[sign * 0.22, 1.1, 1.49]}><sphereGeometry args={[0.06, 8, 6]} /><meshBasicMaterial color={glow} /></mesh>
        </group>)}
      </>}
    </group>
    <group ref={health} position={[0, isGhost ? 3.36 : 2.22, 0]}>
      <mesh position={[0, 0, 0]}><planeGeometry args={[1.5, 0.14]} /><meshBasicMaterial color="#142328" side={THREE.DoubleSide} depthTest={false} /></mesh>
      <mesh position={[-(1 - monster.hp / monster.maxHp) * 0.72, 0, 0.008]} scale={[Math.max(0.001, monster.hp / monster.maxHp), 1, 1]}>
        <planeGeometry args={[1.44, 0.095]} /><meshBasicMaterial color={glow} side={THREE.DoubleSide} depthTest={false} /></mesh>
    </group>
    <BillboardLabel text={`LV.${monster.level} ${monster.name}`} position={[0, isGhost ? 3.78 : 2.65, 0]} width={3.3} color={selected ? '#fff2ae' : glow} />
    <mesh position={[0, 0.095, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[monster.radius + 0.24, monster.radius + 0.31, 30]} />
      <meshBasicMaterial color={selected ? '#ffe4a0' : '#ee8877'} transparent opacity={selected ? 0.85 : 0.26} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  </group>;
}

function Herb({ patch, onGather }: { patch: HerbState; onGather: (id: string) => void }) {
  const plant = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (plant.current) {
    plant.current.rotation.y = Math.sin(clock.elapsedTime * 1.5 + patch.position.x) * 0.12;
    plant.current.visible = patch.availableAt <= Date.now();
  } });
  const upper = patch.id.startsWith('asc-');
  return <group position={[patch.position.x, 0, patch.position.z]} onClick={(event) => { event.stopPropagation(); onGather(patch.id); }}
    onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
    <group ref={plant}>
      {[-1, 0, 1].map((i) => <mesh key={i} position={[i * 0.26, 0.47, 0]} rotation={[0, 0, i * 0.38]}>
        <coneGeometry args={[0.31, 0.92, 6]} /><meshStandardMaterial color={upper ? '#a5d9d1' : '#62ae8a'} emissive={upper ? '#729ec1' : '#28765d'} emissiveIntensity={0.5} side={THREE.DoubleSide} />
      </mesh>)}
      <mesh position={[0, 0.8, 0]}><octahedronGeometry args={[0.18, 0]} /><meshStandardMaterial color={upper ? '#d5caff' : '#b3ffbd'} emissive={upper ? '#af9ae3' : '#57cd81'} emissiveIntensity={1.5} /></mesh>
      <BillboardLabel text={upper ? 'TIÊN THẢO · HÁI ×2' : 'LINH THẢO · HÁI'} position={[0, 1.58, 0]} width={upper ? 3.5 : 2.8} color={upper ? '#d9dcff' : '#abedbd'} />
    </group>
    <mesh position={[0, 0.095, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.64, 0.69, 20]} /><meshBasicMaterial color="#77e2a8" transparent opacity={0.38} side={THREE.DoubleSide} />
    </mesh>
  </group>;
}

function HuntingGround({ x, z, radius, color, name }: { x: number; z: number; radius: number; color: string; name: string }) {
  return <group position={[x, 0, z]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.094, 0]}>
      <circleGeometry args={[radius, 48]} /><meshBasicMaterial color={color} transparent opacity={0.14} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.10, 0]}>
      <ringGeometry args={[radius - 0.1, radius, 48]} /><meshBasicMaterial color={color} transparent opacity={0.58} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
    <group position={[0, 0, radius + 1]}>
      <mesh castShadow position={[0, 1.15, 0]}><cylinderGeometry args={[0.16, 0.27, 2.3, 7]} /><meshStandardMaterial color="#484a4d" /></mesh>
      <mesh position={[0, 2.32, 0]}><octahedronGeometry args={[0.3, 0]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.25} /></mesh>
      <BillboardLabel text={name} position={[0, 3.25, 0]} color={color} width={4.5} />
    </group>
  </group>;
}

function AscendantGround() {
  return <>
    <mesh receiveShadow position={[0, 0.079, -19]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[85, 57]} /><meshStandardMaterial color="#8caaa2" roughness={0.84} />
    </mesh>
    {Array.from({ length: 22 }, (_, i) => <mesh key={i} receiveShadow
      position={[Math.sin(i * 1.2) * 0.6, 0.11, 23.5 - i * 2.4]} rotation={[0, i * 0.51, 0]}>
      <boxGeometry args={[2.4 + i % 3 * 0.28, 0.055, 1.5]} /><meshStandardMaterial color="#d3d6bf" roughness={0.94} />
    </mesh>)}
    <HuntingGround x={-13} z={-15} radius={9} color="#a4f4df" name="LINH LỘC · CẤP 9–10" />
    <HuntingGround x={16} z={-28} radius={10} color="#cebaff" name="THIÊN ẢNH · CẤP 12" />
    {Array.from({ length: 38 }, (_, i) => {
      const angle = i * 2.39996, r = 17 + i % 5 * 5.3;
      return <group key={i} position={[Math.sin(angle) * r, 0, Math.cos(angle) * r - 4]}>
        <mesh castShadow position={[0, 0.8, 0]} rotation={[0.1 * i, angle, 0.13]}>
          <dodecahedronGeometry args={[0.55 + i % 3 * 0.22, 0]} />
          <meshStandardMaterial color={i % 3 ? '#bdc9c1' : '#a4b6ba'} roughness={0.72} metalness={0.12} flatShading />
        </mesh>
        {i % 3 === 0 && <mesh position={[0, 1.5, 0]}><octahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial color="#d7c2f6" emissive="#9b76db" emissiveIntensity={1.3} metalness={0.4} /></mesh>}
      </group>;
    })}
    {Array.from({ length: 15 }, (_, i) => {
      // Leave the arrival pad clear; the original first tree stood directly
      // between the camera and the avatar on entering the new world.
      const angle = i === 0 ? -0.45 : i * 2.39996, r = 28 + i % 4 * 3.8;
      return <group key={i} position={[Math.sin(angle) * r, 0, Math.cos(angle) * r]}>
        <mesh castShadow position={[0, 1.6, 0]}><cylinderGeometry args={[0.14, 0.32, 3.2, 8]} />
          <meshStandardMaterial color="#a4a7a5" roughness={0.93} /></mesh>
        {[0, 0.8, 1.4].map((height, k) => <mesh key={k} castShadow position={[0, 2.8 + height, 0]} scale={1.1 - k * 0.15}>
          <icosahedronGeometry args={[1.0, 1]} /><meshStandardMaterial color={i % 2 ? '#aed1c9' : '#afc9dc'} roughness={0.9} flatShading /></mesh>)}
      </group>;
    })}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.7, 0]}>
      <circleGeometry args={[39, 64]} /><meshBasicMaterial color="#a9e6e0" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} /></mesh>
    <pointLight color="#c6f1f4" intensity={5} distance={31} position={[3, 10, -19]} />
  </>;
}

export function Wilderness({ zone, monsters, herbs, playerPosition, selectedTarget, onSelect, onGather, onTravel }: {
  zone: 'wilderness' | 'ascendant';
  monsters: MonsterState[]; herbs: HerbState[]; playerPosition: Vector3; selectedTarget: string | null;
  onSelect: (id: string) => void; onGather: (id: string) => void; onTravel: () => void;
}) {
  return <>
    {zone === 'ascendant' ? <AscendantGround /> : <>
    {/* A separate instance from the sect: landing pad, path and distinct hunting clearings. */}
    <mesh receiveShadow position={[0, 0.082, -22]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[84, 48]} /><meshStandardMaterial color="#454e4f" roughness={1} />
    </mesh>
    <mesh receiveShadow position={[0, 0.086, 29]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[18, 20]} /><meshStandardMaterial color="#777a75" roughness={0.96} />
    </mesh>
    {Array.from({ length: 22 }, (_, i) => <mesh key={`path-${i}`} receiveShadow
      position={[Math.sin(i * 2.2) * 0.34, 0.105, 23.5 - i * 2.37]} rotation={[0, i * 0.33, 0]}>
      <boxGeometry args={[2.5 + i % 3 * 0.2, 0.055, 1.45]} />
      <meshStandardMaterial color={i % 3 ? '#84817d' : '#9b8d7f'} roughness={1} />
    </mesh>)}
    <HuntingGround x={0} z={-9} radius={12} color="#b6d5cd" name="BÃI LINH LANG · CẤP 1–2" />
    <HuntingGround x={-23} z={-25} radius={8} color="#e6b292" name="THIẾT GIÁP TRƯ · CẤP 3" />
    <HuntingGround x={23} z={-25} radius={8} color="#bda6e8" name="U ẢNH · CẤP 5" />
    <HuntingGround x={0} z={-33} radius={7} color="#dcab9c" name="LONG VỰC · CỔ LONG" />
    {Array.from({ length: 30 }, (_, i) => {
      const angle = i * 2.3999;
      const distance = 17 + i % 5 * 5;
      return <mesh key={i} castShadow position={[Math.sin(angle) * distance, 0.34, Math.cos(angle) * distance - 5]}
        rotation={[0.16 * i, i * 1.31, 0]}>
        <dodecahedronGeometry args={[0.46 + i % 3 * 0.21, 0]} />
        <meshStandardMaterial color={i % 3 ? '#656b70' : '#858280'} roughness={1} flatShading />
      </mesh>;
    })}
    {[-1, 1].map((side) => Array.from({ length: 5 }, (_, i) => <group key={`${side}-${i}`}
      position={[side * (32 + i * 1.2), 0, 18 - i * 10]}>
      <mesh castShadow position={[0, 1.1, 0]} rotation={[0, i, 0]}>
        <coneGeometry args={[0.56, 2.2 + i % 2, 5]} /><meshStandardMaterial color="#4c5665" roughness={0.75} flatShading /></mesh>
      <mesh position={[0, 2.1 + i % 2, 0]}><octahedronGeometry args={[0.19, 0]} />
        <meshStandardMaterial color="#ab92c4" emissive="#7554aa" emissiveIntensity={1} /></mesh>
    </group>))}
    </>}
    <PortalGate zone={zone} playerPosition={playerPosition} onTravel={onTravel} />
    {monsters.map((monster) => <Monster key={monster.id} monster={monster} selected={selectedTarget === monster.id} onSelect={onSelect} />)}
    {herbs.map((patch) => <Herb key={patch.id} patch={patch} onGather={onGather} />)}
  </>;
}

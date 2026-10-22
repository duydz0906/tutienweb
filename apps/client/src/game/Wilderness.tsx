import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HABITATS, WORLD_RADIUS, type HerbState, type MonsterState, type Vector3 } from '@van-thuong/shared';
import { BillboardLabel } from './Billboard';
import { HabitatGround } from './HabitatDecor';
import { PortalGate } from './PortalGate';
import { buildMonsterModel } from './sculpt/beasts';
import { clonePrototype } from './sculpt/cache';
import { animateCreature, creatureKindTraits } from './creatures';

function Monster({ monster, selected, onSelect }: { monster: MonsterState; selected: boolean; onSelect: (id: string) => void }) {
  const group = useRef<THREE.Group>(null);
  const health = useRef<THREE.Group>(null);
  const alive = monster.hp > 0;
  const isWolf = monster.kind === 'wolf';
  const isBoar = monster.kind === 'boar';
  const isStag = monster.kind === 'spirit_stag';
  const isGhost = monster.kind === 'shade' || monster.kind === 'sky_wraith';
  const isSerpent = monster.kind === 'forest_serpent' || monster.kind === 'void_serpent';
  const isStone = monster.kind === 'stone_golem' || monster.kind === 'star_guardian';
  const isCrane = monster.kind === 'cloud_crane' || monster.kind === 'thunder_bird';
  const color = isWolf ? '#737e8b' : isBoar ? '#7a6665' : isStag ? '#c1c6c0' : isSerpent ? monster.kind === 'void_serpent' ? '#5d518c' : '#52836a'
    : isStone ? monster.kind === 'star_guardian' ? '#9aa2bb' : '#888375' : isCrane ? monster.kind === 'thunder_bird' ? '#c9dcf2' : '#dbe9e1' : monster.kind === 'sky_wraith' ? '#85aac1' : '#584773';
  const glow = isWolf ? '#bbdff0' : isBoar ? '#e1a888' : isStag ? '#b8f7dc' : isSerpent ? '#95ffdc'
    : isStone ? '#ffe4b2' : isCrane ? monster.kind === 'thunder_bird' ? '#b9e2ff' : '#d7f4ff' : monster.kind === 'sky_wraith' ? '#a3e7f8' : '#c28bff';
  // One sculpted prototype per kind+palette, cloned per spawn: shared geometry, own transform.
  const beast = useMemo(() => {
    const key = `monster:${monster.kind}:${color}:${glow}`;
    return clonePrototype(key, () => buildMonsterModel(monster.kind, { color, glow, quality: 0.55 }));
  }, [monster.kind, color, glow]);
  const barHeight = isCrane ? 2.9 : isStone ? 3.5 : isGhost ? 2.9 : isSerpent ? 2.6 : isStag ? 2.35 : 1.95;
  // The server only moves a monster a few times a second; keep a smoothed speed so the gait matches.
  const motion = useRef({ x: monster.position.x, z: monster.position.z, speed: 0.15 });
  useFrame(({ clock, camera }, delta) => {
    if (group.current) group.current.position.y = Math.sin(clock.elapsedTime * 2.2 + monster.position.x) * 0.06;
    if (health.current) health.current.quaternion.copy(camera.quaternion);
    const moved = Math.hypot(monster.position.x - motion.current.x, monster.position.z - motion.current.z);
    motion.current.x = monster.position.x;
    motion.current.z = monster.position.z;
    const wanted = moved > 0.004 ? 1 : 0.15;
    motion.current.speed += (wanted - motion.current.speed) * Math.min(1, delta * 4);
    const traits = creatureKindTraits(monster.kind);
    animateCreature(beast, { time: clock.elapsedTime, moving: motion.current.speed, ...traits,
      // A serpent's whole body weaves; a bird riding the wind beats slowly.
      tempo: traits.flying ? 0.8 : 1 });
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
      <primitive object={beast} />
    </group>
    <group ref={health} position={[0, barHeight, 0]}>
      <mesh position={[0, 0, 0]}><planeGeometry args={[1.5, 0.14]} /><meshBasicMaterial color="#142328" side={THREE.DoubleSide} depthTest={false} /></mesh>
      <mesh position={[-(1 - monster.hp / monster.maxHp) * 0.72, 0, 0.008]} scale={[Math.max(0.001, monster.hp / monster.maxHp), 1, 1]}>
        <planeGeometry args={[1.44, 0.095]} /><meshBasicMaterial color={glow} side={THREE.DoubleSide} depthTest={false} /></mesh>
    </group>
    <BillboardLabel text={`LV.${monster.level} ${monster.name}`} position={[0, barHeight + 0.45, 0]} width={3.3} color={selected ? '#fff2ae' : glow} />
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
        <coneGeometry args={[0.31, 0.92, 16]} /><meshStandardMaterial color={upper ? '#a5d9d1' : '#62ae8a'} emissive={upper ? '#729ec1' : '#28765d'} emissiveIntensity={0.5} side={THREE.DoubleSide} />
      </mesh>)}
      <mesh position={[0, 0.8, 0]}><octahedronGeometry args={[0.18, 0]} /><meshStandardMaterial color={upper ? '#d5caff' : '#b3ffbd'} emissive={upper ? '#af9ae3' : '#57cd81'} emissiveIntensity={1.5} /></mesh>
      <BillboardLabel text={upper ? 'TIÊN THẢO · HÁI ×2' : 'LINH THẢO · HÁI'} position={[0, 1.58, 0]} width={upper ? 3.5 : 2.8} color={upper ? '#d9dcff' : '#abedbd'} />
    </group>
    <mesh position={[0, 0.095, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.64, 0.69, 20]} /><meshBasicMaterial color="#77e2a8" transparent opacity={0.38} side={THREE.DoubleSide} />
    </mesh>
  </group>;
}


function AscendantGround() {
  return <>
    <mesh receiveShadow position={[0, 0.079, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[WORLD_RADIUS - 0.3, 192]} /><meshStandardMaterial color="#8caaa2" roughness={0.84} side={THREE.DoubleSide} />
    </mesh>
    {Array.from({ length: 37 }, (_, i) => <mesh key={i} receiveShadow
      position={[Math.sin(i * 1.2) * 0.6, 0.11, 27 - i * 2.5]} rotation={[0, i * 0.51, 0]}>
      <boxGeometry args={[2.4 + i % 3 * 0.28, 0.055, 1.5]} /><meshStandardMaterial color="#d3d6bf" roughness={0.94} />
    </mesh>)}
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
        <mesh castShadow position={[0, 1.6, 0]}><cylinderGeometry args={[0.14, 0.32, 3.2, 16]} />
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

/**
 * How far away a monster is still worth drawing. The expanded maps hold 36 hunting grounds (144
 * creatures); the old version built an avatar for every one of them every frame, which is a lot of
 * geometry nobody can see through the haze.
 */
const MONSTER_VIEW = 150;

export function Wilderness({ zone, monsters, herbs, playerPosition, selectedTarget, onSelect, onGather, onTravel }: {
  zone: 'wilderness' | 'ascendant';
  monsters: MonsterState[]; herbs: HerbState[]; playerPosition: Vector3; selectedTarget: string | null;
  onSelect: (id: string) => void; onGather: (id: string) => void; onTravel: () => void;
}) {
  const nearMonsters = monsters.filter((monster) => monster.id === selectedTarget ||
    Math.hypot(monster.position.x - playerPosition.x, monster.position.z - playerPosition.z) <= MONSTER_VIEW);
  return <>
    {zone === 'ascendant' ? <AscendantGround /> : <>
    {/* A separate instance from the sect: landing pad, path and distinct hunting clearings. */}
    <mesh receiveShadow position={[0, 0.082, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[WORLD_RADIUS - 0.3, 192]} /><meshStandardMaterial color="#454e4f" roughness={1} side={THREE.DoubleSide} />
    </mesh>
    <mesh receiveShadow position={[0, 0.086, 29]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[18, 20]} /><meshStandardMaterial color="#777a75" roughness={0.96} />
    </mesh>
    {Array.from({ length: 36 }, (_, i) => <mesh key={`path-${i}`} receiveShadow
      position={[Math.sin(i * 2.2) * 0.34, 0.105, 26 - i * 2.45]} rotation={[0, i * 0.33, 0]}>
      <boxGeometry args={[2.5 + i % 3 * 0.2, 0.055, 1.45]} />
      <meshStandardMaterial color={i % 3 ? '#84817d' : '#9b8d7f'} roughness={1} />
    </mesh>)}
    <group position={[0, 0, -54]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.11, 0]}>
        <ringGeometry args={[6, 6.15, 50]} /><meshBasicMaterial color="#e39b81" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>
      {[0, 1, 2, 3].map((i) => <mesh key={i} castShadow position={[Math.sin(i * Math.PI / 2) * 8, 1.35, Math.cos(i * Math.PI / 2) * 8]}>
        <cylinderGeometry args={[0.35, 0.55, 2.7, 16]} /><meshStandardMaterial color="#664e4b" emissive="#542325" emissiveIntensity={0.3} roughness={0.86} />
      </mesh>)}
      <BillboardLabel text="LONG VỰC · CỔ LONG" position={[0, 3.6, 6]} color="#ffd2a1" width={4.5} />
    </group>
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
        <coneGeometry args={[0.56, 2.2 + i % 2, 16]} /><meshStandardMaterial color="#4c5665" roughness={0.75} flatShading /></mesh>
      <mesh position={[0, 2.1 + i % 2, 0]}><octahedronGeometry args={[0.19, 0]} />
        <meshStandardMaterial color="#ab92c4" emissive="#7554aa" emissiveIntensity={1} /></mesh>
    </group>))}
    </>}
    {HABITATS.filter((habitat) => habitat.scene === zone).map((habitat) => <HabitatGround key={habitat.id} habitat={habitat} />)}
    <PortalGate zone={zone} playerPosition={playerPosition} onTravel={onTravel} />
    {nearMonsters.map((monster) => <Monster key={monster.id} monster={monster} selected={selectedTarget === monster.id} onSelect={onSelect} />)}
    {herbs.map((patch) => <Herb key={patch.id} patch={patch} onGather={onGather} />)}
  </>;
}

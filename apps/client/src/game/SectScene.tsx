import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DEFAULT_APPEARANCE, NPCS, type Appearance, type Gender, type NpcId, type PublicPlayer, type Vector3 } from '@van-thuong/shared';
import { Avatar } from './Avatar';
import { BillboardLabel } from './Billboard';

const roles: { id: NpcId; gender: Gender; appearance: Partial<Appearance>; glow: string }[] = [
  { id: 'master', gender: 'nam', appearance: { hair: 'long', hairColor: 'silver', robeColor: 'ivory', face: 'angular', height: 0.8 }, glow: '#ffe2a0' },
  { id: 'quest', gender: 'nu', appearance: { hair: 'bun', hairColor: 'ink', robeColor: 'jade', face: 'heart', height: 0.55 }, glow: '#9ef0cc' },
  { id: 'shop', gender: 'nam', appearance: { hair: 'tied', hairColor: 'ash', robeColor: 'lilac', face: 'round', build: 0.65 }, glow: '#c9c4ff' },
];

/** NPCs and disciples use the same fitted HumanForge body, hair, clothes and facial morphs as players. */
function person(id: string, name: string, gender: Gender, appearance: Partial<Appearance>, position: Vector3): PublicPlayer {
  return {
    id, name, gender, appearance: { ...DEFAULT_APPEARANCE, ...appearance }, position, rotation: Math.PI,
    hp: 100, maxHp: 100, realm: 1, minorStage: 1, path: null,
    root: { tier: 'chan', elements: ['moc'], multiplier: 1 },
    equipment: { robe: 'novice_robe' }, isAdmin: false, devMode: false,
  };
}

function SectNpc({ id, gender, appearance, glow, onInteract }: typeof roles[number] & { onInteract: (id: NpcId) => void }) {
  const p = NPCS[id].position;
  const actor = useMemo(() => person(`sect-npc-${id}`, NPCS[id].name, gender, appearance, p), [id, gender]);
  return <group onClick={(event) => { event.stopPropagation(); onInteract(id); }}
    onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
    onPointerOut={() => { document.body.style.cursor = ''; }}>
    <Avatar player={actor} local />
    <mesh position={[p.x, 0.095, p.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.76, 0.82, 42]} /><meshBasicMaterial color={glow} transparent opacity={0.65} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
    <BillboardLabel text={NPCS[id].name} color={glow} position={[p.x, 2.55, p.z]} width={3.6} />
    <BillboardLabel text={id === 'master' ? 'CHÍNH ĐIỆN' : id === 'quest' ? 'NHIỆM VỤ CÁC' : 'TÀNG BẢO CÁC'}
      color="#f5e6bf" position={[p.x, 2.16, p.z]} width={2.4} />
  </group>;
}

/** Deterministic AI waypoints are visual only; followers can't alter server-owned movement or combat. */
function Disciple({ index }: { index: number }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Group>(null);
  const meditate = index >= 2;
  const actor = useMemo(() => person(`sect-disciple-${index}`, 'Đệ tử Vân Thượng', index % 2 ? 'nu' : 'nam', {
    hair: index % 2 ? 'braid' : 'short', hairColor: index === 3 ? 'chestnut' : 'ink',
    robeColor: index % 2 ? 'jade' : 'ivory', height: 0.35 + index * 0.08,
  }, { x: 0, y: 0, z: 0 }), [index]);
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    if (!group.current) return;
    if (meditate) {
      group.current.position.set(index === 2 ? -5.4 : 5.4, 0.04 + Math.sin(t * 1.15 + index) * 0.03, 20);
      if (ring.current) ring.current.rotation.y += delta * 0.75;
    } else {
      const segment = Math.floor((t + index * 4.7) / 6);
      const blend = ((t + index * 4.7) / 6) % 1;
      const waypoint = (n: number) => ({ x: Math.sin((n * 17 + index * 5) * 2.4) * 5.5,
        z: 7 + Math.cos((n * 11 + index * 7) * 1.7) * 7.5 });
      const from = waypoint(segment), to = waypoint(segment + 1);
      group.current.position.set(THREE.MathUtils.lerp(from.x, to.x, blend), 0, THREE.MathUtils.lerp(from.z, to.z, blend));
      group.current.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    }
  });
  return <group ref={group} scale={0.89}>
    <Avatar player={actor} local wandering={!meditate} meditating={meditate} />
    {meditate && <group ref={ring} position={[0, 0.07, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1, 1.07, 32]} />
        <meshBasicMaterial color="#9be9ce" transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.27, 1.3, 32]} />
        <meshBasicMaterial color="#d9cc99" transparent opacity={0.38} side={THREE.DoubleSide} depthWrite={false} /></mesh>
    </group>}
  </group>;
}

export function SectScene({ onInteract }: { onInteract: (id: NpcId) => void }) {
  return <>
    {/* Safe courtyard: world and combat rules share the same authored boundary. */}
    <mesh position={[0, 0.082, 21]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[40, 38]} /><meshBasicMaterial color="#b1cfb9" transparent opacity={0.085} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
    {[-1, 1].map((sign) => <group key={sign} position={[sign * 6.3, 0, 2]}>
      <mesh castShadow position={[0, 2.15, 0]}><cylinderGeometry args={[0.31, 0.43, 4.3, 8]} /><meshStandardMaterial color="#b6aa89" /></mesh>
      <mesh position={[0, 4.42, 0]}><octahedronGeometry args={[0.37, 0]} /><meshStandardMaterial color="#eed49c" emissive="#b5914d" emissiveIntensity={0.8} /></mesh>
    </group>)}
    <mesh position={[0, 4.34, 2]} castShadow><boxGeometry args={[13.2, 0.5, 0.6]} /><meshStandardMaterial color="#5d554a" roughness={0.7} /></mesh>
    <BillboardLabel text="TÔNG MÔN · KHU AN TOÀN" position={[0, 4.98, 2]} color="#f3d89f" width={5.3} />
    {roles.map((role) => <SectNpc key={role.id} {...role} onInteract={onInteract} />)}
    {Array.from({ length: 4 }, (_, i) => <Disciple key={i} index={i} />)}
  </>;
}

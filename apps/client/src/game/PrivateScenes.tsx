import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ASCENDANT_GATE, HOME_CHEST, HOME_EXIT, REBIRTH_ALTAR, SANCTUM_EXIT,
  type Vector3 } from '@van-thuong/shared';
import { BillboardLabel } from './Billboard';
import { Rounded } from './models';

function NearRing({ position, active, color }: { position: Vector3; active: boolean; color: string }) {
  return <mesh position={[position.x, 0.135, position.z]} rotation={[-Math.PI / 2, 0, 0]}>
    <ringGeometry args={[0.85, 0.95, 40]} /><meshBasicMaterial color={color} transparent opacity={active ? 0.96 : 0.34} side={THREE.DoubleSide} depthWrite={false} />
  </mesh>;
}

function ExitDoor({ position, onExit, near, dark = false }: { position: Vector3; onExit: () => void; near: boolean; dark?: boolean }) {
  return <group position={[position.x, 0, position.z]} onClick={(event) => { event.stopPropagation(); onExit(); }}>
    <mesh receiveShadow position={[0, 0.12, 0]}><boxGeometry args={[3.4, 0.18, 2.2]} />
      <meshStandardMaterial color={dark ? '#55496b' : '#b7ab8e'} roughness={0.88} /></mesh>
    <mesh position={[0, 1.45, 0.95]}><boxGeometry args={[2.6, 2.85, 0.12]} />
      <meshStandardMaterial color={dark ? '#40384e' : '#5e4b3b'} roughness={0.72} /></mesh>
    <mesh position={[0, 1.5, 0.86]}><torusGeometry args={[0.66, 0.09, 8, 28]} />
      <meshStandardMaterial color={dark ? '#ba9add' : '#d4bd81'} metalness={0.55} roughness={0.33} emissive={dark ? '#44316d' : '#504228'} /></mesh>
    {/* When standing at the exit the HUD already shows E; a nearby world-space label
        would become enormous and hide the avatar from the chase camera. */}
    {!near && <BillboardLabel text="TRỞ VỀ TÔNG MÔN · E" position={[0, 3.45, 0]} width={4.4} color="#ffe1ad" />}
    <NearRing position={{ x: 0, y: 0, z: 0 }} active={near} color="#e4bd78" />
  </group>;
}

function Room({ children, dark = false, level = 1 }: { children: React.ReactNode; dark?: boolean; level?: number }) {
  const floor = dark ? '#333448' : level > 8 ? '#aca390' : level > 4 ? '#a39c87' : '#918e7f';
  const wall = dark ? '#393448' : level > 7 ? '#b8b3a1' : '#9d9f8d';
  return <>
    <mesh receiveShadow position={[0, -0.17, 0]}><boxGeometry args={[17.2, 0.32, 17.2]} />
      <meshStandardMaterial color={floor} roughness={0.87} /></mesh>
    {Array.from({ length: 7 }, (_, i) => <mesh key={i} receiveShadow position={[-6.8 + i * 2.25, 0.018, 0]}>
      <boxGeometry args={[0.08, 0.017, 16.5]} /><meshStandardMaterial color={dark ? '#6c5984' : '#c2ae83'} roughness={0.83} />
    </mesh>)}
    <mesh receiveShadow position={[0, 2.75, -8.55]}><boxGeometry args={[17.2, 5.5, 0.42]} />
      <meshStandardMaterial color={wall} roughness={0.9} /></mesh>
    {[-1, 1].map((side) => <group key={side}>
      <mesh receiveShadow position={[side * 8.55, 2.75, 0]}><boxGeometry args={[0.42, 5.5, 17.2]} />
        <meshStandardMaterial color={wall} roughness={0.9} /></mesh>
      {[-7.7, 7.7].map((z) => <mesh key={z} castShadow position={[side * 7.8, 2.9, z]}>
        <cylinderGeometry args={[0.24, 0.33, 5.8, 16]} /><meshStandardMaterial color={dark ? '#60466f' : '#6e5643'} roughness={0.82} />
      </mesh>)}
      <mesh position={[side * 8.3, 4.98, 0]}><boxGeometry args={[0.17, 0.13, 17.2]} />
        <meshStandardMaterial color={dark ? '#b495da' : '#dbc18c'} metalness={0.34} roughness={0.49} /></mesh>
    </group>)}
    {children}
  </>;
}

function Chest({ position, onOpen, near, level }: { position: Vector3; onOpen: () => void; near: boolean; level: number }) {
  const material = level > 7 ? '#b38c59' : level > 3 ? '#816549' : '#5c4b3c';
  return <group position={[position.x, 0, position.z]} onClick={(event) => { event.stopPropagation(); onOpen(); }}
    onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
    onPointerOut={() => { document.body.style.cursor = ''; }}>
    <Rounded castShadow position={[0, 0.52, 0]} size={[1.9, 0.95, 1.2]} radius={0.12} smooth={4}>
      <meshStandardMaterial color={material} roughness={0.74} metalness={0.13} /></Rounded>
    <Rounded castShadow position={[0, 1.08, -0.04]} size={[2.05, 0.3, 1.35]} radius={0.14} smooth={4}>
      <meshStandardMaterial color={material} roughness={0.68} /></Rounded>
    {[-0.76, 0.76].map((x) => <Rounded key={x} position={[x, 0.6, 0.61]} size={[0.11, 0.92, 0.09]} radius={0.035}>
      <meshStandardMaterial color="#dfc486" metalness={0.72} roughness={0.35} /></Rounded>)}
    <Rounded position={[0, 0.66, 0.63]} size={[0.27, 0.35, 0.12]} radius={0.05}>
      <meshStandardMaterial color="#e6d4a2" emissive="#ad8648" emissiveIntensity={near ? 0.75 : 0.32} /></Rounded>
    {!near && <BillboardLabel text="RƯƠNG CÁ NHÂN · E" position={[0, 2.58, 0]} width={4.2} color="#fce3ab" />}
    <NearRing position={{ x: 0, y: 0, z: 0 }} active={near} color="#d9bc81" />
  </group>;
}

export function ResidenceInterior({ name, level, playerPosition, onOpenStorage, onExit }: {
  name: string; level: number; playerPosition: Vector3; onOpenStorage: () => void; onExit: () => void;
}) {
  const near = (v: Vector3) => Math.hypot(playerPosition.x - v.x, playerPosition.z - v.z);
  return <Room level={level}>
    <mesh position={[0, 0.06, -1.2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[8.6, 8.5]} /><meshStandardMaterial color={level > 6 ? '#5b807b' : '#6c8879'} roughness={0.91} side={THREE.DoubleSide} /></mesh>
    <mesh position={[0, 0.075, -1.2]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[2.2, 2.25, 48]} /><meshBasicMaterial color="#d1c58f" transparent opacity={0.55} side={THREE.DoubleSide} /></mesh>
    <BillboardLabel text={`${name.toUpperCase()} · NHÀ CẤP ${level}`} position={[0, 4.45, -7.8]} width={6.6} color="#ffe7af" />
    <Chest position={HOME_CHEST.position} onOpen={onOpenStorage} near={near(HOME_CHEST.position) <= HOME_CHEST.radius} level={level} />
    <ExitDoor position={HOME_EXIT.position} onExit={onExit} near={near(HOME_EXIT.position) <= HOME_EXIT.radius} />
    <group position={[-5.5, 0, -4.3]}>
      <Rounded castShadow position={[0, 0.62, 0]} size={[3.1, 0.75, 4.3]} radius={0.12}>
        <meshStandardMaterial color="#6e5748" roughness={0.86} /></Rounded>
      <Rounded position={[0, 1.03, 0]} size={[2.9, 0.2, 3.9]} radius={0.1}>
        <meshStandardMaterial color={level > 5 ? '#a6c1ba' : '#e2c9ac'} roughness={0.91} /></Rounded>
      <Rounded position={[0, 1.16, -1.3]} size={[2.7, 0.26, 0.68]} radius={0.11}>
        <meshStandardMaterial color="#e8dcbe" roughness={0.93} /></Rounded>
    </group>
    {[-1, 1].map((sign) => <group key={sign} position={[sign * 6.4, 0, 1.4]}>
      <mesh castShadow position={[0, 1.2, 0]}><boxGeometry args={[1.5, 2.35, 3.6]} />
        <meshStandardMaterial color="#665244" roughness={0.79} /></mesh>
      {[0.55, 1.25, 1.94].map((y) => <mesh key={y} position={[0, y, 0]}><boxGeometry args={[1.62, 0.08, 3.55]} />
        <meshStandardMaterial color="#c2a879" roughness={0.76} /></mesh>)}
    </group>)}
    {level > 3 && [-1, 1].map((sign) => <group key={sign} position={[sign * 4.7, 0, -7.2]}>
      <mesh castShadow position={[0, 1.7, 0]}><cylinderGeometry args={[0.1, 0.19, 3.4, 16]} /><meshStandardMaterial color="#b69b66" /></mesh>
      <mesh position={[0, 3.4, 0]}><icosahedronGeometry args={[0.39, 1]} />
        <meshStandardMaterial color={level > 8 ? '#e7d6a1' : '#8bd0b1'} emissive="#6aab93" emissiveIntensity={1.1} metalness={0.44} /></mesh>
    </group>)}
    <pointLight color="#f5d69e" intensity={8} distance={17} position={[0, 5.2, -1]} />
  </Room>;
}

function RebirthAltar({ onOpen, active }: { onOpen: () => void; active: boolean }) {
  const crown = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (crown.current) crown.current.rotation.y += dt * 0.42; });
  return <group position={[REBIRTH_ALTAR.position.x, 0, REBIRTH_ALTAR.position.z]}
    onClick={(event) => { event.stopPropagation(); onOpen(); }}
    onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
    onPointerOut={() => { document.body.style.cursor = ''; }}>
    <mesh castShadow position={[0, 0.22, 0]}><cylinderGeometry args={[1.55, 1.7, 0.45, 16]} />
      <meshStandardMaterial color="#594b63" metalness={0.38} roughness={0.6} /></mesh>
    <mesh position={[0, 0.48, 0]}><cylinderGeometry args={[1.35, 1.42, 0.1, 16]} />
      <meshStandardMaterial color="#bd9dda" emissive="#72539d" emissiveIntensity={0.6} metalness={0.58} /></mesh>
    <group ref={crown} position={[0, 2.1, 0]}>
      <mesh castShadow><icosahedronGeometry args={[0.72, 1]} />
        <meshPhysicalMaterial color="#c7a6ec" emissive="#8c65d2" emissiveIntensity={active ? 1.1 : 0.7} metalness={0.48} roughness={0.2} /></mesh>
      <mesh rotation={[Math.PI / 2.4, 0, 0]}><torusGeometry args={[1.07, 0.027, 6, 44]} />
        <meshBasicMaterial color="#d7baff" /></mesh>
    </group>
    {!active && <BillboardLabel text="TÁI SINH ĐÀI" position={[0, 3.9, 0]} width={3.7} color="#e8cdff" />}
    <NearRing position={{ x: 0, y: 0, z: 0 }} active={active} color="#cea4f8" />
    <pointLight color="#a880ee" intensity={7} distance={11} position={[0, 2.5, 0]} />
  </group>;
}

export function SanctumInterior({ playerPosition, reborn, onOpenRebirth, onAscend, onExit }: {
  playerPosition: Vector3; reborn: boolean; onOpenRebirth: () => void; onAscend: () => void; onExit: () => void;
}) {
  const near = (v: Vector3) => Math.hypot(playerPosition.x - v.x, playerPosition.z - v.z);
  return <Room dark>
    <mesh position={[0, 0.054, -2.6]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[6.6, 48]} /><meshStandardMaterial color="#4b435d" metalness={0.18} roughness={0.6} side={THREE.DoubleSide} /></mesh>
    <RebirthAltar onOpen={onOpenRebirth} active={!reborn && near(REBIRTH_ALTAR.position) <= REBIRTH_ALTAR.radius} />
    <group position={[ASCENDANT_GATE.position.x, 0, ASCENDANT_GATE.position.z]}
      onClick={(event) => { event.stopPropagation(); onAscend(); }}
      onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = ''; }}>
      <mesh position={[0, 1.85, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <torusGeometry args={[1.55, 0.18, 12, 50]} />
        <meshStandardMaterial color={reborn ? '#b5e9d5' : '#626274'} metalness={0.7} roughness={0.23}
          emissive={reborn ? '#50bbad' : '#343042'} emissiveIntensity={reborn ? 0.9 : 0.15} /></mesh>
      {reborn && <mesh position={[0, 1.85, 0]}><circleGeometry args={[1.5, 48]} />
        <meshBasicMaterial color="#7ee2d8" transparent opacity={0.26} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
      {!(reborn && near(ASCENDANT_GATE.position) <= ASCENDANT_GATE.radius) &&
        <BillboardLabel text={reborn ? 'CỔNG THƯỢNG GIỚI · E' : 'CHƯA THỨC TỈNH'} position={[0, 4.2, 0]}
          width={4.3} color={reborn ? '#c8ffee' : '#918d9f'} />}
      <NearRing position={{ x: 0, y: 0, z: 0 }} active={reborn && near(ASCENDANT_GATE.position) <= ASCENDANT_GATE.radius} color="#8ee8d9" />
    </group>
    <ExitDoor position={SANCTUM_EXIT.position} onExit={onExit} near={near(SANCTUM_EXIT.position) <= SANCTUM_EXIT.radius} dark />
    {Array.from({ length: 8 }, (_, i) => <mesh key={i} castShadow position={[-6.8 + (i % 4) * 4.55, 0.9, i < 4 ? -7.5 : 5.3]} rotation={[0, i * 0.56, 0]}>
      <octahedronGeometry args={[0.36 + (i % 3) * 0.11, 0]} />
      <meshStandardMaterial color="#a68abf" emissive="#614693" emissiveIntensity={0.8} metalness={0.53} roughness={0.28} />
    </mesh>)}
    <pointLight color="#d7adff" intensity={9} distance={19} position={[0, 5, -2]} />
  </Room>;
}

import { HOME_GATE, MAX_REALM, SECRET_GATE, type OwnCharacter, type Vector3 } from '@van-thuong/shared';
import * as THREE from 'three';
import { BillboardLabel } from './Billboard';

const near = (player: Vector3, position: Vector3, radius: number) =>
  Math.hypot(player.x - position.x, player.z - position.z) <= radius;

/** Each disciple sees their own room behind this shared lodge; the interior is server-instanced. */
export function SectWayfinding({ character, playerPosition, onEnterHome, onEnterSanctum }: {
  character: OwnCharacter; playerPosition: Vector3; onEnterHome: () => void; onEnterSanctum: () => void;
}) {
  const unlocked = character.rebirths > 0 || character.realm === MAX_REALM && character.minorStage === 9;
  const homeNear = near(playerPosition, HOME_GATE.position, HOME_GATE.radius);
  const secretNear = near(playerPosition, SECRET_GATE.position, SECRET_GATE.radius);
  return <>
    <group position={[HOME_GATE.position.x, 0, HOME_GATE.position.z]}
      onClick={(event) => { event.stopPropagation(); onEnterHome(); }}
      onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = ''; }}>
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.15, 1.3, 42]} /><meshBasicMaterial color="#e4c28b" transparent opacity={homeNear ? 0.88 : 0.48} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.48, 0]}><octahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color="#e4c58f" emissive="#b3925b" emissiveIntensity={0.88} metalness={0.6} /></mesh>
      <BillboardLabel text={`NHÀ ${character.name.toUpperCase()} · E`} position={[0, 2.7, 0]} width={5.7} color="#ffe2aa" />
    </group>
    {/* The mountain face opens only at Tiên Đế tầng 9 or after rebirth. */}
    <group position={[SECRET_GATE.position.x, 0, SECRET_GATE.position.z]}
      onClick={(event) => { event.stopPropagation(); if (unlocked) onEnterSanctum(); }}
      onPointerOver={(event) => { if (unlocked) { event.stopPropagation(); document.body.style.cursor = 'pointer'; } }}
      onPointerOut={() => { document.body.style.cursor = ''; }}>
      {[-1, 1].map((sign) => <mesh key={sign} castShadow position={[sign * 2.7, 2.15, 2.4]} rotation={[0.12, sign * 0.2, sign * 0.18]}>
        <dodecahedronGeometry args={[2.5, 0]} /><meshStandardMaterial color="#69766e" roughness={0.91} flatShading /></mesh>)}
      <mesh castShadow position={[0, 4, 2.7]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.9, 1.3, 5.5, 8]} /><meshStandardMaterial color="#7b8580" roughness={0.9} flatShading /></mesh>
      {unlocked && <>
        <mesh position={[0, 1.85, 2.3]}><planeGeometry args={[3.7, 3.5]} />
          <meshBasicMaterial color="#8a71bf" transparent opacity={0.29} side={THREE.DoubleSide} depthWrite={false} /></mesh>
        <mesh position={[0, 1.87, 2.25]}><torusGeometry args={[1.36, 0.12, 9, 42]} />
          <meshStandardMaterial color="#d1b4ee" emissive="#7550b5" emissiveIntensity={0.95} metalness={0.54} /></mesh>
        <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.25, 1.36, 42]} /><meshBasicMaterial color="#d8b9ff" transparent opacity={secretNear ? 0.95 : 0.39} side={THREE.DoubleSide} /></mesh>
        <BillboardLabel text="MẬT THẤT TÁI SINH · E" position={[0, 5.65, 2.3]} width={6} color="#efd5ff" />
      </>}
    </group>
  </>;
}

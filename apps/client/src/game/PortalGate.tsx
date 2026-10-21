import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PORTALS, type Vector3, type WorldZone } from '@van-thuong/shared';
import { BillboardLabel } from './Billboard';

/** Click the glowing passage (or use E/the HUD). This is visual only; the server checks distance. */
export function PortalGate({ zone, playerPosition, onTravel }: {
  zone: WorldZone; playerPosition: Vector3; onTravel: () => void;
}) {
  const gate = PORTALS[zone];
  const showLabel = Math.hypot(playerPosition.x - gate.position.x, playerPosition.z - gate.position.z) < 7;
  const halo = useRef<THREE.Group>(null);
  const core = useRef<THREE.MeshBasicMaterial>(null);
  const isHome = zone === 'overworld';
  const isVillage = zone === 'village';
  const glow = isHome ? '#9de8d4' : zone === 'ascendant' ? '#9eeaf1' : isVillage ? '#ffd9a0' : '#e1b7f4';
  useFrame(({ clock }, delta) => {
    if (halo.current) halo.current.rotation.z += delta * 0.22;
    if (core.current) core.current.opacity = 0.24 + Math.sin(clock.elapsedTime * 2.5) * 0.07;
  });
  return <group position={[gate.position.x, 0, gate.position.z]}
    onClick={(event) => { event.stopPropagation(); onTravel(); }}
    onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
    onPointerOut={() => { document.body.style.cursor = ''; }}>
    <mesh receiveShadow position={[0, 0.06, 0]}><cylinderGeometry args={[3.85, 4.05, 0.12, 48]} />
      <meshStandardMaterial color={isHome ? '#a2aaa1' : '#626579'} roughness={0.86} /></mesh>
    {[1.55, 2.4, 3.4].map((r) => <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.132, 0]}>
      <ringGeometry args={[r, r + 0.045, 64]} /><meshBasicMaterial color={glow} transparent opacity={r === 3.4 ? 0.32 : 0.68} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>)}
    {[-1, 1].map((sign) => <group key={sign} position={[sign * 2.67, 0, 0]}>
      <mesh castShadow position={[0, 2.15, 0]}><cylinderGeometry args={[0.35, 0.5, 4.3, 8]} />
        <meshStandardMaterial color={isHome ? '#5c6b63' : '#565668'} roughness={0.8} /></mesh>
      <mesh position={[0, 4.51, 0]}><octahedronGeometry args={[0.34, 0]} />
        <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={2} metalness={0.55} roughness={0.25} /></mesh>
    </group>)}
    <mesh castShadow position={[0, 4.46, 0]}><boxGeometry args={[5.6, 0.38, 0.55]} />
      <meshStandardMaterial color={isHome ? '#4a5d57' : '#535064'} metalness={0.35} roughness={0.5} /></mesh>
    <group position={[0, 2.15, 0]}>
      <mesh><torusGeometry args={[2.12, 0.17, 14, 64]} />
        <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.3} metalness={0.6} roughness={0.28} /></mesh>
      <group ref={halo}>
        <mesh><torusGeometry args={[1.78, 0.045, 8, 64]} />
          <meshBasicMaterial color="#fff3d2" transparent opacity={0.8} depthWrite={false} /></mesh>
        {Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[Math.sin(i * Math.PI / 4) * 1.76, Math.cos(i * Math.PI / 4) * 1.76, 0]}>
          <octahedronGeometry args={[0.13, 0]} /><meshBasicMaterial color={glow} /></mesh>)}
      </group>
      <mesh position={[0, 0, 0.02]}>
        <circleGeometry args={[1.93, 48]} />
        <meshBasicMaterial ref={core} color={glow} transparent opacity={0.25} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <pointLight color={glow} intensity={3.8} distance={11} decay={2} position={[0, 0, 0.5]} />
    </group>
    {showLabel && <BillboardLabel text={isHome ? 'HOANG VỰC · E' : zone === 'ascendant' ? 'QUY SƠN · E' : isVillage ? 'VỀ TÔNG MÔN · E' : 'HỒI TÔNG · E'}
      position={[0, 5.25, 0]} width={3.3} color={glow} />}
  </group>;
}

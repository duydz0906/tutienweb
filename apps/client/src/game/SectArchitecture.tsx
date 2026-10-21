import * as THREE from 'three';
import { SECT_BUILDINGS, type Vector3 } from '@van-thuong/shared';
import { BillboardLabel } from './Billboard';

type Room = (typeof SECT_BUILDINGS)[number];

/** Full-size, open-fronted sect halls. Roofs lift away locally so NPCs stay visible after entry. */
function SectHall({ room, playerPosition }: { room: Room; playerPosition: Vector3 }) {
  const { x, z, width, depth, doorway, height } = room;
  const main = room.id === 'master';
  const accent = main ? '#b79766' : room.id === 'quest' ? '#82bfb0' : '#d4a382';
  const front = -depth / 2;
  const wall = 0.42;
  const wing = (width - doorway) / 2;
  const inside = Math.abs(playerPosition.x - x) < width / 2 - 0.35 && Math.abs(playerPosition.z - z) < depth / 2 - 0.35;

  return <group position={[x, 0, z]}>
    {/* Stone steps run right through the wide, doorless entrance. */}
    <mesh receiveShadow position={[0, 0.02, 0]}><boxGeometry args={[width + 0.8, 0.13, depth + 0.7]} />
      <meshStandardMaterial color="#b1ad98" roughness={0.95} /></mesh>
    {Array.from({ length: 3 }, (_, i) => <mesh key={i} receiveShadow position={[0, 0.025 - i * 0.014, front - 0.65 - i * 0.62]}>
      <boxGeometry args={[doorway + 1.4 + i * 0.4, 0.095, 0.65]} /><meshStandardMaterial color={i % 2 ? '#bcb39b' : '#a9a894'} roughness={1} />
    </mesh>)}
    <mesh receiveShadow position={[0, 0.09, 0]}><boxGeometry args={[width - 0.8, 0.012, depth - 0.8]} />
      <meshStandardMaterial color="#817e70" roughness={0.94} /></mesh>
    <mesh receiveShadow position={[0, 0.105, 0]}><boxGeometry args={[width - 2, 0.006, depth - 2]} />
      <meshStandardMaterial color={main ? '#5a665d' : '#6b6e67'} roughness={1} /></mesh>
    <mesh position={[0, 0.111, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[2.05, 2.13, 48]} /><meshBasicMaterial color={accent} transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>

    {/* Exact front wall spans match the collision rectangles in sectGeometry.ts. The center is EMPTY. */}
    {[-1, 1].map((sign) => <group key={sign}>
      <mesh castShadow receiveShadow position={[sign * (doorway / 2 + wing / 2), height / 2, front]}>
        <boxGeometry args={[wing, height, wall]} /><meshStandardMaterial color="#cec6af" roughness={0.85} /></mesh>
      <mesh position={[sign * (doorway / 2 + wing / 2), height * 0.59, front - wall / 2 - 0.012]}>
        <boxGeometry args={[Math.min(wing - 1, 3.5), 1.36, 0.055]} />
        <meshStandardMaterial color="#ebe1c0" emissive="#beac7c" emissiveIntensity={0.28} roughness={0.78} /></mesh>
      {[-1, 1].map((offset) => <mesh key={offset} position={[sign * (doorway / 2 + wing / 2) + offset * (Math.min(wing - 1, 3.5) / 3), height * 0.59, front - wall / 2 - 0.054]}>
        <boxGeometry args={[0.10, 1.5, 0.06]} /><meshStandardMaterial color="#5c4b43" /></mesh>)}
      {/* Timber columns frame the usable door without placing a mesh in its opening. */}
      {[-width / 2 + 0.45, -doorway / 2 - 0.28].map((column, i) => <mesh key={i} castShadow position={[sign * Math.abs(column), height / 2, front - 0.16]}>
        <cylinderGeometry args={[0.23, 0.28, height, 10]} /><meshStandardMaterial color="#624b3d" roughness={0.8} /></mesh>)}
    </group>)}
    {[-1, 1].map((sign) => <mesh key={sign} castShadow receiveShadow position={[sign * width / 2, height / 2, 0]}>
      <boxGeometry args={[wall, height, depth]} /><meshStandardMaterial color="#c5baa2" roughness={0.88} />
    </mesh>)}
    <mesh castShadow receiveShadow position={[0, height / 2, depth / 2]}>
      <boxGeometry args={[width, height, wall]} /><meshStandardMaterial color="#c5baa2" roughness={0.88} /></mesh>
    <mesh castShadow position={[0, height - 0.52, front - 0.18]}>
      <boxGeometry args={[doorway + 0.95, 0.75, 0.7]} /><meshStandardMaterial color="#564a40" roughness={0.7} /></mesh>
    <mesh position={[0, height - 0.50, front - 0.55]}>
      <boxGeometry args={[doorway + 0.45, 0.42, 0.03]} /><meshStandardMaterial color="#354f4b" roughness={0.62} metalness={0.12} /></mesh>
    <BillboardLabel text={room.name} position={[0, height - 0.48, front - 0.68]} width={main ? 4.8 : 4} color="#ffe1aa" />

    {/* Desks/shelves sit behind the NPC, leaving a straight corridor from each doorway. */}
    <mesh castShadow position={[0, 0.85, depth / 2 - 2.1]}><boxGeometry args={[main ? 5.4 : 4.1, 1.2, 0.85]} />
      <meshStandardMaterial color="#675142" roughness={0.8} /></mesh>
    {[-1, 1].map((sign) => <group key={sign} position={[sign * (width / 2 - 1.2), 0, depth / 2 - 2.3]}>
      <mesh castShadow position={[0, 1.25, 0]}><boxGeometry args={[0.65, 2.1, 2.5]} /><meshStandardMaterial color="#635344" /></mesh>
      {[0.6, 1.24, 1.87].map((y) => <mesh key={y} position={[0, y, -0.04]}><boxGeometry args={[0.7, 0.08, 2.4]} />
        <meshStandardMaterial color="#ae9164" /></mesh>)}
    </group>)}
    {[-1, 1].map((sign) => <group key={`lamp-${sign}`} position={[sign * (doorway / 2 + 0.4), height - 1.18, front - 0.5]}>
      <mesh position={[0, -0.35, 0]}><boxGeometry args={[0.62, 0.76, 0.62]} />
        <meshStandardMaterial color="#f8d99c" emissive="#e8a45c" emissiveIntensity={0.92} /></mesh>
      <mesh position={[0, 0.12, 0]}><boxGeometry args={[0.78, 0.11, 0.78]} /><meshStandardMaterial color="#50463e" /></mesh>
    </group>)}

    {/* Two pitched jade roof planes, ridges, deep gold-edged eaves; hidden above the local player indoors. */}
    <group visible={!inside}>
      {[-1, 1].map((sign) => <mesh key={sign} castShadow receiveShadow
        position={[0, height + 0.96, sign * depth / 4]} rotation={[sign * 0.31, 0, 0]}>
        <boxGeometry args={[width + 2.4, 0.3, depth / 2 + 1.8]} />
        <meshStandardMaterial color={main ? '#325d59' : room.id === 'quest' ? '#407369' : '#5e615b'} roughness={0.55} metalness={0.16} />
      </mesh>)}
      <mesh castShadow position={[0, height + 1.98, 0]}><boxGeometry args={[width + 2.7, 0.16, 0.39]} />
        <meshStandardMaterial color="#cfb17d" metalness={0.55} roughness={0.35} /></mesh>
      {[-1, 1].map((sign) => <mesh key={`eave-${sign}`} position={[0, height + 0.18, sign * (depth / 2 + 0.68)]}>
        <boxGeometry args={[width + 2.55, 0.12, 0.18]} /><meshStandardMaterial color="#c4aa76" metalness={0.5} roughness={0.42} />
      </mesh>)}
      {[-1, 1].map((sign) => <mesh key={`finial-${sign}`} position={[sign * (width / 2 + 1), height + 2.02, 0]}>
        <coneGeometry args={[0.32, 0.95, 6]} /><meshStandardMaterial color="#e5c68d" metalness={0.65} roughness={0.3} />
      </mesh>)}
      {main && <group position={[0, height + 2.55, 0]}>
        <mesh castShadow position={[0, 0, 0]}><boxGeometry args={[7.8, 0.95, 4.9]} /><meshStandardMaterial color="#d5c6a4" /></mesh>
        <mesh castShadow position={[0, 0.87, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[5.4, 1.55, 4]} /><meshStandardMaterial color="#315a58" roughness={0.55} metalness={0.1} /></mesh>
        <mesh position={[0, 1.83, 0]}><coneGeometry args={[0.22, 0.9, 7]} /><meshStandardMaterial color="#eac787" metalness={0.72} /></mesh>
      </group>}
    </group>
  </group>;
}

export function SectArchitecture({ playerPosition }: { playerPosition: Vector3 }) {
  return <>{SECT_BUILDINGS.map((room) => <SectHall key={room.id} room={room} playerPosition={playerPosition} />)}</>;
}

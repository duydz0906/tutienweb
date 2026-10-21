import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DEFAULT_APPEARANCE, NPCS, VILLAGE_NPCS, VILLAGE_RADIUS, type Appearance, type Gender, type NpcId, type PublicPlayer, type Vector3 } from '@van-thuong/shared';
import { Avatar } from './Avatar';
import { BillboardLabel } from './Billboard';
import { PortalGate } from './PortalGate';
import { SkyAtmosphere } from './SkyAtmosphere';

const wallColors = ['#cbb894', '#b9ac8c', '#d1c3a2', '#b4a181'];
const roofColors = ['#6b5a4c', '#586556', '#70584a'];

/** A simple timber house with an overhanging tiled roof; purely visual, the server has no walls here. */
function House({ x, z, rotation, scale = 1, tone = 0 }: { x: number; z: number; rotation: number; scale?: number; tone?: number }) {
  const wall = wallColors[tone % wallColors.length];
  const roof = roofColors[tone % roofColors.length];
  return <group position={[x, 0, z]} rotation={[0, rotation, 0]} scale={scale}>
    <mesh receiveShadow position={[0, 0.05, 0]}><boxGeometry args={[6.4, 0.14, 5.2]} /><meshStandardMaterial color="#9b9382" roughness={1} /></mesh>
    <mesh castShadow receiveShadow position={[0, 1.35, 0]}><boxGeometry args={[5.4, 2.6, 4.2]} /><meshStandardMaterial color={wall} roughness={0.94} /></mesh>
    {[-1, 1].map((sign) => <mesh key={sign} castShadow position={[sign * 2.1, 1.35, 2.12]}>
      <boxGeometry args={[0.9, 1.1, 0.1]} /><meshStandardMaterial color="#6b5b41" emissive="#ffcf86" emissiveIntensity={0.18} roughness={0.9} /></mesh>)}
    <mesh castShadow position={[0, 1.05, 2.12]}><boxGeometry args={[1.15, 2.1, 0.12]} /><meshStandardMaterial color="#4f4335" /></mesh>
    <mesh position={[0, 1.9, 2.2]}><boxGeometry args={[1.25, 0.12, 0.06]} /><meshStandardMaterial color="#d9c08d" metalness={0.3} /></mesh>
    <mesh castShadow position={[0, 3.05, 0]} rotation={[0, Math.PI / 4, 0]}>
      <coneGeometry args={[4.7, 1.75, 16]} /><meshStandardMaterial color={roof} roughness={0.88} flatShading />
    </mesh>
    <mesh position={[0, 4.02, 0]}><boxGeometry args={[0.5, 0.16, 0.5]} /><meshStandardMaterial color="#444238" /></mesh>
  </group>;
}

function Lantern({ x, z }: { x: number; z: number }) {
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => { if (glow.current) glow.current.opacity = 0.68 + Math.sin(clock.elapsedTime * 2.2 + x) * 0.12; });
  return <group position={[x, 0, z]}>
    <mesh castShadow position={[0, 1.5, 0]}><cylinderGeometry args={[0.07, 0.1, 3, 16]} /><meshStandardMaterial color="#584d40" /></mesh>
    <mesh position={[0, 3.05, 0]}><sphereGeometry args={[0.28, 20, 14]} />
      <meshBasicMaterial ref={glow} color="#ffcf86" transparent opacity={0.7} /></mesh>
    <mesh position={[0, 3.05, 0]}><torusGeometry args={[0.31, 0.025, 6, 16]} /><meshStandardMaterial color="#8b7050" /></mesh>
    <pointLight color="#ffc27a" intensity={2.2} distance={8} position={[0, 3, 0]} />
  </group>;
}

function Stall({ x, z, rotation, color }: { x: number; z: number; rotation: number; color: string }) {
  return <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
    <mesh castShadow receiveShadow position={[0, 0.5, 0]}><boxGeometry args={[2.9, 0.16, 1.5]} /><meshStandardMaterial color="#9c845f" roughness={0.9} /></mesh>
    {[-1, 1].map((sign) => <mesh key={sign} castShadow position={[sign * 1.35, 1.15, 0]}>
      <cylinderGeometry args={[0.055, 0.07, 2.2, 16]} /><meshStandardMaterial color="#6d5c45" /></mesh>)}
    <mesh castShadow position={[0, 2.3, 0]} rotation={[0.1, 0, 0]}><boxGeometry args={[3.3, 0.09, 1.9]} />
      <meshStandardMaterial color={color} roughness={0.8} /></mesh>
    {[-0.9, 0, 0.9].map((offset) => <mesh key={offset} position={[offset, 0.72, 0]}>
      <sphereGeometry args={[0.17, 20, 14]} /><meshStandardMaterial color={offset ? '#c9b58d' : '#a7c48b'} emissive="#3e4a2b" emissiveIntensity={0.25} /></mesh>)}
  </group>;
}

function Well() {
  return <group position={[2, 0, 8]}>
    <mesh receiveShadow position={[0, 0.16, 0]}><cylinderGeometry args={[1.2, 1.3, 0.34, 22]} /><meshStandardMaterial color="#8f8f83" roughness={1} /></mesh>
    <mesh position={[0, 0.36, 0]}><cylinderGeometry args={[0.9, 0.9, 0.16, 20]} /><meshStandardMaterial color="#415d5e" roughness={0.4} metalness={0.15} /></mesh>
    {[-1, 1].map((sign) => <mesh key={sign} castShadow position={[sign * 1.05, 1.2, 0]}>
      <cylinderGeometry args={[0.08, 0.1, 2, 16]} /><meshStandardMaterial color="#6b5a45" /></mesh>)}
    <mesh castShadow position={[0, 2.25, 0]}><boxGeometry args={[2.5, 0.14, 0.7]} /><meshStandardMaterial color="#7a654c" /></mesh>
  </group>;
}

function VillageNpc({ id, appearance, gender, position, rotation, glow, onInteract }: {
  id: NpcId; appearance: Partial<Appearance>; gender: Gender; position: Vector3; rotation: number; glow: string;
  onInteract: (id: NpcId) => void;
}) {
  const actor = useMemo<PublicPlayer>(() => ({
    id: `village-npc-${id}`, name: NPCS[id].name, gender, appearance: { ...DEFAULT_APPEARANCE, ...appearance },
    position, rotation, hp: 100, maxHp: 100, realm: 1, minorStage: 1, path: null,
    root: { tier: 'chan', elements: ['moc'], multiplier: 1 },
    equipment: { robe: 'novice_robe' }, isAdmin: false, devMode: false,
  }), [id, appearance, gender, position, rotation]);
  return <group onClick={(event) => { event.stopPropagation(); onInteract(id); }}
    onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
    onPointerOut={() => { document.body.style.cursor = ''; }}>
    <Avatar player={actor} local />
    <mesh position={[position.x, 0.095, position.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.76, 0.84, 40]} /><meshBasicMaterial color={glow} transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
    <BillboardLabel text={NPCS[id].name} color={glow} position={[position.x, 2.55, position.z]} width={4.1} />
    <BillboardLabel text={id === 'village_shop' ? 'TẠP HÓA · PHI HÀNH' : 'LÝ TRƯỞNG · TIN TỨC'}
      color="#f5e6bf" position={[position.x, 2.16, position.z]} width={3.3} />
  </group>;
}

/**
 * Vân Cốc sits at the foot of the mountain: a safe public map reached through the south path.
 * Houses, stalls and fields are decorative; only the server decides travel and shop access.
 */
export function VillageScene({ playerPosition, onInteract, onTravel }: {
  playerPosition: Vector3; onInteract: (id: NpcId) => void; onTravel: () => void;
}) {
  const fields = useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    x: (i % 2 ? 1 : -1) * (24 + (i % 5) * 1.35), z: 14 - Math.floor(i / 2) * 2.4,
  })), []);
  return <group>
    <SkyAtmosphere zone="village" />
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <circleGeometry args={[VILLAGE_RADIUS + 16, 96]} /><meshStandardMaterial color="#71907a" roughness={1} />
    </mesh>
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, -3]}>
      <planeGeometry args={[18, 56]} /><meshStandardMaterial color="#9a937e" roughness={0.98} />
    </mesh>
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 6]}>
      <circleGeometry args={[6.4, 40]} /><meshStandardMaterial color="#a8a08a" roughness={0.96} />
    </mesh>
    {Array.from({ length: 30 }, (_, i) => <mesh key={`stone-${i}`} receiveShadow
      position={[Math.sin(i * 2.7) * 3.2, 0.075, 19 - i * 1.5]} rotation={[0, i * 0.5, 0]}>
      <boxGeometry args={[1.5 + i % 3 * 0.2, 0.05, 1.1]} /><meshStandardMaterial color={i % 3 ? '#b2a992' : '#9a927f'} roughness={1} />
    </mesh>)}

    {/* Rice paddies and low stone walls frame the hamlet, well clear of the houses. */}
    {fields.map((field, index) => <group key={`field-${index}`} position={[field.x, 0, field.z]}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
        <planeGeometry args={[2.3, 2]} /><meshStandardMaterial color={index % 2 ? '#5f8a58' : '#6d9761'} roughness={1} />
      </mesh>
      {[-0.7, 0, 0.7].map((offset) => <mesh key={offset} position={[offset, 0.16, 0]} rotation={[0, 0, offset * 0.2]}>
        <coneGeometry args={[0.12, 0.34, 16]} /><meshStandardMaterial color="#8cb96f" roughness={0.9} />
      </mesh>)}
    </group>)}

    <House x={-15} z={6} rotation={Math.PI / 2.2} tone={0} />
    <House x={-16} z={-13} rotation={Math.PI / 1.7} tone={2} scale={0.94} />
    <House x={16} z={4} rotation={-Math.PI / 2.2} tone={1} />
    <House x={17} z={-15} rotation={-Math.PI / 1.7} tone={0} scale={0.9} />
    <House x={-9} z={-19} rotation={0.12} tone={1} scale={0.85} />
    <House x={11} z={-20} rotation={-0.15} tone={2} scale={0.88} />
    <House x={-21} z={-3} rotation={Math.PI / 2} tone={2} scale={0.72} />

    <Stall x={-8} z={-1.5} rotation={0.2} color="#b25d4c" />
    <Stall x={-3.4} z={-7.5} rotation={-0.35} color="#5e7f96" />
    <Stall x={5.5} z={-11} rotation={0.4} color="#b48b4a" />
    <Well />

    {[[-3.2, 16], [3.2, 16], [-3.2, 3], [3.2, 3], [-3.2, -11], [3.2, -11]].map(([x, z]) =>
      <Lantern key={`lantern-${x}-${z}`} x={x} z={z} />)}

    {/* Bamboo and rocks only sit at the very edge, leaving the streets and fields readable. */}
    {Array.from({ length: 22 }, (_, i) => {
      const angle = i * 2.39996, radius = 34 + (i % 4) * 1.8;
      return <group key={`tree-${i}`} position={[Math.sin(angle) * radius, 0, Math.cos(angle) * radius - 3]}>
        <mesh castShadow position={[0, 1.8, 0]}><cylinderGeometry args={[0.13, 0.22, 3.6, 16]} /><meshStandardMaterial color="#6d6247" /></mesh>
        {[0, 0.9, 1.7].map((height, k) => <mesh key={k} castShadow position={[0, 3.1 + height, 0]} scale={1 - k * 0.16}>
          <icosahedronGeometry args={[1.1, 1]} /><meshStandardMaterial color={i % 2 ? '#527c5a' : '#5f8a68'} roughness={0.96} flatShading />
        </mesh>)}
      </group>;
    })}
    {Array.from({ length: 20 }, (_, i) => {
      const angle = i * 2.39996, radius = 32 + (i % 3) * 2.2;
      return <mesh key={`rock-${i}`} castShadow position={[Math.sin(angle) * radius, 0.4, Math.cos(angle) * radius]}>
        <dodecahedronGeometry args={[0.5 + (i % 3) * 0.24, 0]} /><meshStandardMaterial color="#7d8577" roughness={1} flatShading />
      </mesh>;
    })}

    {/* The mountain path climbs up behind the return gate, matching where the portal leads. */}
    <group position={[0, 0, -26]}>
      {[0, 1, 2, 3, 4, 5].map((step) => <mesh key={step} receiveShadow position={[0, 0.12 + step * 0.34, -step * 1.5]}>
        <boxGeometry args={[8.4 - step * 0.6, 0.55, 1.5]} /><meshStandardMaterial color={step % 2 ? '#8b8d7d' : '#96998a'} roughness={1} />
      </mesh>)}
      <mesh castShadow position={[0, 8, -19]} rotation={[0.08, 0, 0]}>
        <coneGeometry args={[19, 24, 16]} /><meshStandardMaterial color="#617b6b" roughness={1} flatShading />
      </mesh>
      <BillboardLabel text="SƠN ĐẠO · TÔNG MÔN" position={[0, 3.4, 1.6]} width={5.6} color="#ffe8ba" />
    </group>
    {/* A low tea hill fills the view back toward the village entrance. */}
    <group position={[0, 0, 33]}>
      <mesh castShadow position={[0, 2.4, 2]}><coneGeometry args={[9, 6.5, 16]} /><meshStandardMaterial color="#5f8064" roughness={1} flatShading /></mesh>
      {[-3, 0, 3].map((offset) => <mesh key={offset} position={[offset, 0.3, -2.2]}>
        <cylinderGeometry args={[0.5, 0.62, 0.6, 16]} /><meshStandardMaterial color="#6b8a5e" roughness={1} />
      </mesh>)}
    </group>

    <PortalGate zone="village" playerPosition={playerPosition} onTravel={onTravel} />
    {VILLAGE_NPCS.map((id) => <VillageNpc key={id} id={id}
      appearance={id === 'village_shop' ? { hair: 'bun', hairColor: 'ash', robeColor: 'ember', height: 0.4, build: 0.6 }
        : { hair: 'tied', hairColor: 'silver', robeColor: 'jade', face: 'heart', height: 0.62 }}
      gender={id === 'village_shop' ? 'nam' : 'nu'}
      position={NPCS[id].position} rotation={id === 'village_shop' ? 0.7 : -0.5}
      glow={id === 'village_shop' ? '#ffd39a' : '#a7eccb'} onInteract={onInteract} />)}
  </group>;
}

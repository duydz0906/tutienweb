import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HOME_GATE, SECRET_GATE, SECT_BUILDINGS, SPIRIT_LAKE, type Vector3 } from '@van-thuong/shared';
import { BillboardLabel } from './Billboard';

// All decoration is deterministic and instanced; the server's walkable surface remains y=0.
const RIVER = [
  [37, -43], [34, -36], [31, -27], [33, -18], [29, -12], [21, -13], [12, -19], [2, -23], [-4, -24],
] as const;
const riverCurve = new THREE.CatmullRomCurve3(RIVER.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');

function riverDistance(x: number, z: number): number {
  let distance = Infinity;
  for (let i = 0; i <= 36; i++) {
    const p = riverCurve.getPoint(i / 36);
    distance = Math.min(distance, Math.hypot(x - p.x, z - p.z));
  }
  return distance;
}

function ribbon(width: number, y: number): THREE.BufferGeometry {
  const steps = 72, coords: number[] = [], indices: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, p = riverCurve.getPoint(t), tangent = riverCurve.getTangent(t);
    const nx = tangent.z, nz = -tangent.x;
    const breadth = width * (0.85 + Math.sin(t * 23) * 0.09);
    coords.push(p.x + nx * breadth, y, p.z + nz * breadth, p.x - nx * breadth, y, p.z - nz * breadth);
    if (i < steps) indices.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function MountainRiver() {
  const bed = useMemo(() => ribbon(2.75, 0.094), []);
  const water = useMemo(() => ribbon(1.88, 0.135), []);
  const flow = useRef<THREE.Group>(null);
  useEffect(() => () => { bed.dispose(); water.dispose(); }, [bed, water]);
  useFrame(({ clock }) => { if (flow.current) flow.current.position.y = Math.sin(clock.elapsedTime * 2) * 0.013; });
  return <>
    <mesh receiveShadow geometry={bed}><meshStandardMaterial color="#506f64" roughness={1} side={THREE.DoubleSide} /></mesh>
    <group ref={flow}><mesh geometry={water}>
      <meshPhysicalMaterial color="#4caab2" emissive="#1a696f" emissiveIntensity={0.28} metalness={0.25} roughness={0.19}
        transparent opacity={0.88} side={THREE.DoubleSide} depthWrite={false} />
    </mesh></group>
    {Array.from({ length: 28 }, (_, i) => {
      const p = riverCurve.getPoint((i + 0.45) / 29);
      return <group key={i} position={[p.x, 0, p.z]}>
        <mesh position={[(i % 2 ? 1 : -1) * 2.2, 0.25, (i % 4) * 0.3]} rotation={[0.22, i * 1.7, 0.14]}>
          <dodecahedronGeometry args={[0.27 + i % 3 * 0.13, 0]} /><meshStandardMaterial color="#a2aaa0" roughness={1} flatShading />
        </mesh>
        {i % 3 === 0 && <mesh position={[0, 0.146, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.2, 0.23, 20]} /><meshBasicMaterial color="#d7f5e8" transparent opacity={0.48} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>}
      </group>;
    })}
    {/* The water falls from the playable mountain into the far valley. */}
    <group position={[37, -6.3, -43]} rotation={[0, -0.68, 0]}>
      <mesh position={[0, 0, 0]}><planeGeometry args={[3.5, 12.4]} />
        <meshBasicMaterial color="#a5ebe4" transparent opacity={0.63} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, -6, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.9, 32]} /><meshBasicMaterial color="#d3f8f1" transparent opacity={0.43} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  </>;
}

function Lake({ playerPosition }: { playerPosition: Vector3 }) {
  const { x, z } = SPIRIT_LAKE.position;
  const radius = SPIRIT_LAKE.radius;
  const ripples = useRef<THREE.Group>(null);
  useFrame((_, delta) => { if (ripples.current) ripples.current.rotation.y += delta * 0.07; });
  return <group position={[x, 0, z]}>
    <mesh receiveShadow position={[0, 0.105, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius + 0.9, 72]} /><meshStandardMaterial color="#809f8b" roughness={1} side={THREE.DoubleSide} />
    </mesh>
    <mesh position={[0, 0.139, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 72]} /><meshPhysicalMaterial color="#41999b" metalness={0.25} roughness={0.17}
        transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
    <group ref={ripples} position={[0, 0.147, 0]}>
      {[2.2, 3.8, 5.4].map((r) => <mesh key={r} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r, r + 0.035, 64]} /><meshBasicMaterial color="#c5f8e5" transparent opacity={0.41} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>)}
    </group>
    {Array.from({ length: 16 }, (_, i) => {
      const angle = i * 2.39996, r = radius + 0.3 + i % 3 * 0.19;
      return <mesh key={i} position={[Math.cos(angle) * r, 0.25, Math.sin(angle) * r]} rotation={[0.1 * i, i, 0.07]}>
        <dodecahedronGeometry args={[0.35 + i % 3 * 0.21, 0]} /><meshStandardMaterial color={i % 3 ? '#a5ada3' : '#838e82'} roughness={1} flatShading />
      </mesh>;
    })}
    {Array.from({ length: 13 }, (_, i) => {
      const angle = i * 2.39996, r = 2.7 + i % 3 * 1.1;
      return <group key={i} position={[Math.cos(angle) * r, 0.16, Math.sin(angle) * r]}>
        <mesh rotation={[-Math.PI / 2, angle, 0]}><circleGeometry args={[0.38, 9]} />
          <meshStandardMaterial color="#4f8b6d" roughness={0.7} side={THREE.DoubleSide} /></mesh>
        {i % 3 === 0 && <mesh position={[0, 0.12, 0]}><icosahedronGeometry args={[0.16, 1]} />
          <meshStandardMaterial color="#f4d3dd" emissive="#bb829d" emissiveIntensity={0.45} /></mesh>}
      </group>;
    })}
    <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.2, 1.35, 36]} /><meshBasicMaterial color="#c2f5d5" transparent opacity={0.4} side={THREE.DoubleSide} />
    </mesh>
    {/* At the water the HUD already shows the bonus. Hide the world-space sprite
        so it cannot grow across the whole screen when the camera passes through it. */}
    {Math.hypot(playerPosition.x - x, playerPosition.z - z) > radius + 8 &&
      <BillboardLabel text="HỒ TỤ LINH · AFK +15%" position={[0, 2.7, 0]} width={4.8} color="#c7ffec" />}
  </group>;
}

type Tree = { x: number; y: number; z: number; height: number; shade: number };
function forestPositions(): Tree[] {
  const trees: Tree[] = [];
  for (let i = 0; i < 400; i++) {
    const angle = i * 2.39996322973;
    const radius = 15 + Math.sqrt((i + 0.3) / 400) * 29;
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    if (SECT_BUILDINGS.some((room) => Math.abs(x - room.x) < room.width / 2 + 3.4 && Math.abs(z - room.z) < room.depth / 2 + 3.4)) continue;
    if (Math.abs(x) < 7.3 && z > -2 && z < 41 ||
        Math.hypot(x - SPIRIT_LAKE.position.x, z - SPIRIT_LAKE.position.z) < SPIRIT_LAKE.radius + 3.5 ||
        Math.hypot(x - HOME_GATE.position.x, z - HOME_GATE.position.z) < 4.8 ||
        Math.hypot(x - SECRET_GATE.position.x, z - SECRET_GATE.position.z) < 7.3 ||
        riverDistance(x, z) < 4.5) continue;
    trees.push({ x, z, y: 0, height: 2.7 + (i % 7) * 0.43, shade: i });
  }
  for (let i = 0; i < 165; i++) {
    const angle = i * 2.39996322973;
    const radius = 50 + Math.sqrt((i + 0.5) / 165) * 24;
    trees.push({ x: Math.sin(angle) * radius, z: Math.cos(angle) * radius,
      y: -1.9 - (radius - 48) * 0.43, height: 3.2 + (i % 5) * 0.5, shade: i + 100 });
  }
  return trees;
}

function MountainForest() {
  const trees = useMemo(forestPositions, []);
  const trunks = useRef<THREE.InstancedMesh>(null);
  const lower = useRef<THREE.InstancedMesh>(null);
  const upper = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!trunks.current || !lower.current || !upper.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i], h = tree.height;
      dummy.position.set(tree.x, tree.y + h * 0.47, tree.z);
      dummy.scale.set(0.94 + tree.shade % 3 * 0.12, h, 0.94 + tree.shade % 3 * 0.12);
      dummy.rotation.set(0, tree.shade * 1.7, 0);
      dummy.updateMatrix(); trunks.current.setMatrixAt(i, dummy.matrix);
      for (const [index, foliage] of [lower.current, upper.current].entries()) {
        dummy.position.set(tree.x, tree.y + h * (index ? 0.97 : 0.69), tree.z);
        dummy.scale.set(h * (index ? 0.32 : 0.42), h * (index ? 0.43 : 0.53), h * (index ? 0.32 : 0.42));
        dummy.rotation.set(0, tree.shade * 1.7, 0);
        dummy.updateMatrix(); foliage.setMatrixAt(i, dummy.matrix);
        foliage.setColorAt(i, new THREE.Color(tree.y < 0 ? ['#456e67', '#547e6b', '#3c625c'][tree.shade % 3] :
          ['#4c856a', '#699b75', '#426e64', '#729d7c'][tree.shade % 4]));
      }
    }
    for (const mesh of [trunks.current, lower.current, upper.current]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [trees]);
  return <>
    <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} castShadow receiveShadow>
      <cylinderGeometry args={[0.13, 0.24, 1, 6]} /><meshStandardMaterial color="#6d6253" roughness={1} flatShading />
    </instancedMesh>
    <instancedMesh ref={lower} args={[undefined, undefined, trees.length]} castShadow>
      <coneGeometry args={[1, 1, 7]} /><meshStandardMaterial color="#ffffff" roughness={1} flatShading side={THREE.DoubleSide} />
    </instancedMesh>
    <instancedMesh ref={upper} args={[undefined, undefined, trees.length]} castShadow>
      <coneGeometry args={[1, 1, 7]} /><meshStandardMaterial color="#ffffff" roughness={1} flatShading side={THREE.DoubleSide} />
    </instancedMesh>
  </>;
}

/** The playable sect is a broad summit with a river, lake and a descending wooded mountain. */
export function SectLandscape({ playerPosition }: { playerPosition: Vector3 }) {
  return <>
    <mesh castShadow receiveShadow position={[0, -8.9, 0]}>
      <cylinderGeometry args={[47, 71, 17.8, 80, 5]} /><meshStandardMaterial color="#657568" roughness={1} flatShading />
    </mesh>
    <mesh castShadow receiveShadow position={[0, -13.8, 0]}>
      <cylinderGeometry args={[68, 84, 7.3, 80, 2]} /><meshStandardMaterial color="#526b62" roughness={1} flatShading />
    </mesh>
    <mesh receiveShadow position={[0, 0, 0]}>
      <cylinderGeometry args={[46.9, 47, 0.14, 80]} /><meshStandardMaterial color="#79917a" roughness={1} />
    </mesh>
    <MountainRiver />
    <Lake playerPosition={playerPosition} />
    <MountainForest />
  </>;
}

export function distanceTo(point: Vector3, other: Vector3): number {
  return Math.hypot(point.x - other.x, point.z - other.z);
}

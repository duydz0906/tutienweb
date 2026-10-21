import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ITEMS, SKILLS, type BossState, type CombatEvent, type FormationState, type TribulationState, type Vector3, type WorldDrop } from '@van-thuong/shared';

const JADE = '#82cdbb';
const GOLD = '#eac58b';
const stonePositions = Array.from({ length: 29 }, (_, i) => ({
  x: Math.sin(i * 4.31) * 33,
  z: Math.cos(i * 2.77) * 30,
  size: 0.6 + (i % 5) * 0.28,
})).filter(({ x, z }) => Math.hypot(x, z) > 9 && Math.hypot(x, z) < 41);
const treePositions: [number, number, number][] = [
  [-22, 16, 1.2], [-27, -4, 1], [-22, -25, 1.4], [22, 19, 1.2],
  [28, 1, 1], [24, -24, 1.4], [-36, 18, 0.8], [34, -17, 0.9],
];

function RuneCircle({ x, z, radius = 3, color = JADE, opacity = 0.48 }: { x: number; z: number; radius?: number; color?: string; opacity?: number }) {
  return <group position={[x, 0.035, z]}>
    {[radius, radius * 0.84, radius * 0.37].map((r, i) =>
      <mesh key={i} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r - 0.025, r + 0.025, 64]} />
        <meshBasicMaterial color={color} transparent opacity={opacity * (1 - i * 0.12)} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>)}
    {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[Math.sin(i * Math.PI / 6) * radius * 0.93, 0.005, Math.cos(i * Math.PI / 6) * radius * 0.93]}
      rotation={[-Math.PI / 2, 0, i * Math.PI / 6]}>
      <planeGeometry args={[0.07, 0.27]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>)}
  </group>;
}

function CherryTree({ x, z, scale }: { x: number; z: number; scale: number }) {
  return <group position={[x, 0, z]} scale={scale}>
    <mesh castShadow position={[0, 1.9, 0]}><cylinderGeometry args={[0.18, 0.32, 3.8, 8]} /><meshStandardMaterial color="#574d4b" roughness={1} /></mesh>
    <mesh castShadow position={[0.67, 3.35, 0]} rotation={[0, 0, -0.65]}><cylinderGeometry args={[0.09, 0.16, 1.8, 7]} /><meshStandardMaterial color="#574d4b" /></mesh>
    {[[0, 4.2, 0, 1.65], [1.25, 4.05, 0.4, 1.15], [-1.15, 3.85, -0.2, 1.2], [0.2, 4.55, -0.8, 1.2]].map(([cx, cy, cz, s], i) =>
      <mesh key={i} castShadow position={[cx, cy, cz]} scale={[s, s * 0.75, s]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={i % 2 ? '#d4adac' : '#e7c9c1'} roughness={1} flatShading />
      </mesh>)}
  </group>;
}

function BambooGrove() {
  const stalks = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const count = 68;
  useEffect(() => {
    if (!stalks.current || !leaves.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? -1 : 1;
      const x = side * (27 + ((i * 17) % 13));
      const z = ((i * 31) % 76) - 38;
      const height = 2.1 + (i % 7) * 0.32;
      dummy.position.set(x, height / 2, z);
      dummy.scale.set(0.75, height, 0.75);
      dummy.rotation.set(0, 0, (i % 4 - 2) * 0.04);
      dummy.updateMatrix();
      stalks.current.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, height + 0.2, z);
      dummy.scale.set(0.55 + (i % 3) * 0.13, 0.95, 0.55 + (i % 3) * 0.13);
      dummy.rotation.set(0, i, 0);
      dummy.updateMatrix();
      leaves.current.setMatrixAt(i, dummy.matrix);
    }
    stalks.current.instanceMatrix.needsUpdate = true;
    leaves.current.instanceMatrix.needsUpdate = true;
  }, []);
  return <>
    <instancedMesh ref={stalks} args={[undefined, undefined, count]} castShadow>
      <cylinderGeometry args={[0.055, 0.075, 1, 5]} /><meshStandardMaterial color="#658c6c" roughness={0.95} />
    </instancedMesh>
    <instancedMesh ref={leaves} args={[undefined, undefined, count]} castShadow>
      <coneGeometry args={[1, 2, 6]} /><meshStandardMaterial color="#4f826f" roughness={1} flatShading />
    </instancedMesh>
  </>;
}

function GroundFoliage() {
  const leaves = useRef<THREE.InstancedMesh>(null);
  const crystals = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!leaves.current || !crystals.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 210; i++) {
      const angle = i * 2.39996;
      const radius = 7 + Math.sqrt(i / 210) * 35;
      dummy.position.set(Math.sin(angle) * radius, 0.14, Math.cos(angle) * radius);
      dummy.rotation.set(-Math.PI / 2, angle, 0);
      dummy.scale.setScalar(0.45 + i % 5 * 0.14);
      dummy.updateMatrix();
      leaves.current.setMatrixAt(i, dummy.matrix);
    }
    for (let i = 0; i < 31; i++) {
      const angle = i * 2.39996;
      const radius = 11 + (i % 6) * 5.6;
      dummy.position.set(Math.sin(angle) * radius, 0.21, Math.cos(angle) * radius);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.setScalar(0.12 + (i % 3) * 0.05);
      dummy.updateMatrix();
      crystals.current.setMatrixAt(i, dummy.matrix);
    }
    leaves.current.instanceMatrix.needsUpdate = true;
    crystals.current.instanceMatrix.needsUpdate = true;
  }, []);
  return <>
    <instancedMesh ref={leaves} args={[undefined, undefined, 210]}>
      <circleGeometry args={[0.84, 5]} /><meshBasicMaterial color="#bfd0a3" transparent opacity={0.21} depthWrite={false} side={THREE.DoubleSide} />
    </instancedMesh>
    <instancedMesh ref={crystals} args={[undefined, undefined, 31]}>
      <octahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#bcddd1" emissive="#5bafad" emissiveIntensity={1.6} metalness={0.5} roughness={0.3} />
    </instancedMesh>
  </>;
}

function MountainHorizon() {
  const mountains = useMemo(() => Array.from({ length: 22 }, (_, i) => {
    const angle = (i / 22) * Math.PI * 2;
    const distance = 78 + (i % 4) * 8;
    return { x: Math.sin(angle) * distance, z: Math.cos(angle) * distance,
      height: 17 + ((i * 13) % 17), radius: 11 + ((i * 7) % 10) };
  }), []);
  return <>
    {mountains.map((m, i) => <mesh key={i} position={[m.x, m.height * 0.18 - 4, m.z]}>
      <coneGeometry args={[m.radius, m.height, 5]} />
      <meshStandardMaterial color={i % 3 ? '#6e9090' : '#7ea39e'} roughness={1} flatShading />
    </mesh>)}
    <mesh position={[-45, 50, -80]}><sphereGeometry args={[8, 24, 16]} /><meshBasicMaterial color="#fff0d0" fog={false} /></mesh>
  </>;
}

function Pagoda({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  return <group position={[x, 0, z]} scale={scale}>
    <mesh receiveShadow position={[0, 0.4, 0]}><cylinderGeometry args={[4.4, 4.8, 0.8, 4]} /><meshStandardMaterial color="#9a9a89" roughness={1} /></mesh>
    {[0, 1, 2].map((tier) => <group key={tier} position={[0, 0.75 + tier * 2.2, 0]}>
      <mesh castShadow position={[0, 0.86, 0]}><boxGeometry args={[3.65 - tier * 0.55, 1.75, 3.65 - tier * 0.55]} /><meshStandardMaterial color="#b5a68c" roughness={0.9} /></mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) =>
        <mesh key={i} castShadow position={[sx * (1.4 - tier * 0.22), 0.9, sz * (1.4 - tier * 0.22)]}>
          <cylinderGeometry args={[0.11, 0.11, 1.8, 7]} /><meshStandardMaterial color="#65483d" />
        </mesh>)}
      <mesh castShadow position={[0, 1.94, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[3.65 - tier * 0.48, 1.25, 4]} />
        <meshStandardMaterial color="#275e5c" roughness={0.63} metalness={0.12} flatShading />
      </mesh>
      <mesh position={[0, 1.29, 0]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry args={[3.72 - tier * 0.48, 3.72 - tier * 0.48, 0.09, 4]} />
        <meshStandardMaterial color="#c8ac74" metalness={0.5} />
      </mesh>
    </group>)}
    <mesh castShadow position={[0, 8.25, 0]}><coneGeometry args={[0.22, 1.3, 7]} /><meshStandardMaterial color={GOLD} metalness={0.75} roughness={0.2} /></mesh>
  </group>;
}

function Lantern({ x, z }: { x: number; z: number }) {
  return <group position={[x, 0, z]}>
    <mesh castShadow position={[0, 1.7, 0]}><cylinderGeometry args={[0.085, 0.14, 3.4, 7]} /><meshStandardMaterial color="#3d5b59" metalness={0.4} /></mesh>
    <mesh position={[0, 3.2, 0]}><boxGeometry args={[0.68, 0.72, 0.68]} /><meshStandardMaterial color="#ffe0a1" emissive="#ffcb76" emissiveIntensity={1.15} roughness={0.4} /></mesh>
    <mesh castShadow position={[0, 3.6, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[0.65, 0.44, 4]} /><meshStandardMaterial color="#315d5b" /></mesh>
    <pointLight position={[0, 3.2, 0]} color="#ffd69a" intensity={3} distance={8} decay={2} />
  </group>;
}

function SpiritParticles({ storm = false }: { storm?: boolean }) {
  const group = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const positions = new Float32Array(250 * 3);
    for (let i = 0; i < 250; i++) {
      const angle = i * 2.39996;
      const radius = storm ? Math.sqrt(i / 250) * 19 : Math.sqrt(i / 250) * 49;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0.65 + ((i * 43) % 78) / 13;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [storm]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => { if (group.current) group.current.rotation.y += delta * 0.012; });
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(storm ? '#d3c7ff' : '#f6d5a2') } },
    vertexShader: 'void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(55.0/-mv.z, 1.0, 8.0); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 uColor; void main(){ float r=length(gl_PointCoord-vec2(0.5)); float a=smoothstep(0.5,0.06,r); gl_FragColor=vec4(uColor,a*0.67); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), [storm]);
  useEffect(() => () => material.dispose(), [material]);
  return <points ref={group} geometry={geometry} material={material} />;
}

export function Overworld({ boss, drops, formations, onPickup }: { boss: BossState | null; drops: WorldDrop[]; formations: FormationState[]; onPickup: (id: string) => void }) {
  return <>
    <MountainHorizon />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.7, 0]}>
      <circleGeometry args={[300, 96]} /><meshStandardMaterial color="#7fa8a6" roughness={0.44} metalness={0.12} />
    </mesh>
    <mesh castShadow receiveShadow position={[0, -1.45, 0]}>
      <cylinderGeometry args={[47, 42, 3.1, 72]} /><meshStandardMaterial color="#526b63" roughness={1} flatShading />
    </mesh>
    <mesh receiveShadow position={[0, 0, 0]}>
      <cylinderGeometry args={[46.9, 47, 0.14, 72]} /><meshStandardMaterial color="#748c77" roughness={1} />
    </mesh>
    <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[43.7, 44.1, 96]} /><meshBasicMaterial color="#b9bd94" transparent opacity={0.55} side={THREE.DoubleSide} />
    </mesh>
    {Array.from({ length: 16 }, (_, i) => <mesh key={i} castShadow receiveShadow position={[0, 0.06, 23 - i * 3.5]} rotation={[0, Math.sin(i * 3.4) * 0.07, 0]}>
      <boxGeometry args={[2.65 + (i % 3) * 0.2, 0.11, 1.76]} /><meshStandardMaterial color={i % 3 === 0 ? '#b7ae92' : '#a6aa96'} roughness={1} />
    </mesh>)}
    <RuneCircle x={0} z={10} radius={5.1} />
    <RuneCircle x={0} z={-12} radius={6.7} color="#d7ba86" opacity={0.5} />
    {stonePositions.map(({ x, z, size }, i) => <mesh key={i} castShadow position={[x, size * 0.32, z]} rotation={[0, i * 2.3, 0]}>
      <dodecahedronGeometry args={[size, 0]} /><meshStandardMaterial color={i % 3 ? '#87988a' : '#a8ab99'} roughness={1} flatShading />
    </mesh>)}
    <BambooGrove />
    <GroundFoliage />
    {treePositions.map(([x, z, scale], i) => <CherryTree key={i} x={x} z={z} scale={scale} />)}
    <Pagoda x={0} z={32} scale={1.18} />
    <Pagoda x={-17} z={27} scale={0.58} />
    <Pagoda x={17} z={27} scale={0.58} />
    {[-1, 1].flatMap((side) => [12, 1, -15].map((z) => <Lantern key={`${side}-${z}`} x={side * 5.6} z={z} />))}
    {boss && <BossModel boss={boss} />}
    {formations.map((formation) => <FormationPillars key={formation.id} formation={formation} />)}
    {drops.map((drop) => <GroundDrop key={drop.id} drop={drop} onPickup={onPickup} />)}
    <SpiritParticles />
  </>;
}

function FormationPillars({ formation }: { formation: FormationState }) {
  const spinning = useRef<THREE.Group>(null);
  useFrame((_, dt) => { if (spinning.current) spinning.current.rotation.y += dt * 0.27; });
  return <group position={[formation.position.x, 0, formation.position.z]}>
    <RuneCircle x={0} z={0} radius={formation.radius} color="#9df5d9" opacity={0.7} />
    <group ref={spinning}>
      {Array.from({ length: 4 }, (_, i) => {
        const angle = (i / 4) * Math.PI * 2;
        return <group key={i} position={[Math.sin(angle) * 3.4, 0, Math.cos(angle) * 3.4]}>
          <mesh castShadow position={[0, 1, 0]}><cylinderGeometry args={[0.21, 0.33, 2, 6]} /><meshStandardMaterial color="#456b6b" metalness={0.45} roughness={0.45} /></mesh>
          <mesh position={[0, 2.17, 0]}><octahedronGeometry args={[0.39, 0]} /><meshStandardMaterial color="#a4eedc" emissive="#4ed5b5" emissiveIntensity={1.7} /></mesh>
          <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.45, 0.5, 16]} /><meshBasicMaterial color="#b2ffe3" side={THREE.DoubleSide} transparent opacity={0.65} /></mesh>
        </group>;
      })}
    </group>
    <mesh position={[0, 0.11, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[formation.radius, 40]} /><meshBasicMaterial color="#82dac1" transparent opacity={0.065} depthWrite={false} side={THREE.DoubleSide} /></mesh>
  </group>;
}

function BossModel({ boss }: { boss: BossState }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (ref.current) {
    ref.current.position.y = boss.hp > 0 ? 0.5 + Math.sin(clock.elapsedTime * 1.2) * 0.24 : -5;
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.43) * 0.2;
  } });
  return <group ref={ref} position={[boss.position.x, 0.5, boss.position.z]} visible={boss.hp > 0}>
    <mesh castShadow position={[0, 2.05, 0]}><icosahedronGeometry args={[1.55, 1]} /><meshStandardMaterial color="#334f55" metalness={0.7} roughness={0.34} flatShading /></mesh>
    <mesh position={[0, 2.3, 1.35]}><octahedronGeometry args={[0.68, 1]} /><meshStandardMaterial color="#e38d68" emissive="#e96845" emissiveIntensity={2.1} metalness={0.55} roughness={0.2} /></mesh>
    <mesh castShadow position={[0, 4.13, 0.32]} rotation={[-0.22, 0, 0]}><dodecahedronGeometry args={[0.96, 0]} /><meshStandardMaterial color="#394d53" flatShading metalness={0.5} /></mesh>
    <mesh position={[0, 4.19, 1.14]}><sphereGeometry args={[0.42, 10, 8]} /><meshBasicMaterial color="#ffc781" /></mesh>
    {[-1, 1].map((side) => <group key={side}>
      <mesh castShadow position={[side * 1.5, 2.8, 0]} rotation={[0, 0, side * 0.46]}><coneGeometry args={[0.38, 2.7, 6]} /><meshStandardMaterial color="#527775" metalness={0.6} /></mesh>
      <mesh castShadow position={[side * 0.55, 5.23, 0]} rotation={[0, 0, -side * 0.38]}><coneGeometry args={[0.24, 1.78, 6]} /><meshStandardMaterial color="#e6d6aa" roughness={0.45} /></mesh>
      <mesh castShadow position={[side * 2.2, 1.35, 0.25]} rotation={[0, 0, side * 0.2]}><cylinderGeometry args={[0.27, 0.43, 2.8, 7]} /><meshStandardMaterial color="#344b52" metalness={0.5} /></mesh>
      <mesh castShadow position={[side * 0.83, 0.64, 0.25]}><cylinderGeometry args={[0.34, 0.46, 1.35, 7]} /><meshStandardMaterial color="#41565a" metalness={0.5} /></mesh>
      <mesh position={[side * 0.3, 4.25, 0.98]}><sphereGeometry args={[0.1, 8, 6]} /><meshBasicMaterial color="#fff1b1" /></mesh>
    </group>)}
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 2.4, 0]}><torusGeometry args={[2.15, 0.035, 6, 56]} /><meshBasicMaterial color="#eea36a" transparent opacity={0.8} /></mesh>
    <pointLight color="#f99d60" intensity={8} distance={15} position={[0, 3.5, 1]} />
  </group>;
}

function GroundDrop({ drop, onPickup }: { drop: WorldDrop; onPickup: (id: string) => void }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (ref.current) {
    ref.current.position.y = 0.8 + Math.sin(clock.elapsedTime * 2.5 + drop.position.x) * 0.18;
    ref.current.rotation.y += 0.012;
  } });
  const rare = ITEMS[drop.itemId]?.rarity;
  const color = rare === 'immortal' ? '#ff635f' : rare === 'epic' ? '#cda7fa' : '#ffe3a1';
  return <group ref={ref} position={[drop.position.x, 0.8, drop.position.z]} onClick={(event) => { event.stopPropagation(); onPickup(drop.id); }}>
    <mesh castShadow><octahedronGeometry args={[0.42, 0]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} metalness={0.6} /></mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.58, 0.028, 5, 24]} /><meshBasicMaterial color={color} /></mesh>
    <pointLight color={color} intensity={2} distance={5} />
  </group>;
}

export function TrialArena({ trial, playerPosition }: { trial: TribulationState | null; playerPosition: Vector3 }) {
  return <>
    <mesh receiveShadow position={[0, -1.15, 0]}><cylinderGeometry args={[19, 18, 2.3, 64]} /><meshStandardMaterial color="#303044" roughness={0.95} flatShading /></mesh>
    <mesh receiveShadow position={[0, 0.02, 0]}><cylinderGeometry args={[18.7, 18.7, 0.09, 64]} /><meshStandardMaterial color="#464358" roughness={0.88} /></mesh>
    <RuneCircle x={0} z={0} radius={16.9} color="#c4a1e9" opacity={0.7} />
    <RuneCircle x={0} z={0} radius={8.5} color="#a98ad5" opacity={0.4} />
    {Array.from({ length: 13 }, (_, i) => <mesh key={i} castShadow position={[Math.sin(i * 2.4) * 17, 1.15, Math.cos(i * 2.4) * 17]} rotation={[0, i, 0]}>
      <octahedronGeometry args={[0.5 + (i % 3) * 0.2, 0]} /><meshStandardMaterial color="#69647f" metalness={0.4} flatShading />
    </mesh>)}
    {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[Math.sin(i * 3.8) * 24, 12 + (i % 3), Math.cos(i * 3.8) * 19]} scale={[6, 1.9, 3.7]}>
      <sphereGeometry args={[1, 9, 7]} /><meshStandardMaterial color="#383647" roughness={1} transparent opacity={0.79} depthWrite={false} />
    </mesh>)}
    {trial?.guarding && <group position={[playerPosition.x, 1.35, playerPosition.z]}>
      <mesh><sphereGeometry args={[1.15, 20, 12]} /><meshStandardMaterial color="#aeefff" emissive="#6dd8f3" emissiveIntensity={1.6} transparent opacity={0.26} depthWrite={false} side={THREE.DoubleSide} wireframe /></mesh>
      <mesh><sphereGeometry args={[1.06, 20, 12]} /><meshBasicMaterial color="#a8dcff" transparent opacity={0.13} depthWrite={false} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 1.35, 0]}><octahedronGeometry args={[0.27, 0]} /><meshStandardMaterial color="#c4faff" emissive="#9becff" emissiveIntensity={2} /></mesh>
      <pointLight color="#9ae8ff" intensity={5} distance={6} />
    </group>}
    {trial?.active && trial.target && <group position={[trial.target.x, 0, trial.target.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        <circleGeometry args={[2.45, 40]} />
        <meshBasicMaterial color="#ff4a66" transparent opacity={trial.phase === 'warning' ? 0.34 : 0.2} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]}>
        <ringGeometry args={[2.38, 2.51, 48]} />
        <meshBasicMaterial color="#ff6970" transparent opacity={0.95} side={THREE.DoubleSide} />
      </mesh>
      {trial.phase === 'strike' && <>
        <mesh position={[0, 11, 0]}><cylinderGeometry args={[0.25, 0.61, 22, 10]} /><meshBasicMaterial color="#f2ecff" toneMapped={false} /></mesh>
        <mesh position={[0, 11, 0]}><cylinderGeometry args={[0.7, 1.5, 22, 10]} /><meshBasicMaterial color="#a88ff9" transparent opacity={0.25} depthWrite={false} /></mesh>
        <pointLight color="#d7c0ff" intensity={18} distance={26} position={[0, 2.5, 0]} />
      </>}
    </group>}
    <SpiritParticles storm />
  </>;
}

export type VisualEffect = CombatEvent & { visualId: string };
export function SkillVfx({ event }: { event: VisualEffect }) {
  const group = useRef<THREE.Group>(null);
  const skill = event.skillId ? SKILLS[event.skillId] : undefined;
  const color = event.type === 'lightning' ? '#e4dbff' : event.type === 'boss-hit' ? '#ff986b' : skill?.color ?? '#f8dcaa';
  useFrame(() => {
    if (!group.current) return;
    const elapsed = Math.max(0, (Date.now() - event.at) / 1000);
    const progress = Math.min(1, elapsed / 1.15);
    group.current.scale.setScalar(0.3 + progress * (event.type === 'cast' ? 5 : 2.3));
    group.current.visible = elapsed < 1.7;
    if (skill?.id === 'falling_star' || skill?.id === 'void_meteor') group.current.position.y = event.type === 'cast' ? 8 - progress * 7.7 : 0.4;
  });
  return <group ref={group} position={[event.position.x, skill?.id.includes('meteor') || skill?.id === 'falling_star' ? 8 : 0.4, event.position.z]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.8, 1.02, 32]} /><meshBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} /></mesh>
    {event.type === 'cast' && <mesh><icosahedronGeometry args={[0.21, 0]} /><meshBasicMaterial color={color} /></mesh>}
    {event.type === 'lightning' && <mesh position={[0, 4, 0]}><cylinderGeometry args={[0.13, 0.4, 8, 7]} /><meshBasicMaterial color="#eee9ff" toneMapped={false} /></mesh>}
  </group>;
}

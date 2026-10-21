import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ELEMENT_COLOR, type PublicPlayer } from '@van-thuong/shared';

type Rig = {
  model: THREE.Group;
  spine?: THREE.Object3D;
  head?: THREE.Object3D;
  leftArm?: THREE.Object3D;
  rightArm?: THREE.Object3D;
  ownedMaterials: THREE.Material[];
  gear: THREE.Object3D[];
};

function addGear(parent: THREE.Object3D, object: THREE.Object3D, rig: Rig): void {
  parent.add(object);
  rig.gear.push(object);
}

function makeWeapon(itemId: string): THREE.Group {
  const red = itemId === 'immortal_sword';
  const jade = itemId === 'jade_blade';
  const metal = new THREE.MeshStandardMaterial({ color: red ? '#f3675e' : jade ? '#a2fae3' : '#cad6cc', metalness: 0.85, roughness: 0.2, emissive: red ? '#ff2929' : jade ? '#3a8c75' : '#171f22', emissiveIntensity: red ? 2.5 : jade ? 0.7 : 0.15 });
  const gold = new THREE.MeshStandardMaterial({ color: '#d7ae72', metalness: 0.8, roughness: 0.25 });
  const weapon = new THREE.Group();
  weapon.name = 'WeaponSocketMesh';
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.092, red ? 1.5 : 1.2, 4), metal);
  blade.rotation.y = Math.PI / 4;
  blade.position.y = -0.95;
  blade.castShadow = true;
  weapon.add(blade);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.043, 0.53, 8), gold);
  grip.position.y = -0.06;
  weapon.add(grip);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.065, 0.075), gold);
  guard.position.y = -0.34;
  weapon.add(guard);
  weapon.rotation.z = -0.13;
  return weapon;
}

function createRig(source: THREE.Group, player: PublicPlayer): Rig {
  // SkeletonUtils.clone rebinds bones for EACH character; Object3D.clone does not.
  const model = cloneSkeleton(source) as THREE.Group;
  const rig: Rig = { model, spine: model.getObjectByName('Spine'), head: model.getObjectByName('Head'),
    leftArm: model.getObjectByName('LeftArm'), rightArm: model.getObjectByName('RightArm'),
    ownedMaterials: [], gear: [] };
  const color = player.appearance.robeColor === 'jade' ? '#4f9790' : player.appearance.robeColor === 'ember' ? '#a36763' : '#e3decf';
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const material = (object.material as THREE.MeshStandardMaterial).clone();
    if (material.name === 'RobeMaterial') material.color.set(color);
    if (material.name === 'HairMaterial') material.color.set(player.appearance.hairColor === 'silver' ? '#dce7e5' : '#202b32');
    if (material.name === 'SkinMaterial') material.color.set(player.gender === 'nu' ? '#f4d9c3' : '#e9c6aa');
    object.material = material;
    rig.ownedMaterials.push(material);
    if (player.appearance.hair === 'tied' && object.name === 'HairBack') object.scale.set(0.72, 0.55, 0.72);
    if (player.gender === 'nu' && object.name === 'FlowingSkirt') object.scale.x = object.scale.z = 1.08;
  });
  const rightHand = model.getObjectByName('RightHand');
  if (rightHand && player.equipment.weapon) addGear(rightHand, makeWeapon(player.equipment.weapon), rig);
  if (rig.head && player.equipment.head) {
    const crown = new THREE.Group();
    const jade = new THREE.MeshStandardMaterial({ color: '#72c8b1', metalness: 0.65, roughness: 0.27 });
    const crownBody = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.28, 8), jade);
    crownBody.position.y = 0.5;
    crown.add(crownBody);
    addGear(rig.head, crown, rig);
  }
  if (player.equipment.shoulder) {
    for (const arm of [rig.leftArm, rig.rightArm]) if (arm) {
      const plate = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 7), new THREE.MeshStandardMaterial({ color: '#ad9a7c', metalness: 0.7, roughness: 0.3 }));
      plate.scale.set(1.25, 0.52, 1.1);
      addGear(arm, plate, rig);
    }
  }
  return rig;
}

function SwordHalo() {
  const blades = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    if (!blades.current) return;
    const time = clock.elapsedTime;
    for (let i = 0; i < 20; i++) {
      const row = Math.floor(i / 5);
      const angle = (i % 5 - 2) * 0.42;
      dummy.position.set(Math.sin(angle) * (0.8 + row * 0.16), 1.25 + row * 0.32 + Math.sin(time * 2 + i) * 0.09, -0.7 - row * 0.12);
      dummy.rotation.set(0, 0, Math.sin(angle) * 0.5);
      dummy.scale.setScalar(0.84 + row * 0.12);
      dummy.updateMatrix();
      blades.current.setMatrixAt(i, dummy.matrix);
    }
    blades.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={blades} args={[undefined, undefined, 20]}>
    <coneGeometry args={[0.058, 0.52, 4]} />
    <meshStandardMaterial color="#a7e7d9" emissive="#6ddcc2" emissiveIntensity={0.75} metalness={0.75} roughness={0.24} />
  </instancedMesh>;
}

function InnerAvatar({ player, local, preview, groupRef }: {
  player: PublicPlayer; local: boolean; preview: boolean;
  groupRef?: React.RefObject<THREE.Group | null>;
}) {
  const gltf = useLoader(GLTFLoader, '/models/cultivator.glb');
  const rig = useMemo(() => createRig(gltf.scene, player), [gltf.scene, player.gender, player.appearance.hair,
    player.appearance.hairColor, player.appearance.robeColor, player.equipment.weapon, player.equipment.head, player.equipment.shoulder]);
  const internalRef = useRef<THREE.Group>(null);
  const artifactRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.ShaderMaterial>(null);
  const petRef = useRef<THREE.Group>(null);
  const magicRef = useRef<THREE.Group>(null);
  const rootColor = new THREE.Color(ELEMENT_COLOR[player.root.elements[0]] || '#91e7cf');
  const aura = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: rootColor } },
    vertexShader: `varying vec3 vNormal; varying vec3 vView; uniform float uTime;
      void main(){ vec3 displaced = position + normal * sin(uTime*2.0 + position.y*7.0) * 0.035;
        vec4 world = modelViewMatrix * vec4(displaced, 1.0); vNormal=normalize(normalMatrix*normal);
        vView=normalize(-world.xyz); gl_Position=projectionMatrix*world; }`,
    fragmentShader: `varying vec3 vNormal; varying vec3 vView; uniform float uTime; uniform vec3 uColor;
      void main(){ float edge=pow(1.0-abs(dot(normalize(vNormal), normalize(vView))), 2.0);
        float pulse=0.58+0.22*sin(uTime*3.0); gl_FragColor=vec4(uColor*1.8, edge*pulse*0.45); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }), [player.root.elements[0]]);

  useEffect(() => () => {
    rig.ownedMaterials.forEach((m) => m.dispose());
    for (const gear of rig.gear) gear.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
    aura.dispose();
  }, [rig, aura]);

  useFrame(({ clock }, dt) => {
    const time = clock.getElapsedTime();
    const outer = groupRef?.current ?? internalRef.current;
    if (!outer) return;
    if (!local && !preview) {
      outer.position.lerp(new THREE.Vector3(player.position.x, player.position.y, player.position.z), Math.min(1, dt * 9));
      outer.rotation.y += Math.atan2(Math.sin(player.rotation - outer.rotation.y), Math.cos(player.rotation - outer.rotation.y)) * Math.min(1, dt * 8);
    }
    if (preview) outer.rotation.y += dt * 0.17;
    if (rig.spine) rig.spine.rotation.z = Math.sin(time * 1.5 + outer.position.x) * 0.016;
    if (rig.head) rig.head.rotation.y = Math.sin(time * 0.9) * 0.055;
    if (rig.leftArm) rig.leftArm.rotation.z = -0.08 + Math.sin(time * 2 + outer.position.z) * 0.07;
    if (rig.rightArm) rig.rightArm.rotation.z = 0.08 - Math.sin(time * 2 + outer.position.z) * 0.07;
    if (artifactRef.current) {
      artifactRef.current.position.set(Math.cos(time * 1.45) * 0.95, 1.65 + Math.sin(time * 2) * 0.14, Math.sin(time * 1.45) * 0.95);
      artifactRef.current.rotation.y += dt;
    }
    if (petRef.current) {
      petRef.current.position.set(-0.9 + Math.sin(time * 1.3) * 0.14, 0.36 + Math.sin(time * 2.2) * 0.08, -0.8);
      petRef.current.rotation.y = -0.32 + Math.sin(time) * 0.14;
    }
    if (magicRef.current) magicRef.current.rotation.y += dt * 0.25;
    // Material swap on the actual GLTF skeletal body while the server shield lasts.
    const shieldActive = Boolean(player.shieldUntil && player.shieldUntil > Date.now());
    for (const material of rig.ownedMaterials) {
      if (material instanceof THREE.MeshStandardMaterial && material.name === 'RobeMaterial') {
        material.color.set(shieldActive ? '#d8ae5e' : player.appearance.robeColor === 'jade' ? '#4f9790' : player.appearance.robeColor === 'ember' ? '#a36763' : '#e3decf');
        material.emissive.set(shieldActive ? '#986223' : '#000000');
        material.emissiveIntensity = shieldActive ? 0.95 : 0;
      }
    }
    if (auraRef.current) auraRef.current.uniforms.uTime.value = time;
  });

  const immortal = player.equipment.weapon === 'immortal_sword';
  return (
    <group ref={groupRef ?? internalRef} position={[player.position.x, player.position.y, player.position.z]}
      rotation={[0, player.rotation, 0]} scale={player.isAdmin ? 1.2 : 1}>
      <primitive object={rig.model} />
      {player.path === 'kiem' && <SwordHalo />}
      {player.root.tier === 'bien_di' && <>
        <mesh position={[0, 1.1, 0]} scale={[0.83, 1.35, 0.83]}>
          <sphereGeometry args={[1, 28, 18]} /><primitive object={aura} ref={auraRef} attach="material" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
          <ringGeometry args={[0.6, 0.76, 48]} />
          <meshBasicMaterial color={rootColor} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </>}
      {immortal && <pointLight color="#ff5246" intensity={3} distance={5} position={[0.5, 1.3, 0]} />}
      {player.equipment.artifact && <group ref={artifactRef}>
        <mesh castShadow><octahedronGeometry args={[0.19, 1]} /><meshStandardMaterial color="#99f4dd" emissive="#2dbea2" emissiveIntensity={2} metalness={0.6} roughness={0.15} /></mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.29, 0.012, 4, 24]} /><meshBasicMaterial color="#c2fce7" /></mesh>
      </group>}
      {player.equipment.pet && <group ref={petRef}>
        <mesh castShadow><sphereGeometry args={[0.3, 12, 9]} /><meshStandardMaterial color="#f0e6d5" /></mesh>
        <mesh position={[0, 0.21, 0.2]} castShadow><sphereGeometry args={[0.22, 12, 9]} /><meshStandardMaterial color="#fff0df" /></mesh>
        {[-0.15, 0.15].map((x) => <mesh key={x} position={[x, 0.43, 0.18]} rotation={[0, 0, x]}><coneGeometry args={[0.09, 0.23, 5]} /><meshStandardMaterial color="#eac7b4" /></mesh>)}
        <mesh position={[0.15, 0.09, -0.32]} rotation={[0.35, 0, -0.5]}><coneGeometry args={[0.11, 0.47, 7]} /><meshStandardMaterial color="#fff0df" /></mesh>
      </group>}
      {player.isAdmin && <group ref={magicRef} position={[0, 0.035, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.15, 1.22, 64]} />
          <meshBasicMaterial color="#ffc48b" transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.78, 0.81, 64]} />
          <meshBasicMaterial color="#ffa762" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
        {Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[Math.sin(i * Math.PI / 6) * 1, 0.01, Math.cos(i * Math.PI / 6) * 1]}
          rotation={[-Math.PI / 2, 0, i * Math.PI / 6]}>
          <planeGeometry args={[0.06, 0.19]} /><meshBasicMaterial color="#ffe0a8" side={THREE.DoubleSide} />
        </mesh>)}
        <pointLight color="#ff9b59" intensity={2.5} distance={7} position={[0, 1, 0]} />
      </group>}
    </group>
  );
}

export function Avatar(props: { player: PublicPlayer; local?: boolean; preview?: boolean; groupRef?: React.RefObject<THREE.Group | null> }) {
  return <Suspense fallback={null}><InnerAvatar {...props} local={props.local ?? false} preview={props.preview ?? false} /></Suspense>;
}

/** A capped instanced fire trail in WORLD space; it stays behind as an admin runs. */
export function AdminFireTrail({ player, avatarRef }: { player: PublicPlayer; avatarRef?: React.RefObject<THREE.Group | null> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const history = useRef<THREE.Vector3[]>(Array.from({ length: 24 }, () => new THREE.Vector3(player.position.x, 0.15, player.position.z)));
  const lastAt = useRef(0);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const time = clock.elapsedTime;
    if (time - lastAt.current > 0.07) {
      lastAt.current = time;
      const position = avatarRef?.current?.position ?? player.position;
      history.current.pop();
      history.current.unshift(new THREE.Vector3(position.x, 0.16, position.z));
    }
    history.current.forEach((position, index) => {
      dummy.position.set(position.x, position.y + Math.sin(time * 7 + index * 0.6) * 0.11, position.z);
      dummy.scale.setScalar(Math.max(0.005, (1 - index / 24) * (index % 3 === 0 ? 0.21 : 0.12)));
      dummy.updateMatrix();
      mesh.current?.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[undefined, undefined, 24]}>
    <dodecahedronGeometry args={[1, 0]} />
    <meshBasicMaterial color="#ff9255" transparent opacity={0.73} blending={THREE.AdditiveBlending} depthWrite={false} />
  </instancedMesh>;
}

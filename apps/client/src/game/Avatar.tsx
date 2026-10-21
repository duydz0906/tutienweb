import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { HumanAvatar, loadHumanPackage, type HumanPackage } from 'humanforge/human';
import * as THREE from 'three';
import { ELEMENT_COLOR, ITEMS, type PublicPlayer } from '@van-thuong/shared';
import { toHumanConfig } from './humanAppearance';
import { RealmAura } from './RealmAura';

// One cached human base for the whole scene, but each player gets an independent skeleton,
// fitted robe, face morphs, materials and equipment. Assets ship with the app (no CDN).
let packagePromise: Promise<HumanPackage> | undefined;
function humanPackage(): Promise<HumanPackage> {
  if (!packagePromise) {
    const base = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/human`;
    packagePromise = loadHumanPackage(base, {
      fetch: async (url) => {
        const res = await fetch(url);
        if (!res.ok || res.headers.get('content-type')?.includes('text/html'))
          throw new Error(`Thiếu tài nguyên nhân vật 3D: ${url}`);
        return res.arrayBuffer();
      },
    }).catch((error) => { packagePromise = undefined; throw error; });
  }
  return packagePromise;
}

function disposeMesh(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
  });
}

function makeWeapon(itemId: string): THREE.Group {
  const red = itemId === 'immortal_sword';
  const jade = itemId === 'jade_blade';
  const metal = new THREE.MeshStandardMaterial({ color: red ? '#f3675e' : jade ? '#a2fae3' : '#d9e5da', metalness: 0.65, roughness: 0.3, emissive: red ? '#ff2929' : jade ? '#3a8c75' : '#64766b', emissiveIntensity: red ? 2.2 : jade ? 0.7 : 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: '#d7ae72', metalness: 0.8, roughness: 0.25 });
  const weapon = new THREE.Group();
  weapon.name = 'WeaponSocketMesh';
  // The Mixamo palm's local +Y faces down/forward: the blade points at the ground,
  // rather than the oversized black cone that previously stuck through the shoulder.
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.047, red ? 0.85 : 0.72, 6), metal);
  blade.position.y = red ? 0.63 : 0.56;
  blade.castShadow = true;
  weapon.add(blade);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.31, 10), gold);
  grip.position.y = -0.07;
  weapon.add(grip);
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 12), gold);
  guard.position.y = 0.19;
  weapon.add(guard);
  weapon.rotation.z = -0.08;
  weapon.position.set(0, -0.04, 0);
  return weapon;
}

function addEquipment(human: HumanAvatar, player: PublicPlayer): () => void {
  const added: THREE.Object3D[] = [];
  const bone = (name: string) => human.bones.find((b) => b.name.endsWith(`:${name}`));
  const add = (parent: THREE.Object3D | undefined, object: THREE.Object3D) => {
    if (parent) { parent.add(object); added.push(object); }
    else disposeMesh(object);
  };
  if (player.equipment.weapon) add(bone('RightHand'), makeWeapon(player.equipment.weapon));
  if (player.equipment.head) {
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.017, 8, 36),
      new THREE.MeshStandardMaterial({ color: '#b4e7c8', metalness: 0.7, roughness: 0.25 }));
    crown.rotation.x = Math.PI / 2;
    crown.position.set(0, 0.12, 0);
    add(bone('Head'), crown);
  }
  if (player.equipment.shoulder) {
    for (const name of ['LeftArm', 'RightArm']) {
      const plate = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12),
        new THREE.MeshStandardMaterial({ color: '#ad9a7c', metalness: 0.68, roughness: 0.33 }));
      plate.scale.set(1.25, 0.52, 1.1);
      add(bone(name), plate);
    }
  }
  // Boots, ring, necklace and talisman used to be invisible even when equipped.
  if (player.equipment.boots) {
    for (const name of ['LeftFoot', 'RightFoot']) {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.28),
        new THREE.MeshStandardMaterial({ color: '#6f7f83', metalness: 0.35, roughness: 0.5 }));
      boot.position.set(0, 0.01, 0.05);
      add(bone(name), boot);
    }
  }
  if (player.equipment.ring) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 6, 18),
      new THREE.MeshStandardMaterial({ color: '#ffe6a6', metalness: 0.9, roughness: 0.2 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.02, 0);
    add(bone('RightHand'), ring);
  }
  if (player.equipment.necklace) {
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.007, 6, 24),
      new THREE.MeshStandardMaterial({ color: '#e9dcae', metalness: 0.8, roughness: 0.28 }));
    chain.rotation.x = Math.PI / 2.4;
    chain.position.set(0, 0.12, 0.06);
    add(bone('Spine2') ?? bone('Spine1'), chain);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.026),
      new THREE.MeshStandardMaterial({ color: '#8ff0d8', emissive: '#3ed3b4', emissiveIntensity: 0.6, roughness: 0.2 }));
    gem.position.set(0, 0.02, 0.1);
    add(bone('Spine2') ?? bone('Spine1'), gem);
  }
  if (player.equipment.talisman) {
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.16),
      new THREE.MeshStandardMaterial({ color: '#ffe9b0', emissive: '#e0b45c', emissiveIntensity: 0.35, side: THREE.DoubleSide }));
    tag.position.set(0.16, 0.14, -0.1);
    tag.rotation.z = 0.2;
    add(bone('Spine2') ?? bone('Spine1'), tag);
  }
  return () => { for (const object of added) { object.removeFromParent(); disposeMesh(object); } };
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

/**
 * Visible mount under the rider. The server owns altitude-less XZ movement; this mesh only adds
 * the flying look (and matches the mount item that allowed take-off).
 */
function FlightMount({ itemId }: { itemId: string }) {
  const style = ITEMS[itemId]?.flight?.style ?? 'cloud';
  const group = useRef<THREE.Group>(null);
  const wings = useRef<THREE.Group>(null);
  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime;
    if (group.current) group.current.position.y = Math.sin(time * 2.4) * 0.07;
    if (wings.current) wings.current.rotation.z = Math.sin(time * 5.2) * 0.35;
    if (style === 'wheel' && group.current) group.current.rotation.y += delta * 3.2;
  });
  return <group ref={group} position={[0, -0.08, 0]}>
    {style === 'sword' && <>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]} position={[0, -0.02, 0.18]}>
        <boxGeometry args={[0.12, 2.6, 0.3]} />
        <meshStandardMaterial color="#cdeee6" emissive="#4fd6c0" emissiveIntensity={1.2} metalness={0.85} roughness={0.18} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0.1]}>
        <planeGeometry args={[1.1, 3.2]} />
        <meshBasicMaterial color="#9df5e6" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <pointLight color="#8df2e0" intensity={1.8} distance={4} />
    </>}
    {style === 'disc' && <>
      <mesh castShadow rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.82, 0.9, 0.09, 32]} />
        <meshStandardMaterial color="#bfe6f2" emissive="#67b8d8" emissiveIntensity={0.8} metalness={0.7} roughness={0.24} />
      </mesh>
      {[0.55, 0.86].map((r) => <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
        <ringGeometry args={[r, r + 0.035, 48]} /><meshBasicMaterial color="#d8fbff" transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>)}
      <pointLight color="#8cd8f5" intensity={2} distance={5} position={[0, 0.4, 0]} />
    </>}
    {style === 'wheel' && <>
      {[-0.42, 0.42].map((x) => <mesh key={x} castShadow rotation={[Math.PI / 2, 0, 0]} position={[x, 0.12, 0]}>
        <torusGeometry args={[0.34, 0.07, 10, 28]} />
        <meshStandardMaterial color="#ffbe6d" emissive="#ff6a2a" emissiveIntensity={1.7} metalness={0.5} roughness={0.3} />
      </mesh>)}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[0.95, 28]} /><meshBasicMaterial color="#ff9a52" transparent opacity={0.26} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <pointLight color="#ff9a55" intensity={2.4} distance={5} position={[0, 0.35, 0]} />
    </>}
    {style === 'beast' && <group position={[0, 0.05, 0]}>
      <mesh castShadow position={[0, 0.08, 0]} scale={[0.78, 0.34, 1.25]}>
        <sphereGeometry args={[0.62, 16, 12]} /><meshStandardMaterial color="#eef7f1" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 0.34, 0.72]} scale={[0.36, 0.34, 0.5]}>
        <sphereGeometry args={[0.42, 14, 10]} /><meshStandardMaterial color="#f7fffb" roughness={0.66} />
      </mesh>
      <mesh position={[0, 0.34, 1.04]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.07, 0.3, 6]} /><meshStandardMaterial color="#e6bd86" />
      </mesh>
      <group ref={wings} position={[0, 0.26, -0.05]}>
        {[-1, 1].map((sign) => <mesh key={sign} castShadow position={[sign * 0.66, 0, 0]} rotation={[0, 0, sign * 0.28]} scale={[0.9, 0.08, 0.5]}>
          <sphereGeometry args={[0.62, 12, 8]} /><meshStandardMaterial color="#dcefe7" roughness={0.75} />
        </mesh>)}
      </group>
      <mesh position={[0, 0.18, -0.72]} rotation={[0.3, 0, 0]}>
        <coneGeometry args={[0.22, 0.7, 7]} /><meshStandardMaterial color="#d9eadf" />
      </mesh>
      <pointLight color="#c8f6e6" intensity={1.6} distance={4.5} position={[0, 0.5, 0]} />
    </group>}
    {style === 'cloud' && <>
      {[[-0.5, 0.02, 0.1, 0.52], [0.35, 0.06, -0.18, 0.6], [0, 0.12, 0.42, 0.45]].map(([x, y, z, scale], index) =>
        <mesh key={index} castShadow position={[x, y, z]} scale={[scale * 1.4, scale * 0.55, scale]}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color={index % 2 ? '#e9f4ef' : '#cfdfe9'} transparent opacity={0.92} roughness={0.9} flatShading />
        </mesh>)}
      <pointLight color="#e2f4ff" intensity={1.4} distance={4} position={[0, 0.4, 0]} />
    </>}
  </group>;
}

function InnerAvatar({ player, local, preview, groupRef, attackAt = 0, wandering = false, meditating = false, jumpAt = 0 }: {
  player: PublicPlayer; local: boolean; preview: boolean; attackAt?: number;
  wandering?: boolean; meditating?: boolean; groupRef?: React.RefObject<THREE.Group | null>;
  jumpAt?: number;
}) {
  const [human, setHuman] = useState<HumanAvatar | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const pose = useRef(new Map<string, THREE.Quaternion>());
  const configChain = useRef<Promise<void>>(Promise.resolve());
  const configRevision = useRef(0);
  const robeMaterials = useRef<THREE.MeshStandardMaterial[]>([]);
  const lastPosition = useRef(new THREE.Vector3(player.position.x, player.position.y, player.position.z));
  const lastMoveAt = useRef(0);
  const internalRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const artifactRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.ShaderMaterial>(null);
  const petRef = useRef<THREE.Group>(null);
  const magicRef = useRef<THREE.Group>(null);
  const rootColor = useMemo(() => new THREE.Color(ELEMENT_COLOR[player.root.elements[0]] || '#91e7cf'), [player.root.elements[0]]);
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
  }), [rootColor]);

  useEffect(() => {
    let active = true;
    let avatar: HumanAvatar | null = null;
    void humanPackage().then((pkg) => {
      if (!active) return;
      avatar = new HumanAvatar(pkg);
      // The local character/creator get 2K CC0 skin detail and robe normal maps; remote actors stay 1K.
      avatar.textureSize = local || preview ? '2k' : '1k';
      avatar.normalMaps = true;
      avatar.anisotropy = local || preview ? 4 : 2;
      setHuman(avatar);
    }).catch((error) => {
      console.error('[avatar] CC0 human assets failed to load:', error);
      if (active) setLoadError(true);
    });
    return () => {
      active = false;
      // A model swap may still be loading when the preview is replaced by the game.
      // Let it finish before releasing its geometries and textures.
      void configChain.current.catch(() => {}).then(() => avatar?.dispose());
    };
  }, []);

  const appearanceKey = JSON.stringify([player.appearance, player.equipment.robe]);
  useEffect(() => {
    if (!human) return;
    let active = true;
    const revision = ++configRevision.current;
    // Avoid discarding in-flight meshes on a quick style change, and debounce
    // sliders so a drag does not trigger dozens of expensive face reshapes.
    const timer = window.setTimeout(() => {
      configChain.current = configChain.current.catch(() => {}).then(async () => {
        if (!active || revision !== configRevision.current) return;
        // Equipped sect robes replace the original garment's PBR tint/material.
        const visual = player.equipment.robe === 'moon_robe' ? { ...player.appearance, robeColor: 'lilac' as const } : player.appearance;
        await human.setConfig(toHumanConfig(player.gender, visual));
        if (!active || revision !== configRevision.current) return;
        human.group.traverse((object) => {
          if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
        });
        pose.current = new Map(human.bones.map((b) => [b.name, b.quaternion.clone()]));
        robeMaterials.current = [];
        human.group.traverse((o) => {
          if (o instanceof THREE.Mesh && o.name.startsWith('clothes-') && !o.name.includes('shoes') && o.material instanceof THREE.MeshStandardMaterial)
            robeMaterials.current.push(o.material);
        });
        setLoadError(false);
        setReady(true);
      }).catch((error) => {
        if (active) {
          console.error('[avatar] CC0 human configuration failed:', error);
          setLoadError(true);
        }
      });
    }, 120);
    return () => { active = false; window.clearTimeout(timer); };
  }, [human, player.gender, appearanceKey]);
  useEffect(() => human ? addEquipment(human, player) : undefined, [human, player.equipment.weapon, player.equipment.head, player.equipment.shoulder,
    player.equipment.boots, player.equipment.ring, player.equipment.necklace, player.equipment.talisman, player.equipment.robe]);
  useEffect(() => () => { aura.dispose(); }, [aura]);

  const flying = Boolean(player.flying) && !preview;
  const mountId = player.equipment.mount;
  const altitude = mountId ? ITEMS[mountId]?.flight?.altitude ?? 1.9 : 1.9;
  const jumpStart = useRef(0);
  // Space is a visual hop only: the server keeps the ground-plane position for collision.
  const JUMP_MS = 560;
  const JUMP_HEIGHT = 1.15;
  useEffect(() => { if (jumpAt) jumpStart.current = performance.now(); }, [jumpAt]);
  useFrame(({ clock }, dt) => {
    const time = clock.elapsedTime;
    const outer = groupRef?.current ?? internalRef.current;
    if (!outer) return;
    const jumpLeft = jumpStart.current ? performance.now() - jumpStart.current : JUMP_MS;
    const jumpProgress = jumpLeft < JUMP_MS ? jumpLeft / JUMP_MS : 1;
    const jumpHeight = !flying && !meditating && !preview && jumpProgress < 1
      ? Math.sin(jumpProgress * Math.PI) * JUMP_HEIGHT : 0;
    // Altitude is visual only: the server position stays on the ground plane for collision.
    if (bodyRef.current) bodyRef.current.position.y = flying ? altitude + Math.sin(time * 2.1) * 0.09 : jumpHeight;
    if (!local && !preview) {
      outer.position.lerp(new THREE.Vector3(player.position.x, player.position.y, player.position.z), Math.min(1, dt * 9));
      outer.rotation.y += Math.atan2(Math.sin(player.rotation - outer.rotation.y), Math.cos(player.rotation - outer.rotation.y)) * Math.min(1, dt * 8);
    }
    if (preview) outer.rotation.y = Math.sin(time * 0.23) * 0.13;
    if (human && ready) {
      if (outer.position.distanceTo(lastPosition.current) > 0.002) lastMoveAt.current = time;
      lastPosition.current.copy(outer.position);
      const walking = !preview && !meditating && !flying && (wandering || time - lastMoveAt.current < 0.22) ? 0.25 : 0;
      for (const [name, phase] of [['LeftUpLeg', 0], ['RightUpLeg', Math.PI], ['LeftArm', Math.PI], ['RightArm', 0]] as const) {
        const bone = human.bones.find((b) => b.name.endsWith(`:${name}`));
        const rest = bone && pose.current.get(bone.name);
        if (bone && rest) {
          bone.quaternion.copy(rest);
          const restArm = name === 'LeftArm' ? -0.65 : name === 'RightArm' ? 0.65 : 0;
          if (restArm) bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), restArm));
          if (walking) bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.sin(time * 8 + phase) * walking));
          if (meditating) bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0),
            name.endsWith('UpLeg') ? 1.12 : -0.55));
          if (name === 'RightArm' && attackAt && Date.now() - attackAt < 480) {
            const swing = Math.sin(Math.max(0, (Date.now() - attackAt) / 480) * Math.PI);
            bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -swing * 1.55));
          }
        }
      }
      if (meditating) for (const name of ['LeftLeg', 'RightLeg']) {
        const leg = human.bones.find((b) => b.name.endsWith(`:${name}`));
        const rest = leg && pose.current.get(leg.name);
        if (leg && rest) leg.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.7));
      }
      const head = human.bones.find((b) => b.name.endsWith(':Head'));
      const headRest = head && pose.current.get(head.name);
      if (head && headRest) head.quaternion.copy(headRest).multiply(new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), Math.sin(time * 0.9) * 0.035,
      ));
      const blink = Math.max(0, 1 - Math.abs((time % 4.3) - 0.14) / 0.09);
      human.setExpression('eyeBlinkLeft', blink);
      human.setExpression('eyeBlinkRight', blink);
      const shieldActive = Boolean(player.shieldUntil && player.shieldUntil > Date.now());
      for (const material of robeMaterials.current) {
        material.emissive.set(shieldActive ? '#986223' : '#000000');
        material.emissiveIntensity = shieldActive ? 0.9 : 0;
      }
    }
    if (artifactRef.current) {
      artifactRef.current.position.set(Math.cos(time * 1.45) * 0.95, 1.65 + Math.sin(time * 2) * 0.14, Math.sin(time * 1.45) * 0.95);
      artifactRef.current.rotation.y += dt;
    }
    if (petRef.current) {
      petRef.current.position.set(-0.9 + Math.sin(time * 1.3) * 0.14, 0.36 + Math.sin(time * 2.2) * 0.08, -0.8);
      petRef.current.rotation.y = -0.32 + Math.sin(time) * 0.14;
    }
    if (magicRef.current) magicRef.current.rotation.y += dt * 0.25;
    if (auraRef.current) {
      auraRef.current.uniforms.uTime.value = time;
      if (player.devMode) auraRef.current.uniforms.uColor.value.setHSL((time * 0.13) % 1, 0.82, 0.74);
    }
  });

  const immortal = player.equipment.weapon === 'immortal_sword';
  return <group ref={groupRef ?? internalRef} position={[player.position.x, player.position.y, player.position.z]}
    rotation={[0, player.rotation, 0]} scale={player.devMode ? 1.2 : 1}>
    <group ref={bodyRef}>
    {flying && mountId && <FlightMount itemId={mountId} />}
    {human && ready && <primitive object={human.group} position={meditating ? [0, -0.51, 0] : [0, 0, 0]} />}
    {loadError && preview && <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.4, 0.43, 32]} /><meshBasicMaterial color="#ff847e" />
    </mesh>}
    {player.path === 'kiem' && <SwordHalo />}
    {player.realm >= 2 && <RealmAura realm={player.realm} />}
    {(player.root.tier === 'bien_di' || player.devMode) && <>
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
    {player.devMode && <group ref={magicRef} position={[0, 0.08, 0]}>
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
  </group>;
}

export function Avatar(props: { player: PublicPlayer; local?: boolean; preview?: boolean; attackAt?: number;
  wandering?: boolean; meditating?: boolean; groupRef?: React.RefObject<THREE.Group | null>; jumpAt?: number }) {
  return <InnerAvatar {...props} local={props.local ?? false} preview={props.preview ?? false} />;
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

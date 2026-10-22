import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ELEMENT_COLOR, ITEMS, normalizeAppearance, type PublicPlayer } from '@van-thuong/shared';
import { RealmAura } from './RealmAura';
import { RIG, buildCultivator, type CultivatorLook } from './sculpt/cultivator';
import { buildMountModel, buildPetModel } from './sculpt/beasts';
import { buildArtifactModel, buildBootModel, buildCrownModel, buildNecklaceModel, buildPauldronModel,
  buildRingModel, buildTalismanModel, buildWeaponModel } from './sculpt/gear';
import { clonePrototype } from './sculpt/cache';

/** Where each flying style should sit under the rider's feet. */
const MOUNT_OFFSET: Record<string, number> = {
  flying_sword: -0.08, cloud_disc: -0.12, wind_fire_wheel: -0.14,
  cloud_crane_mount: -1.32, jade_stag_mount: -1.1, ink_cloud: -0.26, spirit_cloud: -0.26,
};

type RigNodes = Partial<Record<keyof typeof RIG, THREE.Object3D>>;

function resolveRig(model: THREE.Object3D): RigNodes {
  const nodes: RigNodes = {};
  for (const [key, name] of Object.entries(RIG) as [keyof typeof RIG, string][]) {
    const node = model.getObjectByName(name);
    if (node) nodes[key] = node;
  }
  return nodes;
}

function appearanceKey(player: PublicPlayer, quality: number, robeOverride?: string, flavor = ''): string {
  // Old saves (and packets from older clients) may predate the appearance block entirely.
  const a = normalizeAppearance(player.appearance);
  return [player.gender, a.hair, a.hairColor, a.face, a.skinTone, robeOverride ?? a.robeColor,
    a.height.toFixed(2), a.build.toFixed(2), quality, flavor].join('|');
}

/** One sculpted, fully procedural cultivator per unique look, cloned for every actor. */
type Flavor = { beard?: boolean; staff?: boolean };

function useCultivator(player: PublicPlayer, local: boolean, preview: boolean, flavor: Flavor = {}): {
  model: THREE.Group | null; rig: RefObject<RigNodes>;
} {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const rig = useRef<RigNodes>({});
  const quality = local || preview ? 1 : 0.55;
  const appearance = normalizeAppearance(player.appearance);
  const robeOverride = player.equipment.robe === 'moon_robe' ? 'lilac' : undefined;
  const key = appearanceKey(player, quality, robeOverride, `${flavor.beard ? 'b' : ''}${flavor.staff ? 's' : ''}`);
  const look = useMemo<CultivatorLook>(() => ({
    gender: player.gender,
    hair: appearance.hair,
    hairColor: appearance.hairColor,
    face: appearance.face,
    skinTone: appearance.skinTone,
    robeColor: robeOverride ?? appearance.robeColor,
    height: appearance.height,
    build: appearance.build,
    beard: flavor.beard,
    staff: flavor.staff,
    quality,
  }), [key]);

  useEffect(() => {
    const sculpted = clonePrototype(`cultivator:${key}`, () => buildCultivator(look));
    rig.current = resolveRig(sculpted);
    setModel(sculpted);
    return () => setModel(null);
  }, [key]);

  return { model, rig };
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
    <coneGeometry args={[0.058, 0.52, 8]} />
    <meshStandardMaterial color="#a7e7d9" emissive="#6ddcc2" emissiveIntensity={0.75} metalness={0.75} roughness={0.24} />
  </instancedMesh>;
}

function InnerAvatar({ player, local, preview, groupRef, attackAt = 0, wandering = false, meditating = false,
  beard = false, staff = false }: {
  player: PublicPlayer; local: boolean; preview: boolean; attackAt?: number;
  wandering?: boolean; meditating?: boolean; groupRef?: React.RefObject<THREE.Group | null>;
  beard?: boolean; staff?: boolean;
}) {
  const { model, rig } = useCultivator(player, local, preview, { beard, staff });
  const internalRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const artifactRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.ShaderMaterial>(null);
  const magicRef = useRef<THREE.Group>(null);
  const mountRef = useRef<THREE.Group>(null);
  const petRef = useRef<THREE.Group>(null);
  const phase = useRef(0);
  const lastPosition = useRef(new THREE.Vector3(player.position.x, player.position.y, player.position.z));
  const lastMoveAt = useRef(0);
  const [mount, setMount] = useState<THREE.Group | null>(null);
  const [pet, setPet] = useState<THREE.Group | null>(null);

  const artifact = useArtifactModel();
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
  useEffect(() => () => { aura.dispose(); }, [aura]);

  const flying = Boolean(player.flying) && !preview;
  const mountId = player.equipment.mount;
  const altitude = mountId ? ITEMS[mountId]?.flight?.altitude ?? 1.9 : 1.9;
  const petId = player.equipment.pet;
  const quality = local || preview ? 1 : 0.55;

  // Equipment is sculpted once per piece and mounted on the rig sockets.
  useEffect(() => {
    if (!model) return;
    const gear: THREE.Object3D[] = [];
    const attach = (parent: THREE.Object3D | undefined, child: THREE.Object3D, position?: [number, number, number]) => {
      if (!parent) return;
      if (position) child.position.set(...position);
      parent.add(child);
      gear.push(child);
    };
    // The sculpted body already carries a bare jade blade; an equipped weapon replaces it in the same grip.
    const defaultSword = model.getObjectByName('cultivator-sword');
    if (player.equipment.weapon && defaultSword) defaultSword.visible = false;
    if (player.equipment.weapon) {
      const weapon = buildWeaponModel(player.equipment.weapon, quality);
      weapon.position.set(0, -0.1, 0.02);
      weapon.rotation.set(0.12, 0, -0.22);
      attach(rig.current.handR, weapon);
    }
    if (player.equipment.head) attach(rig.current.head, buildCrownModel(quality), [0, 0.12, 0]);
    if (player.equipment.shoulder) {
      attach(rig.current.armL, buildPauldronModel(-1, quality), [0.02, 0.02, 0]);
      attach(rig.current.armR, buildPauldronModel(1, quality), [0.02, 0.02, 0]);
    }
    if (player.equipment.boots) {
      const left = buildBootModel(-1, quality), right = buildBootModel(1, quality);
      left.scale.setScalar(1.06); right.scale.setScalar(1.06);
      attach(rig.current.legL, left, [0, -1.3, 0.02]);
      attach(rig.current.legR, right, [0, -1.3, 0.02]);
    }
    if (player.equipment.ring) attach(rig.current.handR, buildRingModel(quality), [0, -0.16, 0.06]);
    if (player.equipment.necklace) attach(rig.current.torso, buildNecklaceModel(quality), [0, 0.62, 0.06]);
    if (player.equipment.talisman) attach(rig.current.torso, buildTalismanModel(quality));
    return () => {
      for (const child of gear) child.removeFromParent();
      if (defaultSword) defaultSword.visible = true;
    };
  }, [model, player.equipment.weapon, player.equipment.head, player.equipment.shoulder, player.equipment.boots,
    player.equipment.ring, player.equipment.necklace, player.equipment.talisman, quality]);

  useEffect(() => {
    if (!flying || !mountId) { setMount(null); return; }
    setMount(clonePrototype(`mount:${mountId}:${quality}`, () => buildMountModel(mountId, quality)));
  }, [flying, mountId, quality]);

  useEffect(() => {
    if (!petId) { setPet(null); return; }
    setPet(clonePrototype(`pet:${petId}:${quality}`, () => buildPetModel(petId, quality)));
  }, [petId, quality]);

  useFrame(({ clock }, dt) => {
    const time = clock.elapsedTime;
    const outer = groupRef?.current ?? internalRef.current;
    if (!outer) return;
    // Altitude is visual only: the server position stays on the ground plane for collision.
    if (bodyRef.current) bodyRef.current.position.y = flying ? altitude + Math.sin(time * 2.1) * 0.09 : 0;
    if (!local && !preview) {
      outer.position.lerp(new THREE.Vector3(player.position.x, player.position.y, player.position.z), Math.min(1, dt * 9));
      outer.rotation.y += Math.atan2(Math.sin(player.rotation - outer.rotation.y), Math.cos(player.rotation - outer.rotation.y)) * Math.min(1, dt * 8);
    }
    if (preview) outer.rotation.y = Math.sin(time * 0.23) * 0.13;

    const moved = outer.position.distanceTo(lastPosition.current) > 0.002;
    if (moved) lastMoveAt.current = time;
    lastPosition.current.copy(outer.position);

    const nodes = rig.current;
    if (model) {
      const walking = !preview && !meditating && !flying && (wandering || time - lastMoveAt.current < 0.24);
      phase.current += dt * (walking ? 9 : 2.2);
      const swing = walking ? Math.sin(phase.current) * 0.5 : 0;
      if (nodes.legL) nodes.legL.rotation.x = swing;
      if (nodes.legR) nodes.legR.rotation.x = -swing;
      if (nodes.armL) {
        nodes.armL.rotation.x = -swing * 0.7;
        nodes.armL.rotation.z = Math.sin(time * 1.4) * 0.02;
      }
      if (nodes.armR) {
        nodes.armR.rotation.x = swing * 0.7;
        nodes.armR.rotation.z = -Math.sin(time * 1.4) * 0.02;
      }
      if (meditating && nodes.legL && nodes.legR) {
        nodes.legL.rotation.set(-1.3, 0, 0.45);
        nodes.legR.rotation.set(-1.3, 0, -0.45);
        if (nodes.armL) nodes.armL.rotation.set(-0.55, 0, 0.3);
        if (nodes.armR) nodes.armR.rotation.set(-0.55, 0, -0.3);
      }
      // A sword swing reads from the shoulder, so the attack pose overrides the walk cycle.
      if (!meditating && attackAt && Date.now() - attackAt < 480) {
        const progress = Math.max(0, (Date.now() - attackAt) / 480);
        const arc = Math.sin(progress * Math.PI);
        if (nodes.armR) nodes.armR.rotation.set(-arc * 1.9, 0, -arc * 0.25);
        if (nodes.torso) nodes.torso.rotation.y = -arc * 0.35;
      } else if (nodes.torso) {
        nodes.torso.rotation.y += (0 - nodes.torso.rotation.y) * Math.min(1, dt * 6);
      }
      if (nodes.head) {
        nodes.head.rotation.y = Math.sin(time * 0.7) * 0.14;
        nodes.head.rotation.x = Math.sin(time * 0.9) * 0.04;
      }
      if (nodes.torso && !meditating) nodes.torso.rotation.z = Math.sin(time * 1.6) * 0.012;
      if (nodes.skirt) nodes.skirt.rotation.z = Math.sin(phase.current) * (walking ? 0.03 : 0.008);
      if (nodes.ribbonL) nodes.ribbonL.rotation.z = Math.sin(time * 1.5) * 0.05;
      if (nodes.ribbonR) nodes.ribbonR.rotation.z = Math.cos(time * 1.5) * 0.05;
      if (nodes.hips) nodes.hips.position.y = 1.4 + (walking ? Math.abs(Math.sin(phase.current)) * 0.02 : 0);
    }

    if (mountRef.current) {
      mountRef.current.position.y = (MOUNT_OFFSET[mountId ?? ''] ?? -0.12) + Math.sin(time * 2.2) * 0.05;
      if (mountId === 'wind_fire_wheel' || mountId === 'cloud_disc') mountRef.current.rotation.y += dt * 0.6;
    }
    if (petRef.current) {
      petRef.current.position.set(-0.85 + Math.sin(time * 1.1) * 0.12, 0.02 + Math.sin(time * 2.2) * 0.04, -0.72);
      petRef.current.rotation.y = 0.35 + Math.sin(time * 0.9) * 0.18;
    }
    if (artifactRef.current) {
      artifactRef.current.position.set(Math.cos(time * 1.45) * 0.95, 1.65 + Math.sin(time * 2) * 0.14, Math.sin(time * 1.45) * 0.95);
      artifactRef.current.rotation.y += dt;
    }
    if (magicRef.current) magicRef.current.rotation.y += dt * 0.25;
    if (auraRef.current) {
      auraRef.current.uniforms.uTime.value = time;
      if (player.devMode) auraRef.current.uniforms.uColor.value.setHSL((time * 0.13) % 1, 0.82, 0.74);
    }
  });

  const immortal = player.equipment.weapon === 'immortal_sword';
  const shieldActive = Boolean(player.shieldUntil && player.shieldUntil > Date.now());
  return <group ref={groupRef ?? internalRef} position={[player.position.x, player.position.y, player.position.z]}
    rotation={[0, player.rotation, 0]} scale={player.devMode ? 1.2 : 1}>
    <group ref={bodyRef}>
    {mount && <group ref={mountRef}><primitive object={mount} /></group>}
    {model && <primitive object={model} position={meditating ? [0, -0.28, 0] : [0, 0, 0]} />}
    {shieldActive && <mesh position={[0, 1.05, 0]} scale={[0.95, 1.25, 0.95]}>
      <sphereGeometry args={[0.95, 28, 20]} />
      <meshBasicMaterial color="#ffcf7a" transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
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
      <primitive object={artifact} />
    </group>}
    {pet && <group ref={petRef}><primitive object={pet} /></group>}
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

let artifactPrototype: THREE.Group | null = null;
function useArtifactModel(): THREE.Group {
  const model = useMemo(() => {
    artifactPrototype ??= buildArtifactModel(1);
    return artifactPrototype.clone(true);
  }, []);
  return model;
}

export function Avatar(props: { player: PublicPlayer; local?: boolean; preview?: boolean; attackAt?: number;
  wandering?: boolean; meditating?: boolean; groupRef?: React.RefObject<THREE.Group | null>;
  beard?: boolean; staff?: boolean }) {
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

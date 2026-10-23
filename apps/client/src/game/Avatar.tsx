import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ELEMENT_COLOR, ITEMS, normalizeAppearance, type PublicPlayer } from '@van-thuong/shared';
import { RealmAura } from './RealmAura';
import { REMOTE_EXTRA_MS, playerTrack } from './interpolation';
import { RIG, buildCultivator, type CultivatorLook } from './sculpt/cultivator';
import { buildMountModel, buildPetModel } from './sculpt/beasts';
import { humanLookKey, instantiateHuman, rigOf, type HumanRig } from './human/character';
import { applyHumanPose } from './human/animation';
import { buildArtifactModel } from './sculpt/gear';
import { mountEquipment, weaponHand } from './equipment';
import { animateCreature, creatureKindTraits } from './creatures';
import { clonePrototype } from './sculpt/cache';

/**
 * Phones render at 1K skin/hair textures and skip the fine facial proxies (lashes, teeth), which
 * halves the download and is invisible on a small screen. Desktop keeps the 2K detail.
 */
const SMALL_SCREEN = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia('(max-width: 720px)').matches;
const avatarQuality = (local: boolean, preview: boolean): number => local || preview ? (SMALL_SCREEN ? 0.8 : 1) : 0.55;

/** Where each flying style should sit under the rider's feet. */
/**
 * Companions are sized up deliberately: a spirit beast is a mount-class creature in the genre, and at
 * the sculpt's natural scale it read as a toy next to the cultivator. The follower orbits wider so
 * the bigger body never clips the robe.
 */
const PET_SCALE = 1.75;
const ARTIFACT_SCALE = 1.35;
const PET_ORBIT = { x: -1.25, z: -0.95 };

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

/** One human (real mesh) or sculpted cultivator per unique look, cloned for every actor. */
type Flavor = { beard?: boolean; staff?: boolean };
type ModelKind = 'human' | 'sculpt';

function useCultivator(player: PublicPlayer, local: boolean, preview: boolean, flavor: Flavor = {}): {
  model: THREE.Group | null; rig: RefObject<RigNodes>; human: RefObject<HumanRig | null>; kind: ModelKind;
} {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [kind, setKind] = useState<ModelKind>('sculpt');
  const rig = useRef<RigNodes>({});
  const human = useRef<HumanRig | null>(null);
  const quality = avatarQuality(local, preview);
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
    let cancelled = false;
    // The real-human mesh is the default. The sculpted body is the fallback: a slow or blocked
    // download must never leave the player invisible, and it keeps Node tests/offline play working.
    const useSculpted = () => {
      const sculpted = clonePrototype(`cultivator:${key}`, () => buildCultivator(look));
      if (cancelled) return;
      human.current = null;
      rig.current = resolveRig(sculpted);
      setKind('sculpt');
      setModel(sculpted);
    };
    const humanLook = {
      gender: look.gender, hair: look.hair, hairColor: look.hairColor, face: look.face,
      skinTone: look.skinTone, robeColor: look.robeColor, height: look.height, build: look.build,
      // Cloth shoes are part of the human; a boot item replaces them on the ankles.
      shoes: !player.equipment.boots,
      beard: flavor.beard, staff: flavor.staff,
    } as const;
    void instantiateHuman(humanLookKey(humanLook, quality), humanLook, quality).then((character) => {
      if (cancelled) return;
      const humanRig = rigOf(character);
      if (!humanRig.bones.head || !humanRig.bones.handR) { useSculpted(); return; }
      human.current = humanRig;
      rig.current = resolveRig(character);
      setKind('human');
      setModel(character);
    }).catch((error) => {
      if (import.meta.env.DEV) console.warn('[avatar] Không tải được mô hình người thật, dùng mô hình dự phòng:', error);
      useSculpted();
    });
    return () => { cancelled = true; setModel(null); };
  }, [key, player.equipment.boots]);

  return { model, rig, human, kind };
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

function InnerAvatar({ player, local, preview, groupRef, attackAt = 0, castAt = 0, wandering = false, meditating = false,
  beard = false, staff = false, intent }: {
  player: PublicPlayer; local: boolean; preview: boolean; attackAt?: number; castAt?: number;
  wandering?: boolean; meditating?: boolean; groupRef?: React.RefObject<THREE.Group | null>;
  beard?: boolean; staff?: boolean;
  /** Steering input of the local player (0 = keys released). Remote actors are measured instead. */
  intent?: () => number;
}) {
  const { model, rig, human, kind } = useCultivator(player, local, preview, { beard, staff });
  const internalRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const artifactRef = useRef<THREE.Group>(null);
  const auraRef = useRef<THREE.ShaderMaterial>(null);
  const magicRef = useRef<THREE.Group>(null);
  const mountRef = useRef<THREE.Group>(null);
  const petRef = useRef<THREE.Group>(null);
  const phase = useRef(0);
  const lastPosition = useRef(new THREE.Vector3(player.position.x, player.position.y, player.position.z));
  /** Smoothed walking speed in metres/second, measured from the actor's own displacement. */
  const speed = useRef(0);
  /** 0 on foot, 1 in the air. Fades the hover bob and the mount in and out instead of toggling. */
  const airborne = useRef(0);
  const [mount, setMount] = useState<THREE.Group | null>(null);
  const [pet, setPet] = useState<THREE.Group | null>(null);

  // The transform is written once, on mount. It used to be bound to props (`player.position`), which
  // meant every character packet — once a second — re-applied a second-old position and rotation on
  // top of the predicted body. From here on the engine owns the local body and the interpolation
  // track owns everybody else's.
  useEffect(() => {
    const outer = groupRef?.current ?? internalRef.current;
    if (!outer) return;
    outer.position.set(player.position.x, player.position.y, player.position.z);
    outer.rotation.set(0, player.rotation, 0);
    // Deliberately mount-only: later packets are not allowed to move the body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const quality = avatarQuality(local, preview);

  // Equipment is sculpted once per piece and mounted on measured sockets (see equipment.ts).
  useEffect(() => {
    if (!model) return;
    const groups = mountEquipment(model, kind, player.equipment, quality);
    return () => { for (const group of groups) group.removeFromParent(); };
  }, [model, kind, player.equipment.weapon, player.equipment.head, player.equipment.shoulder, player.equipment.boots,
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
    // Altitude is visual only and owned by the engine's flight altitude on the outer group; the body
    // keeps just the slow hover bob, otherwise a rider at 900 m would be drawn at 1800 m. The bob
    // amplitude follows `airborne`, so touching down settles the body instead of cutting the sway.
    airborne.current += ((flying ? 1 : 0) - airborne.current) * Math.min(1, dt * 4.5);
    if (bodyRef.current) bodyRef.current.position.y = Math.sin(time * 2.1) * 0.09 * airborne.current;
    if (!local && !preview) {
      // Another player's packets arrive at 10 Hz; drawing them straight made the whole body (and its
      // gait) jump ten times a second. Their track answers with an interpolated position instead,
      // and it is seeded here in case this avatar exists before the first snapshot that contains them.
      const track = playerTrack(player.id);
      if (!track.size) track.reset(performance.now(), player.position.x, player.position.z);
      const path = track.at(performance.now() - track.delayMs - REMOTE_EXTRA_MS);
      outer.position.x = path?.x ?? player.position.x;
      outer.position.z = path?.z ?? player.position.z;
      outer.position.y = player.position.y;
      outer.rotation.y += Math.atan2(Math.sin(player.rotation - outer.rotation.y), Math.cos(player.rotation - outer.rotation.y)) * Math.min(1, dt * 8);
    }
    if (preview) outer.rotation.y = Math.sin(time * 0.23) * 0.13;

    // The gait is driven by the distance actually travelled this frame, not by a "moved recently"
    // timer. Two things fall out of that: standing still leaves the legs perfectly still (the old
    // timer kept them swinging for a quarter second after every stop, and any reconciliation
    // nudge re-triggered it), and the stride is foot-locked — the phase advances 1.9 rad per metre
    // (a 3.3 m stride, the length of this rig's step), so a slow walk takes short steps instead of
    // moon-walking at one fixed cadence.
    const step = Math.hypot(outer.position.x - lastPosition.current.x, outer.position.z - lastPosition.current.z);
    lastPosition.current.copy(outer.position);
    const live = Math.max(dt, 1 / 240);
    const measured = step / live;
    // The local body is reconciled against the server every frame, so after a key is released it
    // still slides a few centimetres. That correction must not be read as walking: a released key
    // means a still body, and the legs freeze in about a tenth of a second. A snap (teleport, zone
    // change) is never a sprint either.
    const input = local && intent ? Math.min(1, Math.max(0, intent())) : 1;
    const target = step > 1.5 || input < 0.02 ? 0 : measured;
    speed.current += (target - speed.current) * Math.min(1, dt * (target > speed.current ? 12 : 26));
    if (speed.current < 0.05) speed.current = 0;

    const nodes = rig.current;
    // Idle: no leg motion at all. Moving: the cycle speed follows the body, capped at a run.
    const cadence = preview ? 0 : Math.min(1, speed.current / 3.2);
    const walking = !preview && !meditating && !flying && (wandering || cadence > 0.02);
    // The stride advances with the *smoothed* speed rather than the raw per-frame displacement: a
    // reconciliation nudge is not a step, and raw distance made the gait stutter on packet edges.
    if (model) phase.current += wandering ? dt * 6.2 : speed.current * dt * 1.9;
    if (kind === 'human' && human.current) {
      // Real skeleton: poses are deltas from the mixamo bind pose, plus a pelvis drop for the gait.
      // Both one-shots run 0 → 1 so the pose curves read as wind-up then follow-through.
      const swingProgress = attackAt ? Math.min(1, Math.max(0, (Date.now() - attackAt) / 480)) : 0;
      const castProgress = castAt ? Math.min(1, Math.max(0, (Date.now() - castAt) / 760)) : 0;
      const drop = applyHumanPose(human.current, {
        // `walk` is the real speed fraction, so a standstill is exactly zero and a sprint is full.
        time, walk: preview ? 0 : wandering ? Math.max(0.6, cadence) : cadence, phase: phase.current,
        flying, meditating, attack: swingProgress > 0 && swingProgress < 1 ? swingProgress : 0,
        cast: castProgress > 0 && castProgress < 1 ? castProgress : 0,
        // A held weapon closes that hand into a fist around the grip socket.
        grip: weaponHand(kind, player.equipment),
      });
      if (modelRef.current) modelRef.current.position.y = drop;
    } else if (modelRef.current) {
      modelRef.current.position.y = meditating ? -0.28 : 0;
    }
    if (model && kind === 'sculpt') {
      const swing = walking ? Math.sin(phase.current) * 0.5 * Math.max(0.35, cadence) : 0;
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
      // The mount banks and dips with the flight instead of hanging rigid under the feet, and it
      // grows into place on take-off (the server can flip `flying` between two frames).
      const settle = Math.min(1, Math.max(0.001, airborne.current));
      mountRef.current.scale.setScalar(0.72 + 0.28 * settle);
      mountRef.current.rotation.z = Math.sin(time * 1.5) * (0.03 + 0.07 * settle);
      mountRef.current.rotation.x = Math.sin(time * 1.1 + 0.6) * (0.02 + 0.04 * settle);
    }
    if (petRef.current) {
      petRef.current.position.set(PET_ORBIT.x + Math.sin(time * 1.1) * 0.12, 0.02 + Math.sin(time * 2.2) * 0.04, PET_ORBIT.z);
      petRef.current.rotation.y = 0.35 + Math.sin(time * 0.9) * 0.18;
    }
    // Living companions: legs step, wings beat, tails and heads follow the clock.
    if (mount && mountRef.current?.children[0]) {
      animateCreature(mountRef.current.children[0], { time, moving: flying ? 0.75 : 0.2,
        tempo: flying ? 1.25 : 1, ...creatureKindTraits(mountId ?? '') });
    }
    if (pet) animateCreature(pet, { time, moving: 0.35, ...creatureKindTraits(petId ?? '') });
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
  return <group ref={groupRef ?? internalRef} scale={player.devMode ? 1.2 : 1}>
    <group ref={bodyRef}>
    {mount && <group ref={mountRef}><primitive object={mount} /></group>}
    {model && <group ref={modelRef}><primitive object={model} /></group>}
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
    {player.equipment.artifact && <group ref={artifactRef} scale={ARTIFACT_SCALE}>
      <primitive object={artifact} />
    </group>}
    {pet && <group ref={petRef} scale={PET_SCALE}><primitive object={pet} /></group>}
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

export function Avatar(props: { player: PublicPlayer; local?: boolean; preview?: boolean; attackAt?: number; castAt?: number;
  wandering?: boolean; meditating?: boolean; groupRef?: React.RefObject<THREE.Group | null>;
  beard?: boolean; staff?: boolean; intent?: () => number }) {
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

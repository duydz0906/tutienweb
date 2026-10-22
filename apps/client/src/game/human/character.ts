import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HAIR_HEX, ROBE_HEX } from '../humanAppearance';
import { browserHumanSource, type HumanSource } from './source';
import { addFlavor, addRobeTrim } from './trim';

/**
 * Real humanoid cultivator built from the CC0 HumanForge assets in `public/human`.
 *
 * The body is a skinned 14.5k-vertex mesh with a 52-bone mixamo skeleton; hair, eyes, brows,
 * lashes, teeth and robes are separate proxy meshes that are re-bound onto that same skeleton.
 * Nothing here is procedural: this is the "người thật" model the game plays with.
 *
 * Three details of the asset format matter:
 *  1. Positions are quantised int16 (`KHR_mesh_quantization`), so the geometry bounding box is
 *     meaningless — the mesh transform is carried by inverse bind matrices. We therefore disable
 *     frustum culling on every skinned mesh instead of trusting the bounds.
 *  2. All 52 bones share one `A` matrix at rest (`boneWorld * boneInverse`) that maps the packed
 *     vertex space to metres. A proxy is bound with `A⁻¹ · nodeMatrix`, which keeps it attached to
 *     the body when limbs move.
 *  3. Proxy vertices carry `_joints`/`_weights` already, so no weight transfer is needed.
 */

export type HumanLook = {
  gender: 'nam' | 'nu';
  /** Cloth shoes come with the human; a sculpted boot item replaces them. */
  shoes?: boolean;
  /** Elder NPC flavour props (the sculpted path had these too). */
  beard?: boolean;
  staff?: boolean;
  hair: 'long' | 'tied' | 'bob' | 'braid' | 'bun' | 'short' | 'cropped';
  hairColor: keyof typeof HAIR_HEX;
  face: 'oval' | 'round' | 'angular' | 'heart';
  skinTone: 'light' | 'warm' | 'bronze' | 'deep';
  robeColor: keyof typeof ROBE_HEX;
  height: number;
  build: number;
};

/** Socket names match `RIG` in sculpt/cultivator.ts so equipment code stays identical. */
export const HUMAN_SOCKETS = {
  hips: 'rig-hips', torso: 'rig-torso', head: 'rig-head',
  armL: 'rig-armL', armR: 'rig-armR', handL: 'rig-handL', handR: 'rig-handR',
  legL: 'rig-legL', legR: 'rig-legR', footL: 'rig-footL', footR: 'rig-footR',
  // Sword/hilt frames inside the closed fist (see `addGripFrames`). Only the real rig has them:
  // the sculpted body has no fingers, so its weapon keeps a fixed hand offset.
  gripL: 'rig-gripL', gripR: 'rig-gripR',
  // A ring hangs off a finger, not the wrist.
  ringR: 'rig-ringR',
} as const;
export type HumanSocket = keyof typeof HUMAN_SOCKETS;

export type HumanBone =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'armL' | 'armR' | 'foreArmL' | 'foreArmR' | 'handL' | 'handR'
  | 'legL' | 'legR' | 'kneeL' | 'kneeR' | 'footL' | 'footR';

const BONES: Record<HumanBone, string> = {
  hips: 'hips', spine: 'spine', chest: 'spine2', neck: 'neck', head: 'head',
  armL: 'leftarm', armR: 'rightarm', foreArmL: 'leftforearm', foreArmR: 'rightforearm',
  handL: 'lefthand', handR: 'righthand',
  legL: 'leftupleg', legR: 'rightupleg', kneeL: 'leftleg', kneeR: 'rightleg',
  footL: 'leftfoot', footR: 'rightfoot',
};

/** Which bone each equipment socket hangs from (the ring finger is picked by name). */
const SOCKET_BONE: Record<Exclude<HumanSocket, 'ringR'>, HumanBone> = {
  hips: 'hips', torso: 'chest', head: 'head',
  armL: 'armL', armR: 'armR', handL: 'handL', handR: 'handR',
  legL: 'legL', legR: 'legR', footL: 'footL', footR: 'footR',
  gripL: 'handL', gripR: 'handR',
};

/** One finger bone plus the local rotation that closes it into a fist. */
export type GripFinger = { bone: THREE.Bone; rest: THREE.Quaternion; curl: THREE.Quaternion };

export type HumanRig = {
  bones: Partial<Record<HumanBone, THREE.Bone>>;
  /** Bind-pose rotation of every bone; poses are expressed as deltas from it. */
  rest: Map<THREE.Bone, THREE.Quaternion>;
  sockets: Partial<Record<HumanSocket, THREE.Object3D>>;
  /** Finger bones per hand, so a held item can close around its grip. */
  fingers: Partial<Record<'L' | 'R', GripFinger[]>>;
};

/**
 * Verified against the bind pose: inside a closed fist the socket sits a few millimetres toward the
 * palm side of the wrist, ~10 cm along the hand bone (i.e. between the curled fingers and the
 * palm). Both hands declare it in their own bone space, so one vector covers both.
 */
const FIST_LOCAL = new THREE.Vector3(0.014, 0.097, 0.005);

/**
 * A hilt passes through the tunnel a closed fist forms, which runs along the hand bone's own X axis.
 * On the right hand -X points down, back and slightly out once the idle pose has brought the arm in
 * (measured: blade direction ≈ (-0.36, -0.72, -0.59), tip of a 1 m sword 0.25 m above the ground);
 * the left hand mirrors it. This is why the weapon needs no extra rotation: the socket IS the grip.
 */
const BLADE_LOCAL = {
  L: new THREE.Vector3(1, 0, 0),
  R: new THREE.Vector3(-1, 0, 0),
} as const;

/**
 * Sockets whose bone frame is arbitrary in the asset (Mixamo bones point along their own length).
 * Hanging a circlet, a pauldron or a boot in that frame tilts it, so these are aligned with the
 * model at bind time: local +Y is up and +Z is forward, exactly like the gear was authored.
 */
const WORLD_ALIGNED: readonly HumanSocket[] = ['head', 'torso', 'footL', 'footR'];

/**
 * Finger closure measured on the skeleton: local X bends the finger toward the palm, Z closes it
 * inward. The index closes the least and the pinky the most, which is what a real fist does.
 */
const FINGER_CURL: Record<'Index' | 'Middle' | 'Ring' | 'Pinky', [number, number, number]> = {
  Index: [1.03, 0.103, -0.619],
  Middle: [1.176, 0.118, -0.706],
  Ring: [1.2, 0.12, -0.72],
  Pinky: [1.368, 0.137, -0.821],
};
const THUMB_CURL: [number, number, number] = [0.96, 0.72, 0.24];
const FINGER_NAMES = ['Index', 'Middle', 'Ring', 'Pinky'] as const;
const SIDE_PREFIX = { L: 'LeftHand', R: 'RightHand' } as const;
const _euler = new THREE.Euler();

function curlQuaternion([x, y, z]: [number, number, number]): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(_euler.set(x, y, z, 'XYZ'));
}

/** Every bone of a rig keyed by its normalised name, so lookups happen in one traversal. */
function boneIndex(root: THREE.Object3D): Map<string, THREE.Bone> {
  const index = new Map<string, THREE.Bone>();
  root.traverse((object) => {
    const bone = object as THREE.Bone;
    if (!bone.isBone) return;
    index.set(bone.name.toLowerCase().replace(/[^a-z0-9]/g, ''), bone);
  });
  return index;
}

/** Finger bones of one hand, with the closure each of them needs to form a fist. */
function gripFingers(index: Map<string, THREE.Bone>, side: 'L' | 'R'): GripFinger[] {
  const found: GripFinger[] = [];
  const prefix = SIDE_PREFIX[side].toLowerCase();
  // Bone names in the asset carry a `mixamorig:` prefix; exported skeletons may not.
  const pick = (suffix: string): THREE.Bone | undefined =>
    index.get(`mixamorig${prefix}${suffix}`.toLowerCase()) ?? index.get(`${prefix}${suffix}`.toLowerCase());
  for (const name of FINGER_NAMES) {
    const curl = FINGER_CURL[name];
    for (const segment of ['1', '2', '3']) {
      const bone = pick(`${name}${segment}`);
      if (!bone) continue;
      // The middle phalanx closes a little harder so the fingertips tuck against the palm.
      const amount = segment === '2' ? curl.map((value) => value * 1.1) as [number, number, number] : curl;
      found.push({ bone, rest: bone.quaternion.clone(), curl: curlQuaternion(amount) });
    }
  }
  for (const segment of ['1', '2', '3']) {
    const bone = pick(`Thumb${segment}`);
    if (bone) found.push({ bone, rest: bone.quaternion.clone(), curl: curlQuaternion(THUMB_CURL) });
  }
  return found;
}

const HAIR_PROXY: Record<HumanLook['hair'], string> = {
  long: 'hair-long01', tied: 'hair-ponytail01', bob: 'hair-bob02', braid: 'hair-braid01',
  bun: 'hair-rehmanpolanski_hair_bun_brown', short: 'hair-short01', cropped: 'hair-short03',
};

/** Skin textures are pre-tinted per ethnicity; the chosen tone only nudges them. */
const SKIN_SET: Record<HumanLook['skinTone'], { ethnicity: string; tint: number }> = {
  light: { ethnicity: 'caucasian', tint: 1 }, warm: { ethnicity: 'asian', tint: 1 },
  bronze: { ethnicity: 'asian', tint: 0.84 }, deep: { ethnicity: 'african', tint: 1 },
};

/** The GLB has no face morphs, so a chosen face shape nudges the skull proportions. */
const FACE_SCALE: Record<HumanLook['face'], [number, number, number]> = {
  oval: [1, 1, 1], round: [1.04, 0.975, 1.02], angular: [0.96, 1.025, 1.01], heart: [1.02, 1.005, 0.97],
};

/**
 * The shipped GLBs store positions, UVs and skin data only — no NORMAL attribute. `three` lights a
 * `MeshStandardMaterial` from that attribute, so a mesh without normals is shaded from a zero
 * vector, comes out NaN in the shader and is drawn pitch black: every skin/hair/robe colour then
 * looks identical. The packed vertices are already in bind space, so computing the normals there
 * once per shared geometry is enough for every clone and every look.
 */
function ensureNormals(geometry: THREE.BufferGeometry): boolean {
  if (geometry.getAttribute('normal')) return false;
  geometry.computeVertexNormals();
  return true;
}

const proxyUrl = (name: string) => `proxies/${name}.glb.gz`;
const textureUrl = (name: string) => `textures/${name}.webp`;

/** Proxy meshes are greyscale; boost the swatch so hair/robes read at their intended value. */
function tint(hex: string, boost = 1.5): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(boost);
}

type BodyBlueprint = { scene: THREE.Group; skeleton: THREE.Skeleton; affine: THREE.Matrix4; affineScale: number; affineOffset: THREE.Vector3 };

const blueprints = new Map<HumanSource, Promise<BodyBlueprint>>();

function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const found: THREE.SkinnedMesh[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh) found.push(mesh);
  });
  return found;
}

async function loadBody(source: HumanSource): Promise<BodyBlueprint> {
  const scene = await source.gltf('body.glb.gz');
  scene.updateMatrixWorld(true);
  const body = skinnedMeshes(scene)[0];
  if (!body) throw new Error('Tài nguyên nhân vật thiếu lưới có xương.');
  body.skeleton.update();
  // Normals are missing from every shipped GLB (see `ensureNormals`); the body is the biggest mesh.
  for (const mesh of skinnedMeshes(scene)) ensureNormals(mesh.geometry);
  // Every bone shares this affine at rest: it converts the packed int16 vertex space to metres.
  const affine = new THREE.Matrix4().multiplyMatrices(body.skeleton.bones[0].matrixWorld, body.skeleton.boneInverses[0]);
  const affineScale = affine.elements[0];
  const affineOffset = new THREE.Vector3(affine.elements[12], affine.elements[13], affine.elements[14]);
  if (!Number.isFinite(affineScale) || affineScale <= 0) throw new Error('Ma trận xương của nhân vật không hợp lệ.');
  return { scene, skeleton: body.skeleton, affine, affineScale, affineOffset };
}

function bodyBlueprint(source: HumanSource): Promise<BodyBlueprint> {
  const cached = blueprints.get(source);
  if (cached) return cached;
  const pending = loadBody(source);
  blueprints.set(source, pending);
  pending.catch(() => blueprints.delete(source));
  return pending;
}

function skinMaterial(look: HumanLook, source: HumanSource, quality: number): THREE.MeshStandardMaterial {
  const set = SKIN_SET[look.skinTone];
  const tier = quality >= 0.9 ? '2k' : '1k';
  const map = source.texture(`skins/young_${set.ethnicity}_${look.gender === 'nu' ? 'female' : 'male'}_${tier}.webp`);
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(set.tint, set.tint * 0.98, set.tint * 0.96), roughness: 0.55, metalness: 0,
    ...(map ? { map } : {}),
  });
}

/**
 * Hair cards are alpha-tested strands. Blending the texture's near-white transparent texels shows
 * as a light halo, so darken them by coverage — the trick the upstream HumanForge runtime uses.
 */
function hairShading(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n\tdiffuseColor.rgb *= mix(0.35, 1.0, smoothstep(0.05, 0.85, diffuseColor.a));');
  };
  material.customProgramCacheKey = () => 'van-thuong-hair';
}

function hairMaterial(look: HumanLook, source: HumanSource, soft = false): THREE.MeshStandardMaterial {
  const proxy = HAIR_PROXY[look.hair];
  const material = new THREE.MeshStandardMaterial({
    map: source.texture(textureUrl(proxy)), color: tint(HAIR_HEX[look.hairColor], 1.6),
    roughness: 0.55, metalness: 0, side: THREE.DoubleSide, alphaToCoverage: !soft,
    alphaTest: soft ? 0.04 : 0.5,
  });
  if (soft) { material.transparent = true; material.depthWrite = false; }
  hairShading(material);
  return material;
}

function robeMaterial(look: HumanLook, source: HumanSource): THREE.MeshStandardMaterial {
  const normalMap = source.texture('textures/fabric-crepe_n.webp');
  return new THREE.MeshStandardMaterial({
    map: source.texture('textures/fabric-crepe.webp'), color: tint(ROBE_HEX[look.robeColor], 1.05),
    roughness: 0.88, metalness: 0.02, side: THREE.DoubleSide,
    // three warns loudly when a texture slot is explicitly undefined, so only add it when loaded.
    ...(normalMap ? { normalMap } : {}),
  });
}

type ProxySpec = {
  name: string;
  file: string;
  material: (look: HumanLook, source: HumanSource) => THREE.Material;
  /** Hair also gets a blended second pass so strand tips are not chopped off by the cutout. */
  soft?: (look: HumanLook, source: HumanSource) => THREE.Material;
};

function proxySpecs(look: HumanLook, quality: number, withShoes: boolean): ProxySpec[] {
  const hair = HAIR_PROXY[look.hair];
  const robe = look.gender === 'nu' ? 'clothes-dress_maxi01' : 'clothes-jalabiya01';
  const specs: ProxySpec[] = [
    { name: 'human-hair', file: proxyUrl(hair), material: (l, s) => hairMaterial(l, s),
      soft: (l, s) => hairMaterial(l, s, true) },
    { name: 'human-robe', file: proxyUrl(robe), material: (l, s) => robeMaterial(l, s) },
    { name: 'human-eyes', file: proxyUrl('eyes-high-poly'), material: (_l, s) => new THREE.MeshStandardMaterial({
      map: s.texture(textureUrl('eyes-high-poly')), roughness: 0.12, metalness: 0, transparent: true,
    }) },
    { name: 'human-brows', file: proxyUrl('eyebrows-eyebrow001'), material: (l, s) => new THREE.MeshStandardMaterial({
      map: s.texture(textureUrl('eyebrows-eyebrow001')), color: tint(HAIR_HEX[l.hairColor], 1.25),
      roughness: 0.7, metalness: 0, alphaTest: 0.4, side: THREE.DoubleSide,
    }) },
  ];
  if (withShoes) {
    specs.push({ name: 'human-shoes', file: proxyUrl('clothes-shoes04'), material: (_l, s) => new THREE.MeshStandardMaterial({
      map: s.texture(textureUrl('clothes-shoes04')), roughness: 0.62, metalness: 0.05,
      ...(s.texture(textureUrl('clothes-shoes04_n')) ? { normalMap: s.texture(textureUrl('clothes-shoes04_n'))! } : {}),
    }) });
  }
  // Fine detail is invisible past a few metres and costs fill rate on phones.
  if (quality >= 0.9) {
    specs.push(
      { name: 'human-lashes', file: proxyUrl('eyelashes-eyelashes01'), material: (_l, s) => new THREE.MeshStandardMaterial({
        map: s.texture(textureUrl('eyelashes-eyelashes01')), roughness: 0.6, metalness: 0,
        alphaTest: 0.3, side: THREE.DoubleSide, transparent: true,
      }) },
      { name: 'human-teeth', file: proxyUrl('teeth-teeth_base'), material: (_l, s) => new THREE.MeshStandardMaterial({
        map: s.texture(textureUrl('teeth-teeth_base')), roughness: 0.35, metalness: 0,
      }) },
    );
  }
  return specs;
}

/**
 * Rewrite a packed proxy geometry once: promote `_joints`/`_weights` to the skinning attributes
 * three expects and drop the helper buffers. The result is shared by every look, so ten different
 * hairstyles do not duplicate memory.
 */
const proxyGeometries = new WeakMap<THREE.Mesh, THREE.BufferGeometry>();

function proxyGeometry(mesh: THREE.Mesh): THREE.BufferGeometry | null {
  const cached = proxyGeometries.get(mesh);
  if (cached) return cached;
  const joints = mesh.geometry.getAttribute('_joints');
  const weights = mesh.geometry.getAttribute('_weights');
  if (!joints || !weights) return null;
  const geometry = mesh.geometry.clone();
  geometry.setAttribute('skinIndex', joints);
  geometry.setAttribute('skinWeight', weights);
  for (const unused of ['_joints', '_weights', '_refs', '_refw', '_offs']) geometry.deleteAttribute(unused);
  ensureNormals(geometry);
  proxyGeometries.set(mesh, geometry);
  return geometry;
}

/** Bind one proxy mesh onto the body skeleton, in the body's packed vertex space. */
function bindProxy(mesh: THREE.Mesh, skeleton: THREE.Skeleton, blueprint: BodyBlueprint): THREE.SkinnedMesh | null {
  const geometry = proxyGeometry(mesh);
  if (!geometry) return null;

  const skinned = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  // A⁻¹ · nodeMatrix maps proxy vertices into the packed body space the skeleton expects.
  const bindMatrix = blueprint.affine.clone().invert().multiply(mesh.matrixWorld);
  skinned.bind(skeleton, bindMatrix);
  skinned.castShadow = true;
  skinned.receiveShadow = true;
  return skinned;
}

async function addProxies(root: THREE.Group, skeleton: THREE.Skeleton, blueprint: BodyBlueprint,
  look: HumanLook, quality: number, source: HumanSource): Promise<void> {
  const specs = proxySpecs(look, quality, look.shoes !== false);
  const built = await Promise.all(specs.map(async (spec) => {
    try {
      const scene = await source.gltf(spec.file);
      scene.updateMatrixWorld(true);
      const meshes: THREE.Mesh[] = [];
      scene.traverse((object) => { const mesh = object as THREE.Mesh; if (mesh.isMesh) meshes.push(mesh); });
      return { spec, meshes };
    } catch (error) {
      // One missing hairstyle must never remove the whole character.
      if (import.meta.env?.DEV) console.warn(`[human] Bỏ qua phụ kiện ${spec.name}:`, error);
      return null;
    }
  }));
  for (const entry of built) {
    if (!entry) continue;
    const material = entry.spec.material(look, source);
    const softMaterial = entry.spec.soft?.(look, source);
    for (const mesh of entry.meshes) {
      const skinned = bindProxy(mesh, skeleton, blueprint);
      if (!skinned) continue;
      skinned.name = entry.spec.name;
      skinned.material = material;
      root.add(skinned);
      if (softMaterial) {
        const soft = new THREE.SkinnedMesh(skinned.geometry, softMaterial);
        soft.name = `${entry.spec.name}-tips`;
        soft.bind(skeleton, skinned.bindMatrix);
        soft.renderOrder = 3;
        soft.castShadow = false;
        soft.computeBoundingSphere();
        if (soft.boundingSphere) soft.boundingSphere.radius *= 1.35;
        root.add(soft);
      }
    }
  }
}

/**
 * Grip frames are not plain bone followers: a sword socket has to sit inside the fist and carry the
 * blade along the fist's own axis, so a held weapon keeps the wrist's orientation (and therefore
 * every pose) for free.
 */
function addGripFrames(rig: HumanRig): void {
  for (const side of ['L', 'R'] as const) {
    const hand = rig.bones[side === 'L' ? 'handL' : 'handR'];
    const socket = rig.sockets[side === 'L' ? 'gripL' : 'gripR'];
    if (!hand || !socket) continue;
    socket.position.copy(FIST_LOCAL);
    socket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), BLADE_LOCAL[side]);
  }
}

function addSockets(root: THREE.Group, rig: HumanRig): void {
  root.updateMatrixWorld(true);
  const world = new THREE.Quaternion();
  for (const [socket, bone] of Object.entries(SOCKET_BONE) as [HumanSocket, HumanBone][]) {
    const target = rig.bones[bone];
    if (!target) continue;
    const node = new THREE.Object3D();
    node.name = HUMAN_SOCKETS[socket];
    // Cancel the bind rotation, so the socket behaves like the model space the pieces are built in.
    if (WORLD_ALIGNED.includes(socket)) {
      target.getWorldQuaternion(world);
      node.quaternion.copy(world).invert();
    }
    target.add(node);
    rig.sockets[socket] = node;
  }
  const bones = boneIndex(root);
  const ring = bones.get('mixamorigrighthandring1') ?? bones.get('righthandring1');
  if (ring) {
    const node = new THREE.Object3D();
    node.name = HUMAN_SOCKETS.ringR;
    ring.add(node);
    rig.sockets.ringR = node;
  }
  addGripFrames(rig);
}

/** Read the mixamo skeleton back into our small, stable rig contract. */
export function rigOf(root: THREE.Object3D): HumanRig {
  const rig: HumanRig = { bones: {}, rest: new Map(), sockets: {}, fingers: {} };
  const bones: THREE.Bone[] = [];
  root.traverse((object) => { const bone = object as THREE.Bone; if (bone.isBone) bones.push(bone); });
  const byNormalisedName = new Map<string, THREE.Bone>();
  for (const bone of bones) byNormalisedName.set(bone.name.toLowerCase().replace(/[^a-z0-9]/g, ''), bone);
  for (const [key, wanted] of Object.entries(BONES) as [HumanBone, string][]) {
    const bone = byNormalisedName.get(`mixamorig${wanted}`) ?? byNormalisedName.get(wanted) ?? bones.find(
      (candidate) => candidate.name.toLowerCase().endsWith(wanted));
    if (!bone) continue;
    rig.bones[key] = bone;
    rig.rest.set(bone, bone.quaternion.clone());
  }
  for (const [socket, name] of Object.entries(HUMAN_SOCKETS) as [HumanSocket, string][]) {
    const node = root.getObjectByName(name);
    if (node) rig.sockets[socket] = node;
  }
  const index = boneIndex(root);
  for (const side of ['L', 'R'] as const) {
    const fingers = gripFingers(index, side);
    if (fingers.length) rig.fingers[side] = fingers;
  }
  return rig;
}

/** Build one complete human. The result is a prototype: clone it per actor. */
export async function buildHuman(look: HumanLook, quality = 1, source: HumanSource = browserHumanSource): Promise<THREE.Group> {
  const blueprint = await bodyBlueprint(source);
  const root = cloneSkinned(blueprint.scene) as THREE.Group;
  root.name = 'human-character';
  root.updateMatrixWorld(true);

  const body = skinnedMeshes(root)[0];
  if (!body) throw new Error('Bản sao nhân vật thiếu lưới có xương.');
  body.material = skinMaterial(look, source, quality);
  body.castShadow = true;
  body.receiveShadow = true;
  body.name = 'human-body';

  await addProxies(root, body.skeleton, blueprint, look, quality, source);

  // Quantised vertices give each mesh a [-1, 1] bounding box, which would make three cull the
  // character while it is on screen. SkinnedMesh can compute real bounds from the current pose.
  for (const mesh of skinnedMeshes(root)) {
    mesh.computeBoundingSphere();
    // Poses (walking, sitting) reach a little past the bind pose; pad instead of disabling culling.
    if (mesh.boundingSphere) mesh.boundingSphere.radius *= 1.35;
    mesh.frustumCulled = true;
  }

  // Proportions: height stretches the whole body, build widens shoulders/hips.
  const stretch = 0.9 + look.height * 0.2;
  const width = 0.88 + look.build * 0.26;
  root.scale.set(width, stretch, width);

  const rig = rigOf(root);
  // Sockets must exist before props hang off them, and trim is measured in the bind pose, so all
  // of this happens BEFORE the body proportions scale is applied.
  addSockets(root, rig);
  addRobeTrim(root, rig, look);
  addFlavor(root, rig, look);
  const head = rig.bones.head;
  if (head && look.face !== 'oval') {
    const scale = FACE_SCALE[look.face];
    head.scale.set(head.scale.x * scale[0], head.scale.y * scale[1], head.scale.z * scale[2]);
  }
  root.updateMatrixWorld(true);
  return root;
}

const prototypes = new Map<string, Promise<THREE.Group>>();
const LIMIT = 24;

export function humanLookKey(look: HumanLook, quality: number): string {
  return [look.gender, look.hair, look.hairColor, look.face, look.skinTone, look.robeColor,
    look.height.toFixed(2), look.build.toFixed(2), look.shoes === false ? 'noshoes' : 'shoes',
    look.beard ? 'beard' : '', look.staff ? 'staff' : '',
    quality >= 0.9 ? 'hi' : 'lo'].join('|');
}

/** Build once per look, then clone — the same contract as `clonePrototype` for sculpted models. */
export function humanPrototype(key: string, look: HumanLook, quality = 1, source: HumanSource = browserHumanSource): Promise<THREE.Group> {
  const cached = prototypes.get(key);
  if (cached) return cached;
  const pending = buildHuman(look, quality, source);
  prototypes.set(key, pending);
  pending.catch(() => prototypes.delete(key));
  while (prototypes.size > LIMIT) {
    const oldest = prototypes.keys().next();
    if (oldest.done || oldest.value === key) break;
    prototypes.delete(oldest.value);
  }
  return pending;
}

/** One independent actor: own skeleton, shared geometry and materials. */
export async function instantiateHuman(key: string, look: HumanLook, quality = 1,
  source: HumanSource = browserHumanSource): Promise<THREE.Group> {
  const prototype = await humanPrototype(key, look, quality, source);
  const clone = cloneSkinned(prototype) as THREE.Group;
  clone.updateMatrixWorld(true);
  return clone;
}

export function trimHumanPrototypes(limit = 12): void {
  while (prototypes.size > limit) {
    const oldest = prototypes.keys().next();
    if (oldest.done) break;
    prototypes.delete(oldest.value);
  }
}

/** Test hook: drop every cached blueprint/prototype. */
export function resetHumanPrototypes(): void {
  prototypes.clear();
  blueprints.clear();
}

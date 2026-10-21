/** Regenerate the small self-contained skeletal GLB: node scripts/generate-avatar.mjs */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// GLTFExporter uses browser FileReader, even for untextured binary buffers.
globalThis.FileReader ??= class FileReader {
  result = null;
  onloadend = null;
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
};

const cloth = new THREE.MeshStandardMaterial({ name: 'RobeMaterial', color: '#e1e0d3', roughness: 0.87, side: THREE.DoubleSide });
const hair = new THREE.MeshStandardMaterial({ name: 'HairMaterial', color: '#1a2931', roughness: 0.78 });
const skin = new THREE.MeshStandardMaterial({ name: 'SkinMaterial', color: '#f0cbb2', roughness: 0.82 });
const trim = new THREE.MeshStandardMaterial({ name: 'TrimMaterial', color: '#bb9b63', metalness: 0.55, roughness: 0.36 });
const eye = new THREE.MeshStandardMaterial({ name: 'EyeMaterial', color: '#24303a' });

const group = new THREE.Group();
group.name = 'Cultivator';
const hips = new THREE.Bone(); hips.name = 'Hips'; hips.position.set(0, 0.83, 0);
const spine = new THREE.Bone(); spine.name = 'Spine'; spine.position.set(0, 0.72, 0); hips.add(spine);
const head = new THREE.Bone(); head.name = 'Head'; head.position.set(0, 0.57, 0); spine.add(head);
const leftArm = new THREE.Bone(); leftArm.name = 'LeftArm'; leftArm.position.set(-0.36, 0.17, 0); spine.add(leftArm);
const rightArm = new THREE.Bone(); rightArm.name = 'RightArm'; rightArm.position.set(0.36, 0.17, 0); spine.add(rightArm);
const leftHand = new THREE.Bone(); leftHand.name = 'LeftHand'; leftHand.position.set(-0.12, -0.69, 0.03); leftArm.add(leftHand);
const rightHand = new THREE.Bone(); rightHand.name = 'RightHand'; rightHand.position.set(0.12, -0.69, 0.03); rightArm.add(rightHand);

function mesh(parent, name, geometry, material, pos, rot) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// A genuine skinned GLTF robe (two weighted bones), not a static mesh with a fake rig.
const geometry = new THREE.CylinderGeometry(0.285, 0.36, 1.07, 16, 9, false);
geometry.translate(0, 1.25, 0);
const position = geometry.getAttribute('position');
const indices = [];
const weights = [];
for (let i = 0; i < position.count; i++) {
  const upper = THREE.MathUtils.smoothstep(position.getY(i), 1.12, 1.55);
  indices.push(0, 1, 0, 0);
  weights.push(1 - upper, upper, 0, 0);
}
geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
const body = new THREE.SkinnedMesh(geometry, cloth);
body.name = 'SkinnedRobe';
body.castShadow = true;
body.receiveShadow = true;
body.add(hips);
group.add(body);
group.updateMatrixWorld(true);
body.bind(new THREE.Skeleton([hips, spine, head, leftArm, rightArm, leftHand, rightHand]));

mesh(hips, 'FlowingSkirt', new THREE.CylinderGeometry(0.32, 0.64, 0.94, 18, 3, true), cloth, [0, -0.25, 0]);
mesh(hips, 'SkirtHem', new THREE.TorusGeometry(0.63, 0.025, 5, 22), trim, [0, -0.72, 0], [Math.PI / 2, 0, 0]);
mesh(spine, 'Collar', new THREE.CylinderGeometry(0.24, 0.3, 0.16, 12), trim, [0, 0.42, 0]);
mesh(hips, 'WaistBand', new THREE.CylinderGeometry(0.305, 0.315, 0.11, 16), trim, [0, 0.08, 0]);
mesh(head, 'Face', new THREE.SphereGeometry(0.205, 16, 12), skin, [0, 0.12, 0.025]);
mesh(head, 'HairCap', new THREE.SphereGeometry(0.215, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.54), hair, [0, 0.145, 0.01]);
mesh(head, 'HairBack', new THREE.ConeGeometry(0.19, 0.8, 12), hair, [0, -0.35, -0.105]);
mesh(head, 'HairPin', new THREE.BoxGeometry(0.33, 0.035, 0.04), trim, [0, 0.3, 0.018]);
mesh(head, 'LeftEye', new THREE.SphereGeometry(0.018, 7, 5), eye, [-0.078, 0.13, 0.215]);
mesh(head, 'RightEye', new THREE.SphereGeometry(0.018, 7, 5), eye, [0.078, 0.13, 0.215]);
for (const [arm, handBone, side] of [[leftArm, leftHand, -1], [rightArm, rightHand, 1]]) {
  mesh(arm, `${side < 0 ? 'Left' : 'Right'}Sleeve`, new THREE.CylinderGeometry(0.14, 0.25, 0.68, 12), cloth, [side * 0.07, -0.28, 0]);
  mesh(arm, `${side < 0 ? 'Left' : 'Right'}Cuff`, new THREE.TorusGeometry(0.245, 0.025, 5, 12), trim, [side * 0.08, -0.6, 0], [Math.PI / 2, 0, 0]);
  mesh(handBone, `${side < 0 ? 'Left' : 'Right'}Palm`, new THREE.SphereGeometry(0.095, 10, 8), skin, [0, -0.07, 0]);
}
for (const side of [-1, 1]) {
  mesh(hips, `${side < 0 ? 'Left' : 'Right'}Boot`, new THREE.BoxGeometry(0.2, 0.14, 0.36), hair, [side * 0.23, -0.75, 0.09]);
}

const exporter = new GLTFExporter();
const binary = await exporter.parseAsync(group, { binary: true, onlyVisible: true });
const target = fileURLToPath(new URL('../apps/client/public/models/cultivator.glb', import.meta.url));
await writeFile(target, Buffer.from(binary));
console.log(`Wrote ${target} (${binary.byteLength} bytes)`);

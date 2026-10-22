import * as THREE from 'three';

export type Point3 = [number, number, number];

/** Segment budget scaled by the requested quality, never below something that still reads as round. */
export const seg = (base: number, quality: number, minimum = 8): number => Math.max(minimum, Math.round(base * quality));

export function meshOf(geometry: THREE.BufferGeometry, material: THREE.Material,
  position: Point3 = [0, 0, 0], rotation: Point3 = [0, 0, 0], scale: Point3 = [1, 1, 1]): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Loft a closed, organic tube along a Catmull-Rom spline with independent X/Y radii.
 * Both ends are rounded off, so limbs, tails and hair strands never look like cut pipes.
 */
export function taperedSpline(points: readonly Point3[], radiusFn: (u: number) => number, material: THREE.Material,
  options: { quality?: number; tubular?: number; radial?: number; aspect?: (u: number) => [number, number] } = {}): THREE.Mesh {
  const quality = options.quality ?? 1;
  const tubular = seg(options.tubular ?? 48, quality, 6);
  const radial = seg(options.radial ?? 20, quality, 6);
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const frames = curve.computeFrenetFrames(tubular, false);
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular;
    const point = curve.getPointAt(u);
    const normal = frames.normals[i];
    const binormal = frames.binormals[i];
    let cap = 1;
    if (u < 0.05) cap = Math.sin((u / 0.05) * (Math.PI / 2));
    else if (u > 0.95) cap = Math.sin(((1 - u) / 0.05) * (Math.PI / 2));
    const baseRadius = Math.max(0.0005, radiusFn(u) * cap);
    const [scaleN, scaleB] = options.aspect ? options.aspect(u) : [1, 1];
    for (let j = 0; j <= radial; j++) {
      const theta = (j / radial) * Math.PI * 2;
      const cos = Math.cos(theta), sin = Math.sin(theta);
      vertices.push(
        point.x + (cos * normal.x * scaleN + sin * binormal.x * scaleB) * baseRadius,
        point.y + (cos * normal.y * scaleN + sin * binormal.y * scaleB) * baseRadius,
        point.z + (cos * normal.z * scaleN + sin * binormal.z * scaleB) * baseRadius,
      );
      uvs.push(u * 4, j / radial);
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      const c = (i + 1) * (radial + 1) + (j + 1);
      const d = i * (radial + 1) + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return meshOf(geometry, material);
}

/** Chiselled boulder: multi-frequency displacement instead of a faceted polyhedron. */
export function sculptedRock(radius: number, quality: number, stretch: Point3, material: THREE.Material, seed = 1): THREE.Mesh {
  const detail = seg(28, quality, 12);
  const geometry = new THREE.SphereGeometry(radius, detail, detail);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const n1 = Math.sin(x * 6.5 + seed) * Math.cos(y * 6.5 - seed) * Math.sin(z * 6.5 + seed);
    const n2 = Math.sin(x * 14 + y * 11) * 0.35;
    const displacement = 1 + n1 * 0.22 + n2 * 0.08;
    position.setXYZ(i, x * stretch[0] * displacement, y * stretch[1] * displacement, z * stretch[2] * displacement);
  }
  geometry.computeVertexNormals();
  return meshOf(geometry, material);
}

/**
 * Lathe with harmonic cloth folds: sleeve cuffs, skirts, sashes and roof tiers keep a soft,
 * pleated silhouette instead of a bare cone.
 */
export function pleatedLathe(profile: readonly (readonly [number, number])[], material: THREE.Material,
  options: { quality?: number; segments?: number; pleats?: number; pleatDepth?: number;
    startAngle?: number; angleLength?: number } = {}): THREE.Mesh {
  const quality = options.quality ?? 1;
  const segments = seg(options.segments ?? 72, quality, 8);
  const pleatCount = options.pleats ?? 18;
  const pleatDepth = options.pleatDepth ?? 0.02;
  const geometry = new THREE.LatheGeometry(
    profile.map(([x, y]) => new THREE.Vector2(x, y)), segments,
    options.startAngle ?? 0, options.angleLength ?? Math.PI * 2,
  );
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const ys = profile.map(([, y]) => y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(0.0001, maxY - minY);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const radius = Math.hypot(x, z);
    if (radius <= 0.02) continue;
    const angle = Math.atan2(z, x);
    const heightRatio = Math.max(0, Math.min(1, 1 - (y - minY) / span));
    const fold = (Math.sin(angle * pleatCount) * 0.7 + Math.cos(angle * pleatCount * 2) * 0.3) *
      pleatDepth * Math.pow(heightRatio, 1.2);
    const nextRadius = Math.max(0.001, radius + fold);
    position.setX(i, (x / radius) * nextRadius);
    position.setZ(i, (z / radius) * nextRadius);
  }
  geometry.computeVertexNormals();
  return meshOf(geometry, material);
}

/** Sculpted leaf / feather / blade with a beveled edge and an optional sweep. */
export function bladeGeometry(length: number, width: number, thickness = 0.02, curve = 0): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(width, length * 0.35, width * 0.6, length * 0.75);
  shape.lineTo(0, length);
  shape.lineTo(-width * 0.6, length * 0.75);
  shape.quadraticCurveTo(-width, length * 0.35, 0, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, bevelEnabled: true, bevelSegments: 3, steps: 6,
    bevelSize: width * 0.15, bevelThickness: thickness * 0.8,
  });
  geometry.center();
  if (curve !== 0) {
    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const ratio = (position.getY(i) + length / 2) / length;
      position.setZ(i, position.getZ(i) + Math.pow(ratio, 2) * curve);
    }
    geometry.computeVertexNormals();
  }
  return geometry;
}

/** Drop a finished model so its feet rest exactly on y = 0 (no floating or sunken beasts). */
export function groundAlign(group: THREE.Object3D, targetHeight?: number): THREE.Group {
  const wrapper = new THREE.Group();
  wrapper.add(group);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return wrapper;
  const size = new THREE.Vector3();
  box.getSize(size);
  if (targetHeight && size.y > 0.0001) {
    const scale = targetHeight / size.y;
    group.scale.multiplyScalar(scale);
    group.updateMatrixWorld(true);
    box.setFromObject(group);
    box.getSize(size);
  }
  group.position.y -= box.min.y;
  return wrapper;
}

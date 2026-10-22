import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Hào quang cảnh giới — spiritual energy, not a hoop.
 *
 * The previous version hung a Kenney stone arch (`realm-ring.glb`) around the character at 3.05×,
 * which read as a plastic ring glued to the body: an opaque frame, a hard torus at chest height and
 * a flat ring on the floor. Everything here is now additive light that moves:
 *  · a qi pool on the ground with ripples travelling outward,
 *  · a fresnel shell around the body whose light drifts upward in strands,
 *  · drifting motes rising out of the ground,
 *  · a slowly turning column of qi,
 *  · and, from Hoá Thần, small orbiting sigils.
 *
 * All of it is shader-driven and depth-write free, so it composites like glow instead of geometry.
 */
const REALM_COLORS = [
  '#000000', '#000000', '#87ecd0', '#9fcaee', '#bbaef4', '#d8b887',
  '#f2a76d', '#db97b5', '#c7b0fb', '#e6c579', '#a8f1fc', '#fff0c7',
] as const;

const SHELL_VERTEX = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    vec4 world = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-world.xyz);
    vLocal = position;
    gl_Position = projectionMatrix * world;
  }
`;

/** Rim light that climbs: bands of qi sweep up the body and fade before the shoulders. */
const SHELL_FRAGMENT = /* glsl */`
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uPower;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.4);
    float angle = atan(vLocal.z, vLocal.x);
    float strand = 0.5 + 0.5 * sin(vLocal.y * 16.0 - uTime * 2.6 + angle * 4.0);
    float height = smoothstep(-0.95, -0.15, vLocal.y) * smoothstep(1.0, 0.35, vLocal.y);
    float alpha = rim * (0.18 + strand * 0.26) * height * uPower;
    gl_FragColor = vec4(uColor * (1.15 + strand * 0.45), alpha);
  }
`;

const GROUND_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Pool of qi with waves travelling outward from the feet (never a solid ring). */
const GROUND_FRAGMENT = /* glsl */`
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uPower;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float radius = length(p);
    if (radius > 1.0) discard;
    float pool = pow(smoothstep(1.0, 0.05, radius), 2.2);
    float wave = sin(radius * 17.0 - uTime * 2.1) * 0.5 + 0.5;
    wave = pow(wave, 6.0) * smoothstep(0.05, 0.45, radius) * smoothstep(1.0, 0.4, radius);
    float breath = 0.85 + 0.15 * sin(uTime * 1.4);
    float alpha = (pool * 0.3 + wave * 0.22) * breath * uPower;
    gl_FragColor = vec4(uColor * (1.0 + wave * 0.8), alpha);
  }
`;

const WISP_VERTEX = /* glsl */`
  varying vec2 vUv;
  varying float vAngle;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vAngle = atan(position.z, position.x);
    vec4 world = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-world.xyz);
    gl_Position = projectionMatrix * world;
  }
`;

/** Open column of qi: vertical strands that fade out at the ankles and the head. */
const WISP_FRAGMENT = /* glsl */`
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uPower;
  varying vec2 vUv;
  varying float vAngle;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float strands = 0.55 + 0.45 * sin(vAngle * 26.0 + vUv.y * 5.0 - uTime * 1.9);
    float fade = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.62, vUv.y);
    // Rim only: a cylinder lit at its silhouette reads as a sheath of light, never as a barrel.
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.5);
    float alpha = strands * fade * rim * 0.42 * uPower;
    gl_FragColor = vec4(uColor * 1.35, alpha);
  }
`;

const MOTE_VERTEX = /* glsl */`
  attribute float aPhase;
  attribute float aRadius;
  attribute float aSpeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vFade;
  void main() {
    float life = fract(aPhase + uTime * aSpeed);
    float angle = aPhase * 6.2831 + uTime * 0.4 + life * 2.4;
    // The mote climbs out of the ground and widens as it rises.
    vec3 moved = vec3(cos(angle) * (aRadius + life * 0.12), life * 1.85, sin(angle) * (aRadius + life * 0.12));
    vec4 view = modelViewMatrix * vec4(moved, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = (2.0 + 2.2 * sin(aPhase * 31.0)) * uPixelRatio * 34.0 / max(0.2, -view.z);
    vFade = smoothstep(0.0, 0.12, life) * smoothstep(1.0, 0.55, life);
  }
`;

const MOTE_FRAGMENT = /* glsl */`
  uniform vec3 uColor;
  uniform float uPower;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float alpha = pow(smoothstep(0.5, 0.05, d), 1.6);
    gl_FragColor = vec4(uColor * 1.9, alpha * vFade * uPower);
  }
`;

const COLUMN = { radius: 0.46, height: 1.85, y: 0.92 };

type Uniforms = { uTime: THREE.IUniform<number>; uColor: THREE.IUniform<THREE.Color>; uPower: THREE.IUniform<number> };

function auraUniforms(color: THREE.Color, power: number): Uniforms {
  return { uTime: { value: 0 }, uColor: { value: color }, uPower: { value: power } };
}

/** Realm power is cosmetic only; the shared public realm is server-owned. */
export function RealmAura({ realm }: { realm: number }) {
  const color = REALM_COLORS[Math.max(2, Math.min(realm, REALM_COLORS.length - 1))];
  const tint = useMemo(() => new THREE.Color(color), [color]);
  // 1 at Trúc Cơ, ~1.7 at Chân Tiên: brighter and denser, never a hard-edged shell.
  const power = Math.min(1.75, 0.55 + realm * 0.1);
  const sigils = realm >= 5 ? Math.min(9, realm - 3) : 0;

  const shell = useMemo(() => auraUniforms(tint, power), [tint, power]);
  const ground = useMemo(() => auraUniforms(tint, power), [tint, power]);
  const wisp = useMemo(() => auraUniforms(tint, power), [tint, power]);
  const mote = useMemo(() => ({ ...auraUniforms(tint, power), uPixelRatio: { value: 1 } as THREE.IUniform<number> }),
    [tint, power]);

  const motes = useMemo(() => {
    const count = 46;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const radius = new Float32Array(count);
    const speed = new Float32Array(count);
    // Deterministic pseudo-random: the same aura on every client, no Math.random in render.
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < count; i++) {
      phase[i] = random();
      radius[i] = 0.16 + random() * 0.42;
      speed[i] = 0.055 + random() * 0.055;
      positions[i * 3] = 0; positions[i * 3 + 1] = 0; positions[i * 3 + 2] = 0;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geometry.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2.4);
    return geometry;
  }, []);
  useEffect(() => () => motes.dispose(), [motes]);

  const orbiting = useMemo(() => Array.from({ length: sigils }, (_, index) => {
    const angle = (index / Math.max(1, sigils)) * Math.PI * 2;
    return { angle, y: 0.55 + (index % 3) * 0.45, radius: 0.5 + (index % 2) * 0.08 };
  }), [sigils]);

  const column = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Group>(null);

  useFrame(({ clock, gl }) => {
    const time = clock.elapsedTime;
    for (const set of [shell, ground, wisp, mote]) set.uTime.value = time;
    mote.uPixelRatio.value = gl.getPixelRatio?.() ?? 1;
    if (column.current) column.current.rotation.y = time * 0.18;
    if (halo.current) halo.current.rotation.y = time * 0.4;
  });

  return <group>
    {/* Qi pool on the ground; the plane is faded out by the shader, so there is no ring edge. */}
    <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={1.75}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial uniforms={ground} vertexShader={GROUND_VERTEX} fragmentShader={GROUND_FRAGMENT}
        transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
    </mesh>
    {/* Shell hugging the body: reads as light around the silhouette, not as a frame. */}
    <mesh position={[0, COLUMN.y, 0]} scale={[COLUMN.radius, COLUMN.height * 0.5, COLUMN.radius]}>
      <sphereGeometry args={[1, 32, 24]} />
      <shaderMaterial uniforms={shell} vertexShader={SHELL_VERTEX} fragmentShader={SHELL_FRAGMENT}
        transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
    </mesh>
    <mesh ref={column} position={[0, COLUMN.y, 0]}>
      <cylinderGeometry args={[COLUMN.radius * 0.82, COLUMN.radius, COLUMN.height, 28, 1, true]} />
      <shaderMaterial uniforms={wisp} vertexShader={WISP_VERTEX} fragmentShader={WISP_FRAGMENT}
        transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
    </mesh>
    <points geometry={motes} frustumCulled={false}>
      <shaderMaterial uniforms={mote} vertexShader={MOTE_VERTEX} fragmentShader={MOTE_FRAGMENT}
        transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
    {orbiting.length > 0 && <group ref={halo}>
      {orbiting.map((mote, index) => <mesh key={index}
        position={[Math.sin(mote.angle) * mote.radius, mote.y, Math.cos(mote.angle) * mote.radius]}
        rotation={[0, mote.angle, Math.PI / 4]}>
        <octahedronGeometry args={[realm >= 8 ? 0.055 : 0.04, 0]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false}
          blending={THREE.AdditiveBlending} />
      </mesh>)}
    </group>}
  </group>;
}

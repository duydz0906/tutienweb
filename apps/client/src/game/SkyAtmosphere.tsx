import * as THREE from 'three';
import type { WorldZone } from '@van-thuong/shared';

/** An actual sky canopy, not a flat background: raising the camera reveals
 * high-altitude clouds and a darker zenith. Interior and trial scenes omit it. */
export function SkyAtmosphere({ zone }: { zone: WorldZone }) {
  const ascendant = zone === 'ascendant';
  const wilderness = zone === 'wilderness';
  const horizon = new THREE.Color(ascendant ? '#bdd4db' : wilderness ? '#b4aab0' : '#c4dfd4');
  const zenith = new THREE.Color(ascendant ? '#567daf' : wilderness ? '#34486b' : '#5187a5');
  return <group>
    <mesh renderOrder={-10}>
      <sphereGeometry args={[185, 32, 18]} />
      <shaderMaterial side={THREE.BackSide} depthWrite={false}
        uniforms={{ uHorizon: { value: horizon }, uZenith: { value: zenith } }}
        vertexShader={`varying float vHeight; void main(){ vHeight = position.y / 185.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={`varying float vHeight; uniform vec3 uHorizon; uniform vec3 uZenith;
          void main(){ float t = smoothstep(-0.1, 0.9, vHeight);
            gl_FragColor = vec4(mix(uHorizon, uZenith, t), 1.0); }`} />
    </mesh>
    {Array.from({ length: 15 }, (_, i) => {
      const angle = i * 2.39996;
      const radius = 74 + i % 4 * 13;
      return <group key={i} position={[Math.sin(angle) * radius, 25 + i % 5 * 7, Math.cos(angle) * radius]}>
        {[0, 1, 2].map((n) => <mesh key={n} position={[(n - 1) * 7, n % 2 * 1.8, n * 1.3]}
          scale={[8.5 - n, 1.45 + n * 0.18, 3.2]}>
          <sphereGeometry args={[1, 10, 7]} />
          <meshBasicMaterial color={ascendant ? '#ecf9fa' : '#f2e9df'} fog={false}
            transparent opacity={0.24 + (i % 3) * 0.055} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>)}
      </group>;
    })}
  </group>;
}

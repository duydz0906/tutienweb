import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

// Kenney Nature Kit / statue_ring.glb (CC0-1.0), self-hosted with provenance
// in public/aura/README.md. A real 3D arch model, NOT a sprite or screenshot.
const REALM_COLORS = [
  '#000000', '#000000', '#87ecd0', '#9fcaee', '#bbaef4', '#d8b887',
  '#f2a76d', '#db97b5', '#c7b0fb', '#e6c579', '#a8f1fc', '#fff0c7',
] as const;
let modelPromise: Promise<THREE.Group> | undefined;
function loadRing(): Promise<THREE.Group> {
  if (!modelPromise) {
    const url = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/aura/realm-ring.glb`;
    modelPromise = new GLTFLoader().loadAsync(url).then(({ scene }) => scene).catch((error) => {
      modelPromise = undefined;
      throw error;
    });
  }
  return modelPromise;
}

/** Realm power is cosmetic only; shared public realm is server-owned. Each major realm
 * from Trúc Cơ changes the model's tint, orbit height and number of sigils. */
export function RealmAura({ realm }: { realm: number }) {
  const frame = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Group>(null);
  const [model, setModel] = useState<THREE.Group | null>(null);
  const color = REALM_COLORS[Math.max(2, Math.min(realm, REALM_COLORS.length - 1))];
  const sigils = Math.min(10, 2 + realm);
  useEffect(() => {
    let active = true;
    let clone: THREE.Group | null = null;
    void loadRing().then((scene) => {
      if (!active) return;
      clone = scene.clone(true);
      clone.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.material = new THREE.MeshStandardMaterial({
          color, emissive: color, emissiveIntensity: 0.72, metalness: 0.36,
          roughness: 0.35, transparent: true, opacity: 0.43,
          depthWrite: false, side: THREE.DoubleSide,
        });
      });
      setModel(clone);
    }).catch((error) => console.warn('[realm-aura] CC0 Kenney ring unavailable:', error));
    return () => {
      active = false;
      if (clone) clone.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          const material = node.material;
          for (const item of Array.isArray(material) ? material : [material]) item.dispose();
        }
      });
    };
  }, [color]);
  useFrame(({ clock }, delta) => {
    if (frame.current) {
      frame.current.rotation.y += delta * (0.15 + realm * 0.006);
      frame.current.position.y = Math.sin(clock.elapsedTime * 1.7) * 0.045;
    }
    if (halo.current) halo.current.rotation.y -= delta * 0.35;
  });
  const phases = useMemo(() => Array.from({ length: sigils }, (_, index) => index * Math.PI * 2 / sigils), [sigils]);
  return <group>
    <group ref={frame} position={[0, 0.06, -0.48]}>
      {model && <primitive object={model} scale={3.05} />}
    </group>
    <group ref={halo}>
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.84, 0.93, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.32 + realm * 0.015} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {realm >= 5 && <mesh position={[0, 1.15, -0.4]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.18, 0.018, 5, 44]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>}
      {phases.map((angle, index) => <mesh key={index}
        position={[Math.sin(angle) * 0.94, 0.15 + Math.sin(index * 1.7) * 0.12, Math.cos(angle) * 0.94]}
        rotation={[0, angle, Math.PI / 4]}>
        <octahedronGeometry args={[realm >= 8 ? 0.105 : 0.07, 0]} />
        <meshBasicMaterial color={color} transparent opacity={0.58} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>)}
    </group>
  </group>;
}

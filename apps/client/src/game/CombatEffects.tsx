import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SKILLS, type CombatEvent } from '@van-thuong/shared';
import { labelTexture } from './Billboard';

export type CombatVisual = CombatEvent & { visualId: string };

/** Floating 3D damage billboard, not an HTML HUD overlay. Critical hits flash red and grow. */
function DamageBillboard({ event }: { event: CombatVisual }) {
  const positive = event.type === 'heal';
  const text = `${positive ? '+' : '-'}${Math.round(event.damage ?? 0).toLocaleString('vi-VN')}${event.critical ? '  BẠO KÍCH!' : ''}`;
  const texture = useMemo(() => labelTexture(text, positive ? '#a3ffcf' : event.critical ? '#ffb4a2' : '#fff2d8', Boolean(event.critical)),
    [text, positive, event.critical]);
  const sprite = useRef<THREE.Sprite>(null);
  const material = useRef<THREE.SpriteMaterial>(null);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(() => {
    const progress = Math.min(1, (Date.now() - event.at) / 1550);
    if (sprite.current) {
      sprite.current.position.y = (event.type === 'hit' ? 3.4 : 2.15) + progress * 1.5;
      const size = (event.critical ? 4 : 2.6) * (1 + Math.sin(progress * Math.PI) * 0.23);
      sprite.current.scale.set(size, size / 4, 1);
    }
    if (material.current) {
      material.current.opacity = Math.max(0, 1 - progress ** 1.4);
      if (event.critical) material.current.color.set(Math.sin(progress * 40) > 0 ? '#ffffff' : '#ff7373');
    }
  });
  return <sprite ref={sprite} position={[event.position.x, 2.1, event.position.z]} scale={[2.6, 0.65, 1]} renderOrder={9}>
    <spriteMaterial ref={material} map={texture} depthTest={false} depthWrite={false} transparent toneMapped={false} />
  </sprite>;
}

/** A curved mesh sweeps in front of the attacker's sword during a validated melee swing. */
function SwordTrail({ event, facing }: { event: CombatVisual; facing: number }) {
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const progress = Math.min(1, (Date.now() - event.at) / 480);
    if (group.current) group.current.rotation.z = -0.65 + progress * 2;
    if (material.current) material.current.opacity = Math.max(0, 0.83 * (1 - progress));
  });
  return <group position={[event.position.x, 1.13, event.position.z]} rotation={[0, facing, 0]}>
    <group ref={group} position={[0, 0, 1.15]}>
      <mesh rotation={[0.1, 0, -0.3]}>
        <torusGeometry args={[1.05, 0.095, 5, 30, Math.PI * 1.2]} />
        <meshBasicMaterial ref={material} color="#a1ffe3" transparent opacity={0.83} side={THREE.DoubleSide}
          depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </group>
  </group>;
}

/** Casting state: magic circle beneath the player and a burst of 3D particles. */
function CastingGlyph({ event }: { event: CombatVisual }) {
  const ref = useRef<THREE.Group>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const skill = event.skillId ? SKILLS[event.skillId] : undefined;
  const color = skill?.color ?? '#a4ffe7';
  const particles = useMemo(() => {
    const positions = new Float32Array(30 * 3);
    for (let i = 0; i < 30; i++) {
      const angle = i * 2.39996;
      positions[i * 3] = Math.cos(angle) * (0.5 + (i % 8) * 0.105);
      positions[i * 3 + 1] = 0.18 + (i * 13 % 19) / 15;
      positions[i * 3 + 2] = Math.sin(angle) * (0.5 + (i % 8) * 0.105);
    }
    return positions;
  }, []);
  useFrame((_, delta) => {
    const age = Math.min(1, (Date.now() - event.at) / 1300);
    if (ref.current) { ref.current.rotation.y += delta * 2.1; ref.current.scale.setScalar(0.7 + age * 0.9); }
    if (material.current) material.current.opacity = 0.85 * (1 - age);
  });
  const p = event.origin ?? event.position;
  return <group position={[p.x, 0.12, p.z]} ref={ref}>
    {[1.1, 0.78, 0.39].map((r) => <mesh key={r} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[r, r + 0.045, 48]} />
      <meshBasicMaterial ref={r === 1.1 ? material : undefined} color={color} transparent opacity={0.75} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>)}
    {Array.from({ length: 10 }, (_, i) => <mesh key={i} rotation={[-Math.PI / 2, 0, i * Math.PI / 5]} position={[Math.sin(i * Math.PI / 5) * 0.96, 0.01, Math.cos(i * Math.PI / 5) * 0.96]}>
      <planeGeometry args={[0.11, 0.23]} /><meshBasicMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>)}
    <points position={[0, 0.13, 0]}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[particles, 3]} /></bufferGeometry>
      <pointsMaterial color={color} size={0.075} transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  </group>;
}

export function CombatFeedback({ event, facing = 0 }: { event: CombatVisual; facing?: number }) {
  if (event.type === 'swing') return <SwordTrail event={event} facing={facing} />;
  if (event.type === 'cast') return <CastingGlyph event={event} />;
  if (event.damage && ['hit', 'monster-hit', 'monster-attack', 'boss-hit', 'heal', 'lightning'].includes(event.type))
    return <DamageBillboard event={event} />;
  return null;
}

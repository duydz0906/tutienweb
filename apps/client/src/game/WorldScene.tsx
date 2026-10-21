import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SKILLS, type Appearance, type Gender, type NpcId, type OwnCharacter, type PublicPlayer, type SpiritRoot,
  type TribulationState, type WorldSnapshot } from '@van-thuong/shared';
import { AdminFireTrail, Avatar } from './Avatar';
import { SceneEngine } from './SceneEngine';
import { Overworld, SkillVfx, TrialArena, type VisualEffect } from './WorldDecor';
import { SectScene } from './SectScene';
import { SectArchitecture } from './SectArchitecture';
import { Wilderness } from './Wilderness';
import { CombatFeedback } from './CombatEffects';

const BloomEffects = lazy(() => import('./BloomEffects'));

export type PreviewOptions = { name: string; gender: Gender; appearance: Appearance; view: 'body' | 'face'; root?: SpiritRoot };
type Props = {
  character: OwnCharacter | null; world: WorldSnapshot | null; trial: TribulationState | null;
  preview: PreviewOptions; appearanceDraft?: Appearance | null; editorView?: 'body' | 'face' | null; effects: VisualEffect[];
  touch: React.RefObject<{ right: number; forward: number }>;
  onInput: (input: { x: number; z: number; rotation: number }) => void;
  onPickup: (id: string) => void; onGather: (id: string) => void; onPortal: () => void;
  onNpc: (id: NpcId) => void; onTarget: (id: string) => void; selectedTarget: string | null;
};

function publicFromOwn(c: OwnCharacter): PublicPlayer {
  return {
    id: c.id, name: c.name, gender: c.gender, appearance: c.appearance, root: c.root,
    realm: c.realm, minorStage: c.minorStage, path: c.path, hp: c.hp, maxHp: c.maxHp,
    position: c.position, rotation: c.rotation, isAdmin: c.isAdmin, devMode: c.devMode, shieldUntil: c.shieldUntil,
    equipment: Object.fromEntries(Object.entries(c.equipment).map(([slot, instanceId]) => [slot,
      c.inventory.find((item) => item.instanceId === instanceId)?.itemId]).filter(([, item]) => item)) as PublicPlayer['equipment'],
  };
}

function SceneContent({ character, world, trial, preview, appearanceDraft, editorView, effects, touch, onInput, onPickup,
  onGather, onPortal, onNpc, onTarget, selectedTarget }: Props) {
  const { scene, camera, gl } = useThree();
  const engine = useRef<SceneEngine | null>(null);
  const avatar = useRef<THREE.Group>(null);
  const lastCinematic = useRef('');
  const inTrial = character?.scene === 'tribulation';
  const zone = character?.scene === 'wilderness' ? 'wilderness' : 'overworld';
  // Snapshot packets from the previous zone must never be rendered after a teleport.
  const visibleWorld = !character || world?.scene === character.scene ? world : null;
  useEffect(() => {
    const controller = new SceneEngine(scene, camera as THREE.PerspectiveCamera, gl.domElement);
    engine.current = controller;
    return () => { controller.dispose(); engine.current = null; };
  }, [scene, camera, gl]);
  useEffect(() => { engine.current?.setAtmosphere(Boolean(inTrial), Boolean(character?.isAdmin), zone === 'wilderness'); }, [inTrial, character?.isAdmin, zone]);
  useEffect(() => {
    if (!character) return;
    document.body.style.cursor = '';
    avatar.current?.position.set(character.position.x, character.position.y, character.position.z);
    avatar.current?.rotation.set(0, character.rotation, 0);
    engine.current?.enterZone(character.scene, character.position);
  }, [character?.id, character?.scene]);
  useEffect(() => {
    engine.current?.setPreviewView(character ? editorView ?? null : preview.view,
      character && editorView ? avatar.current?.rotation.y ?? character.rotation : undefined);
  }, [character?.id, preview.view, editorView]);
  useEffect(() => {
    const latest = effects.at(-1);
    if (!latest || latest.visualId === lastCinematic.current || !character) return;
    lastCinematic.current = latest.visualId;
    if (latest.type === 'cast' && latest.sourceId === character.id && latest.skillId && SKILLS[latest.skillId]?.ultimate) engine.current?.playCinematic();
    if ((latest.type === 'boss-hit' || latest.type === 'lightning') && latest.targetId === character.id ||
        latest.type === 'cast' && latest.sourceId === character.id && ['earth_shatter', 'diamond_body'].includes(latest.skillId ?? '')) {
      engine.current?.shake();
    }
  }, [effects, character?.id]);

  const local = useMemo<PublicPlayer>(() => character ? { ...publicFromOwn(character),
    appearance: appearanceDraft ?? character.appearance,
  } : {
    id: 'preview', name: preview.name || 'Tân đệ tử', position: { x: 0, y: 0, z: 10 },
    rotation: 0, hp: 120, maxHp: 120, realm: 0, minorStage: 0, path: null, gender: preview.gender,
    appearance: preview.appearance, root: preview.root ?? { tier: 'chan', elements: ['moc', 'thuy'], multiplier: 1 },
    equipment: { robe: 'novice_robe' }, isAdmin: false, devMode: false,
  }, [character, preview, appearanceDraft]);
  const others = useMemo(() => (visibleWorld?.players ?? []).filter((player) => player.id !== character?.id), [visibleWorld?.players, character?.id]);
  const serverPosition = character && visibleWorld?.players.find((player) => player.id === character.id)?.position || local.position;

  // Network movement ticks independently of WebGL frames (which can slow down while loading avatars).
  useEffect(() => {
    if (!character) return;
    const send = () => {
      const controller = engine.current;
      if (!controller) return;
      controller.setTouchInput(touch.current.right, touch.current.forward);
      onInput(editorView ? { x: 0, z: 0, rotation: avatar.current?.rotation.y ?? character.rotation } : controller.getMovement());
    };
    const timer = window.setInterval(send, 50);
    return () => window.clearInterval(timer);
  }, [character?.id, character?.scene, editorView, onInput, touch]);

  useFrame((_, delta) => {
    const controller = engine.current;
    if (!controller) return;
    controller.setTouchInput(touch.current.right, touch.current.forward);
    controller.update(delta, avatar.current, serverPosition, character?.isAdmin ? 30 : 6, Boolean(character) && !editorView);
  });

  return <>
    {inTrial ? <TrialArena trial={trial} playerPosition={serverPosition} /> : <>
      <Overworld zone={zone} boss={visibleWorld?.boss ?? null} drops={visibleWorld?.drops ?? []} formations={visibleWorld?.formations ?? []} onPickup={onPickup} />
      {zone === 'overworld' ? <>
        <SectArchitecture playerPosition={serverPosition} />
        {character && <SectScene playerPosition={serverPosition} onInteract={onNpc} onTravel={onPortal} />}
      </> : character && <Wilderness monsters={visibleWorld?.monsters ?? []} herbs={visibleWorld?.herbs ?? []}
        playerPosition={serverPosition} selectedTarget={selectedTarget} onSelect={onTarget} onGather={onGather} onTravel={onPortal} />}
    </>}
    <Avatar player={local} local={Boolean(character)} preview={!character} groupRef={avatar}
      attackAt={effects.filter((e) => e.type === 'swing' && e.sourceId === local.id).at(-1)?.at} />
    {local.devMode && <AdminFireTrail player={local} avatarRef={avatar} />}
    {!inTrial && others.map((player) => <Avatar key={player.id} player={player}
      attackAt={effects.filter((e) => e.type === 'swing' && e.sourceId === player.id).at(-1)?.at} />)}
    {!inTrial && others.filter((player) => player.devMode).map((player) => <AdminFireTrail key={`trail-${player.id}`} player={player} />)}
    {effects.filter((effect) => Date.now() - effect.at < 1800).map((effect) => <group key={effect.visualId}>
      <SkillVfx event={effect} />
      <CombatFeedback event={effect} facing={visibleWorld?.players.find((p) => p.id === effect.sourceId)?.rotation ?? local.rotation} />
    </group>)}
    {!window.matchMedia('(max-width: 720px), (prefers-reduced-motion: reduce)').matches &&
      <Suspense fallback={null}><BloomEffects /></Suspense>}
  </>;
}

export function WorldScene(props: Props) {
  return <div className="world-canvas" aria-label="Thế giới 3D Vân Thượng">
    <Canvas shadows dpr={[1, window.matchMedia('(max-width: 720px)').matches ? 1.2 : 1.65]} camera={{ fov: 52, near: 0.1, far: 210, position: [8, 8, 20] }}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping }}
      fallback={<div className="webgl-fallback">Trình duyệt cần hỗ trợ WebGL để hiển thị thế giới 3D.</div>}>
      <SceneContent {...props} />
    </Canvas>
  </div>;
}

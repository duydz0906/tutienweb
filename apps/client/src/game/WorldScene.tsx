import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SKILLS, isWorldZone, MAX_REALM, houseLevel, type Appearance, type Gender, type NpcId, type OwnCharacter, type PublicPlayer, type SpiritRoot,
  type TribulationState, type WorldSnapshot } from '@van-thuong/shared';
import { AdminFireTrail, Avatar } from './Avatar';
import { SceneEngine } from './SceneEngine';
import { clearFlightInput, flightInput, setFlightInput } from './flightInput';
import { Overworld, SkillVfx, TrialArena, type VisualEffect } from './WorldDecor';
import { SectScene } from './SectScene';
import { SectArchitecture } from './SectArchitecture';
import { Wilderness } from './Wilderness';
import { VillageScene } from './VillageScene';
import { ResidenceInterior, SanctumInterior } from './PrivateScenes';
import { SectWayfinding } from './SectWayfinding';
import { CombatFeedback } from './CombatEffects';

const BloomEffects = lazy(() => import('./BloomEffects'));

export type PreviewOptions = { name: string; gender: Gender; appearance: Appearance; view: 'body' | 'face'; root?: SpiritRoot };
type Props = {
  character: OwnCharacter | null; world: WorldSnapshot | null; trial: TribulationState | null;
  preview: PreviewOptions; effects: VisualEffect[];
  touch: React.RefObject<{ right: number; forward: number }>;
  onInput: (input: { x: number; z: number; rotation: number }) => void;
  onPickup: (id: string) => void; onGather: (id: string) => void; onPortal: () => void;
  onNpc: (id: NpcId) => void; onTarget: (id: string) => void; selectedTarget: string | null;
  onWorldAction: (event: string) => void; onOpenPanel: (panel: 'home' | 'rebirth') => void;
  /** Left click on the 3D world swings the basic attack, exactly like J. */
  onAttack: () => void; cameraLock: boolean; jumpAt: number;
};

function publicFromOwn(c: OwnCharacter): PublicPlayer {
  return {
    id: c.id, name: c.name, gender: c.gender, appearance: c.appearance, root: c.root,
    realm: c.realm, minorStage: c.minorStage, path: c.path, hp: c.hp, maxHp: c.maxHp,
    position: c.position, rotation: c.rotation, isAdmin: c.isAdmin, devMode: c.devMode, shieldUntil: c.shieldUntil, flying: c.flying,
    equipment: Object.fromEntries(Object.entries(c.equipment).map(([slot, instanceId]) => [slot,
      c.inventory.find((item) => item.instanceId === instanceId)?.itemId]).filter(([, item]) => item)) as PublicPlayer['equipment'],
  };
}

function SceneContent({ character, world, trial, preview, effects, touch, onInput, onPickup,
  onGather, onPortal, onNpc, onTarget, selectedTarget, onWorldAction, onOpenPanel, onAttack, cameraLock, jumpAt }: Props) {
  const { scene, camera, gl } = useThree();
  const engine = useRef<SceneEngine | null>(null);
  const avatar = useRef<THREE.Group>(null);
  const lastCinematic = useRef('');
  const inTrial = character?.scene === 'tribulation';
  const zone = character && isWorldZone(character.scene) ? character.scene : 'overworld';
  // Snapshot packets from the previous zone must never be rendered after a teleport.
  const visibleWorld = !character || world?.scene === character.scene ? world : null;
  useEffect(() => {
    const controller = new SceneEngine(scene, camera as THREE.PerspectiveCamera, gl.domElement);
    engine.current = controller;
    return () => { controller.dispose(); engine.current = null; };
  }, [scene, camera, gl]);
  useEffect(() => { engine.current?.setAtmosphere(Boolean(inTrial), Boolean(character?.isAdmin), zone === 'wilderness',
    zone === 'ascendant', character?.scene === 'residence' || character?.scene === 'sanctum'); }, [inTrial, character?.isAdmin, character?.scene, zone]);
  useEffect(() => {
    if (!character) return;
    document.body.style.cursor = '';
    avatar.current?.position.set(character.position.x, character.position.y, character.position.z);
    avatar.current?.rotation.set(0, character.rotation, 0);
    engine.current?.enterZone(character.scene, character.position);
  }, [character?.id, character?.scene]);
  useEffect(() => {
    engine.current?.setPreviewView(character ? null : preview.view);
  }, [character?.id, preview.view]);
  // Y: hand the camera to the engine in locked third person and snap it behind the body.
  useEffect(() => { engine.current?.setCameraLock(cameraLock, character?.rotation); }, [cameraLock, character?.id]);
  // Space: the engine owns the hop so an avatar re-render can never cancel it mid-air.
  useEffect(() => { if (jumpAt) engine.current?.triggerJump(); }, [jumpAt]);

  /**
   * Flying height: Space climbs, Shift descends, and the engine lifts the whole avatar group (not
   * just the mesh) so the chase camera follows. Server positions stay on the ground plane.
   */
  const altitude = useRef(0);
  useEffect(() => {
    const hold = (event: KeyboardEvent, pressed: boolean): void => {
      if (event.code === 'Space') setFlightInput('up', pressed);
      else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') setFlightInput('down', pressed);
      else return;
      if (character?.flying) event.preventDefault();
    };
    const onDown = (event: KeyboardEvent) => hold(event, true);
    const onUp = (event: KeyboardEvent) => hold(event, false);
    // Losing focus mid-climb must not leave the rider pinned at the ceiling.
    const onBlur = () => clearFlightInput();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [character?.flying]);
  // Left click on the ground is the basic attack; dragging still orbits the camera.
  useEffect(() => {
    engine.current?.setPrimaryAction(onAttack);
    return () => engine.current?.setPrimaryAction(null);
  }, [onAttack]);
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

  const local = useMemo<PublicPlayer>(() => character ? publicFromOwn(character) : {
    id: 'preview', name: preview.name || 'Tân đệ tử', position: { x: 0, y: 0, z: 10 },
    rotation: 0, hp: 120, maxHp: 120, realm: 0, minorStage: 0, path: null, gender: preview.gender,
    appearance: preview.appearance, root: preview.root ?? { tier: 'chan', elements: ['moc', 'thuy'], multiplier: 1 },
    equipment: { robe: 'novice_robe' }, isAdmin: false, devMode: false,
  }, [character, preview]);
  const others = useMemo(() => (visibleWorld?.players ?? []).filter((player) => player.id !== character?.id), [visibleWorld?.players, character?.id]);
  const serverPosition = character && visibleWorld?.players.find((player) => player.id === character.id)?.position || local.position;

  // Network movement ticks independently of WebGL frames (which can slow down while loading avatars).
  useEffect(() => {
    if (!character) return;
    const send = () => {
      const controller = engine.current;
      if (!controller) return;
      controller.setTouchInput(touch.current.right, touch.current.forward);
      onInput(controller.getMovement());
    };
    const timer = window.setInterval(send, 50);
    return () => window.clearInterval(timer);
  }, [character?.id, character?.scene, onInput, touch]);

  useFrame((_, delta) => {
    const controller = engine.current;
    if (!controller) return;
    controller.setTouchInput(touch.current.right, touch.current.forward);
    // Flight height: held Space/Shift steers it, and it settles back to the ground on landing.
    const dt = Math.min(delta, 0.05);
    const flying = Boolean(character?.flying) && character?.scene !== 'tribulation';
    const climb = flying ? (flightInput.up ? 1 : 0) - (flightInput.down ? 1 : 0) : 0;
    // No ceiling: climb as high as you like (the camera's far plane is the only limit). Descending
    // is held-Shift or, once the mount is gone, a slow glide down instead of a drop to the floor.
    if (climb) altitude.current = Math.max(0, altitude.current + climb * 7.5 * dt);
    else if (!flying && altitude.current > 0) altitude.current = Math.max(0, altitude.current - 3.4 * dt);
    controller.setFlightAltitude(altitude.current);
    controller.setFlightAltitude(altitude.current);
    // A mounted rider really moves faster; the server uses the same speed for its own ticks.
    controller.update(delta, avatar.current, serverPosition, character?.flying ? 10.5 : 6, Boolean(character));
  });

  return <>
    {inTrial ? <TrialArena trial={trial} playerPosition={serverPosition} /> : character?.scene === 'residence' ?
      <ResidenceInterior name={character.name} level={houseLevel(character.devMode ? MAX_REALM : character.highestRealm)}
        playerPosition={serverPosition} onOpenStorage={() => onOpenPanel('home')} onExit={() => onWorldAction('home:exit')} /> :
      character?.scene === 'sanctum' ? <SanctumInterior playerPosition={serverPosition} reborn={character.rebirths > 0}
        onOpenRebirth={() => onOpenPanel('rebirth')} onAscend={() => onWorldAction('sanctum:ascend')}
        onExit={() => onWorldAction('sanctum:exit')} /> : character?.scene === 'village' ? <>
      <VillageScene playerPosition={serverPosition} onInteract={onNpc} onTravel={onPortal} />
    </> : <>
      <Overworld zone={zone} playerPosition={serverPosition} boss={visibleWorld?.boss ?? null}
        drops={visibleWorld?.drops ?? []} formations={visibleWorld?.formations ?? []} onPickup={onPickup} />
      {zone === 'overworld' ? <>
        <SectArchitecture playerPosition={serverPosition} />
        {character && <>
          <SectScene playerPosition={serverPosition} onInteract={onNpc} onTravel={onPortal} />
          <SectWayfinding character={character} playerPosition={serverPosition}
            onEnterHome={() => onWorldAction('home:enter')} onEnterSanctum={() => onWorldAction('sanctum:enter')}
            onEnterVillage={() => onWorldAction('village:enter')} />
        </>}
      </> : character && <Wilderness zone={zone === 'ascendant' ? 'ascendant' : 'wilderness'} monsters={visibleWorld?.monsters ?? []} herbs={visibleWorld?.herbs ?? []}
        playerPosition={serverPosition} selectedTarget={selectedTarget} onSelect={onTarget} onGather={onGather} onTravel={onPortal} />}
    </>}
    <Avatar player={local} local={Boolean(character)} preview={!character} groupRef={avatar}
      attackAt={effects.filter((e) => e.type === 'swing' && e.sourceId === local.id).at(-1)?.at}
      castAt={effects.filter((e) => e.type === 'cast' && e.sourceId === local.id).at(-1)?.at} />
    {local.devMode && <AdminFireTrail player={local} avatarRef={avatar} />}
    {!inTrial && others.map((player) => <Avatar key={player.id} player={player}
      attackAt={effects.filter((e) => e.type === 'swing' && e.sourceId === player.id).at(-1)?.at}
      castAt={effects.filter((e) => e.type === 'cast' && e.sourceId === player.id).at(-1)?.at} />)}
    {!inTrial && others.filter((player) => player.devMode).map((player) => <AdminFireTrail key={`trail-${player.id}`} player={player} />)}
    {effects.filter((effect) => Date.now() - effect.at < 1800).map((effect) => <group key={effect.visualId}>
      <SkillVfx event={effect} />
      <CombatFeedback event={effect} facing={visibleWorld?.players.find((p) => p.id === effect.sourceId)?.rotation ?? local.rotation} />
    </group>)}
    {!window.matchMedia('(max-width: 720px), (prefers-reduced-motion: reduce)').matches &&
      <Suspense fallback={null}><BloomEffects /></Suspense>}
  </>;
}

function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

export function WorldScene(props: Props) {
  // R3F's fallback alone does not catch every renderer-construction error (notably
  // WebGL disabled by policy). Keep login and HUD usable rather than blanking the app.
  const supported = useMemo(supportsWebGL2, []);
  return <div className="world-canvas" aria-label="Thế giới 3D Vân Thượng">
    {supported ? <Canvas shadows dpr={[1, window.matchMedia('(max-width: 720px)').matches ? 1.2 : 1.65]} camera={{ fov: 52, near: 0.1, far: 1600, position: [8, 8, 20] }}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping }}
      fallback={<div className="webgl-fallback">Trình duyệt cần hỗ trợ WebGL để hiển thị thế giới 3D.</div>}>
      <SceneContent {...props} />
    </Canvas> : <div className="webgl-fallback">Trình duyệt cần hỗ trợ WebGL 2 để hiển thị thế giới 3D.</div>}
  </div>;
}

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FLIGHT_SPEED, ITEMS, SKILLS, WALK_SPEED, isWorldZone, MAX_REALM, houseLevel, type Appearance, type Gender, type MoveObstacle, type NpcId, type OwnCharacter,
  type PublicPlayer, type SpiritRoot, type TribulationState, type WorldSnapshot } from '@van-thuong/shared';
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
import { LandingPuff } from './LandingPuff';
import { stepFlight } from './flight';
import type { MoveContext } from './SceneEngine';
import { LOCAL_DELAY_MS, STALE_MS, clearPlayerTracks, playerTrack, recordMotion } from './interpolation';

const BloomEffects = lazy(() => import('./BloomEffects'));

/**
 * The round obstacles the server refuses to let a body walk through, rebuilt from the snapshot the
 * client already has. Kept identical to `World.tick` (same radii, same filters) — a mismatch would
 * show up as the body stopping on the client at a different spot than the server allows.
 */
function obstaclesFor(scene: OwnCharacter['scene'], world: WorldSnapshot | null, selfId: string): MoveObstacle[] {
  if (!world || world.scene !== scene) return [];
  const obstacles: MoveObstacle[] = [];
  if (scene === 'wilderness' && world.boss && world.boss.hp > 0) obstacles.push({ position: world.boss.position, radius: 2.7 });
  if (scene === 'wilderness' || scene === 'ascendant') {
    for (const monster of world.monsters) if (monster.hp > 0) obstacles.push({ position: monster.position, radius: monster.radius + 0.35 });
  }
  for (const player of world.players) if (player.id !== selfId) obstacles.push({ position: player.position, radius: 1.05 });
  return obstacles;
}

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
  /** Flight height and vertical speed, integrated by `flight.ts` so no rule can snap it. */
  const flight = useRef({ altitude: 0, velocity: 0 });
  /** Where and when the last touchdown happened, for the dust ring. */
  const [landing, setLanding] = useState<{ at: number; x: number; z: number } | null>(null);
  /** Set by the frame governor when even the lowest resolution is not enough: bloom is the first thing to go. */
  const [lowQuality, setLowQuality] = useState(false);
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
    flight.current = { altitude: 0, velocity: 0 }; // never arrive in a new zone still airborne
    avatar.current?.position.set(character.position.x, character.position.y, character.position.z);
    avatar.current?.rotation.set(0, character.rotation, 0);
    engine.current?.enterZone(character.scene, character.position);
    // A new map invalidates every position sample: interpolating across a portal would drag the
    // body (and everyone else's) across the old map for a couple of frames.
    clearPlayerTracks();
    playerTrack(character.id).reset(performance.now(), character.position.x, character.position.z);
  }, [character?.id, character?.scene]);

  /**
   * Feed the interpolation tracks the moment a packet lands. The *arrival* time matters, not the
   * position alone: a body that stopped keeps sending the same coordinates, and only the timing
   * tells the track that its velocity is now zero.
   */
  useEffect(() => {
    if (!visibleWorld) return;
    const at = performance.now();
    for (const player of visibleWorld.players) recordMotion(playerTrack(player.id), at, player.position.x, player.position.z);
  }, [visibleWorld]);

  /** Off the public maps (home, sanctum, tribulation) the character itself is the only reference. */
  useEffect(() => {
    if (!character || visibleWorld?.players.some((player) => player.id === character.id)) return;
    recordMotion(playerTrack(character.id), performance.now(), character.position.x, character.position.z);
  }, [visibleWorld, character?.id, character?.position, character?.scene]);
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
   *
   * Take-off is not an assignment either — `hoverAltitude` is the height the integrator eases the
   * rider *towards*, so mounting lifts them smoothly and never pops them into the air.
   */
  const mountItem = character?.equipment.mount
    ? character.inventory.find((item) => item.instanceId === character.equipment.mount)?.itemId : undefined;
  const hoverAltitude = (mountItem ? ITEMS[mountItem]?.flight?.altitude : undefined) ?? 1.9;
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
  // A shared empty array and memoised slices: an inline `?? []` is a new identity every snapshot,
  // which defeats the memo on every component that consumes it.
  const drops = useMemo(() => visibleWorld?.drops ?? [], [visibleWorld?.drops]);
  const formations = useMemo(() => visibleWorld?.formations ?? [], [visibleWorld?.formations]);
  const monsters = useMemo(() => visibleWorld?.monsters ?? [], [visibleWorld?.monsters]);
  const herbs = useMemo(() => visibleWorld?.herbs ?? [], [visibleWorld?.herbs]);
  // A stable callback: a fresh arrow every render made the avatar re-render with the HUD's 10 Hz
  // snapshot, for no benefit — it only ever reads the engine's current steering.
  const movementIntent = useCallback(() => engine.current?.movementInput() ?? 0, []);
  const serverPosition = character && visibleWorld?.players.find((player) => player.id === character.id)?.position || local.position;

  // Network movement ticks independently of WebGL frames (which can slow down while loading avatars).
  // Thirty times a second rather than twenty: the server can only ever move the body with the last
  // input it received, so this interval *is* part of the delay the prediction has to hide.
  useEffect(() => {
    if (!character) return;
    const send = () => {
      const controller = engine.current;
      if (!controller) return;
      controller.setTouchInput(touch.current.right, touch.current.forward);
      onInput(controller.getMovement());
    };
    const timer = window.setInterval(send, 30);
    return () => window.clearInterval(timer);
  }, [character?.id, character?.scene, onInput, touch]);

  useFrame((_, delta) => {
    const controller = engine.current;
    if (!controller) return;
    controller.setTouchInput(touch.current.right, touch.current.forward);
    // Flight height: held Space/Shift steers it and it settles back to the ground on landing.
    // Every rule lives in `stepFlight` — acceleration limits, the landing curve and the hover — so
    // take-off, hovering, Shift-descent and dismounting all move continuously.
    const flying = Boolean(character?.flying) && character?.scene !== 'tribulation';
    const climb = flying ? (flightInput.up ? 1 : 0) - (flightInput.down ? 1 : 0) : 0;
    const next = stepFlight(flight.current, delta, { flying, climb, hover: hoverAltitude });
    flight.current = { altitude: next.altitude, velocity: next.velocity };
    controller.setFlightAltitude(next.altitude);
    if (next.landed) {
      setLanding({ at: performance.now(), x: avatar.current?.position.x ?? serverPosition.x,
        z: avatar.current?.position.z ?? serverPosition.z });
    }
    // Reconcile against the interpolated path, not the newest packet. The packets arrive ten times
    // a second, and pulling the body towards a stepped position is what made walking — and flying
    // twice as much — visibly judder. The engine's prediction is untouched: it still starts on the
    // frame the key is pressed, this only decides where the correction is measured against.
    const now = performance.now();
    // The delay adapts to the measured packet interval, so the playback point always sits between
    // two real samples instead of guessing past the newest one.
    const delay = character ? playerTrack(character.id).delayMs : LOCAL_DELAY_MS;
    const track = character ? playerTrack(character.id) : null;
    // A track whose newest packet is old (the tab stalled, the socket hiccuped) says nothing useful:
    // reconciling against it would drag the body to a place it left half a second ago.
    const fresh = !track || track.ageMs(now) < STALE_MS;
    const path = track && fresh ? track.at(now - delay) : null;
    const reference = path ? { x: path.x, y: serverPosition.y, z: path.z } : serverPosition;
    // Predict with the server's own movement rule and the same obstacles it collides with, so the
    // body stops at a wall here exactly where the server does — no correction, no slide.
    const moveContext: MoveContext | undefined = character ? {
      scene: character.scene,
      // In the air the rider is above walls, monsters and heads: the server stops colliding there, so
      // the client must stop too — otherwise it would brake for an obstacle the server ignores, or
      // miss one it does not, and every such disagreement is a visible hitch.
      obstacles: character.flying ? [] : obstaclesFor(character.scene, visibleWorld, character.id),
      collide: character.scene !== 'tribulation' && !character.flying,
    } : undefined;
    // A mounted rider really moves faster; the server uses the same speed for its own ticks.
    controller.update(delta, avatar.current, reference, character?.flying ? FLIGHT_SPEED : WALK_SPEED,
      Boolean(character), moveContext, delay);
  });

  return <>
    {inTrial ? <TrialArena trial={trial} playerPosition={serverPosition} /> : character?.scene === 'residence' ?
      <ResidenceInterior name={character.name} level={houseLevel(character.devMode ? MAX_REALM : character.highestRealm)}
        playerPosition={serverPosition} onOpenStorage={() => onOpenPanel('home')} onExit={() => onWorldAction('home:exit')} /> :
      character?.scene === 'sanctum' ? <SanctumInterior playerPosition={serverPosition} reborn={character.rebirths > 0}
        canRebirth={character.realm === MAX_REALM && character.minorStage === 9}
        onOpenRebirth={() => onOpenPanel('rebirth')} onAscend={() => onWorldAction('sanctum:ascend')}
        onExit={() => onWorldAction('sanctum:exit')} /> : character?.scene === 'village' ? <>
      <VillageScene playerPosition={serverPosition} onInteract={onNpc} onTravel={onPortal} />
    </> : <>
      <Overworld zone={zone} playerPosition={serverPosition} boss={visibleWorld?.boss ?? null}
        drops={drops} formations={formations} onPickup={onPickup} />
      {zone === 'overworld' ? <>
        <SectArchitecture playerPosition={serverPosition} />
        {character && <>
          <SectScene playerPosition={serverPosition} onInteract={onNpc} onTravel={onPortal} />
          <SectWayfinding character={character} playerPosition={serverPosition}
            onEnterHome={() => onWorldAction('home:enter')} onEnterSanctum={() => onWorldAction('sanctum:enter')}
            onEnterVillage={() => onWorldAction('village:enter')} />
        </>}
      </> : character && <Wilderness zone={zone === 'ascendant' ? 'ascendant' : 'wilderness'} monsters={monsters} herbs={herbs}
        playerPosition={serverPosition} selectedTarget={selectedTarget} onSelect={onTarget} onGather={onGather} onTravel={onPortal} />}
    </>}
    <Avatar player={local} local={Boolean(character)} preview={!character} groupRef={avatar} intent={movementIntent}
      attackAt={effects.filter((e) => e.type === 'swing' && e.sourceId === local.id).at(-1)?.at}
      castAt={effects.filter((e) => e.type === 'cast' && e.sourceId === local.id).at(-1)?.at} />
    {landing && <LandingPuff key={landing.at} x={landing.x} z={landing.z} />}
    {local.devMode && <AdminFireTrail player={local} avatarRef={avatar} />}
    {!inTrial && others.map((player) => <Avatar key={player.id} player={player}
      attackAt={effects.filter((e) => e.type === 'swing' && e.sourceId === player.id).at(-1)?.at}
      castAt={effects.filter((e) => e.type === 'cast' && e.sourceId === player.id).at(-1)?.at} />)}
    {!inTrial && others.filter((player) => player.devMode).map((player) => <AdminFireTrail key={`trail-${player.id}`} player={player} />)}
    {effects.filter((effect) => Date.now() - effect.at < 1800).map((effect) => <group key={effect.visualId}>
      <SkillVfx event={effect} />
      <CombatFeedback event={effect} facing={visibleWorld?.players.find((p) => p.id === effect.sourceId)?.rotation ?? local.rotation} />
    </group>)}
    {!lowQuality && !window.matchMedia('(max-width: 720px), (prefers-reduced-motion: reduce)').matches &&
      <Suspense fallback={null}><BloomEffects /></Suspense>}
    <FrameGovernor onLowQuality={setLowQuality} />
  </>;
}

/**
 * Frame-time governor: the one place that decides how many pixels this machine can afford.
 *
 * The scene is large (a 600 m map, hundreds of static meshes, a shadow pass and a bloom pass), so on
 * a weaker GPU the frame time — not the movement maths — is what makes a long flight feel uneven.
 * Instead of guessing a fixed resolution for everyone, this watches the real frame rate and, in
 * order, lowers the render resolution (invisible in motion, cheap) and finally drops the bloom pass
 * (a pure cosmetic overlay). When the machine is comfortable again it walks the resolution back up
 * slowly, so a single lucky second never causes an oscillation.
 *
 * It only ever lowers quality because the *movement* must stay smooth: a blurred scene at 60 fps
 * reads far better than a crisp one that hitches every few seconds.
 */
function FrameGovernor({ onLowQuality }: { onLowQuality: (low: boolean) => void }) {
  const setDpr = useThree((state) => state.setDpr);
  const mobile = useMemo(() => window.matchMedia('(max-width: 720px)').matches, []);
  const ceiling = mobile ? 1.15 : 1.5;
  const state = useRef({ frames: 0, elapsed: 0, ratio: 0, low: false, calm: 0 });
  useFrame((_, delta) => {
    const s = state.current;
    s.frames += 1;
    s.elapsed += Math.min(delta, 0.5); // a tab that was asleep must not count as a slow second
    if (s.elapsed < 1) return;
    const fps = s.frames / s.elapsed;
    s.frames = 0;
    s.elapsed = 0;
    if (s.ratio === 0) s.ratio = Math.min(ceiling, window.devicePixelRatio || 1);
    if (fps < 45) {
      s.calm = 0;
      if (s.ratio > 0.8) {
        s.ratio = Math.max(0.8, Number((s.ratio - 0.15).toFixed(2)));
        setDpr(s.ratio);
      } else if (!s.low) {
        s.low = true;
        onLowQuality(true);
      }
    } else if (fps > 57) {
      s.calm += 1;
      if (s.calm < 4) return; // four calm seconds before spending pixels again
      if (s.low) { s.low = false; onLowQuality(false); }
      else if (s.ratio < ceiling) {
        s.ratio = Math.min(ceiling, Number((s.ratio + 0.1).toFixed(2)));
        setDpr(s.ratio);
      }
    }
  });
  return null;
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

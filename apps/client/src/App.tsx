import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { AlertCircle, CheckCircle2, LoaderCircle, Sparkles, X } from 'lucide-react';
import { DEFAULT_APPEARANCE, ASCENDANT_GATE, HOME_CHEST, HOME_EXIT, HOME_GATE, MAX_REALM, PORTALS, REBIRTH_ALTAR, SANCTUM_EXIT, SECRET_GATE, SKILLS, VILLAGE_GATE, isSafeScene, isWorldZone, skillRealm, type ActionResult, type ChatMessage, type CombatEvent, type DailyQuestProgress, type LeaderboardEntry,
  type MotionUpdate, type NpcId, type OwnCharacter, type Path, type TribulationState, type WorldSnapshot } from '@van-thuong/shared';
import { WorldScene, type PreviewOptions } from './game/WorldScene';
import { type VisualEffect } from './game/WorldDecor';
import { playSwordWhoosh } from './game/sound';
import { LoginScreen } from './components/LoginScreen';
import { CharacterCreation } from './components/CharacterCreation';
import { GameHUD } from './components/GameHUD';
import { TouchJoystick } from './components/TouchJoystick';
import { FlightControls } from './components/FlightControls';
import { Panels, PathModal, type ActivePanel, type AdminPlayer } from './components/Panels';
import { ApiError, api } from './lib/api';
import { loadHudPrefs, saveHudPrefs, type HudPrefs } from './lib/uiPrefs';
import { canUseDevTools } from './lib/devTools';
import { describeAuthError, firebaseEnabled, loginGoogle, loginPassword, logoutFirebase, observeFirebase, registerPassword, resendVerification, resetPassword } from './lib/firebase';
import type { User } from 'firebase/auth';

type Phase = 'loading' | 'login' | 'create' | 'reveal' | 'entering' | 'game';
type Session = { kind: 'demo'; token: string } | { kind: 'firebase'; token: string; user: User };
type Toast = { id: string; text: string; kind: 'good' | 'bad' | 'info' };
const DEMO_KEY = 'van-thuong:demo-session';
const GUEST_KEY = 'van-thuong:local-guest'; // opt-in guest identity survives a local dev restart
/**
 * Set as soon as someone chooses a real player account. `npm run dev` normally opens the Daniel965
 * sandbox automatically; this flag keeps that convenience from stealing the session back after a
 * logout, so a normal player can log in and only ever sees the normal panels.
 */
const PLAYER_MODE_KEY = 'van-thuong:player-mode';
const initialPreview: PreviewOptions = { name: '', gender: 'nu', appearance: { ...DEFAULT_APPEARANCE }, view: 'body' };
// Cooldown, mana and miss results are already shown on the skill slot / combat feedback.
const SCENE_LABEL: Record<string, string> = {
  overworld: 'Tông Môn · Vân Thượng', wilderness: 'Hoang Vực', ascendant: 'Thượng Giới',
  village: 'Vân Cốc thôn', residence: 'Đệ Tử Xá', sanctum: 'Mật Thất Tái Sinh', tribulation: 'Lôi Kiếp',
};
const QUIET_CAST = /(đang hồi|chân khí|không trúng|Đòn đánh trượt|Sinh lực đã đầy|Hãy để chiêu trước)/i;

/** A dead API is by far the most common "cannot enter" cause; say what to do about it. */
function connectionMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : '';
  if (/Failed to fetch|NetworkError|Load failed|ECONNREFUSED|ERR_CONNECTION/i.test(text)) {
    return 'Không kết nối được máy chủ game (cổng 3001). Hãy chắc chắn "npm run dev" vẫn đang chạy rồi thử lại.';
  }
  return text ? `Không thể kết nối máy chủ: ${text}` : 'Máy chủ chưa sẵn sàng.';
}

export function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  /** Bumped by "Kiểm tra lại máy chủ" so a failed health check can be retried without a reload. */
  const [bootAttempt, setBootAttempt] = useState(0);
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [localDevAvailable, setLocalDevAvailable] = useState(false);
  /** True only when the API was started by `npm run dev` (signed local sandbox). */
  const [devSandbox, setDevSandbox] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [character, setCharacter] = useState<OwnCharacter | null>(null);
  const [preview, setPreview] = useState<PreviewOptions>(initialPreview);
  const [error, setError] = useState<string | null>(null);
  /** Friendly, non-blocking confirmation (verification mail, reset link, registration done). */
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Scene transition curtain: percentage feedback while the next zone's props stream in. */
  const [travelCurtain, setTravelCurtain] = useState<{ key: number; name: string } | null>(null);
  const [travelPercent, setTravelPercent] = useState(0);
  const lastSceneRef = useRef<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [world, setWorld] = useState<WorldSnapshot | null>(null);
  const [trial, setTrial] = useState<TribulationState | null>(null);
  const [effects, setEffects] = useState<VisualEffect[]>([]);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [panel, setPanel] = useState<ActivePanel>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [pathModal, setPathModal] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [roster, setRoster] = useState<AdminPlayer[]>([]);
  const [now, setNow] = useState(Date.now());
  const [hudPrefs, setHudPrefs] = useState<HudPrefs>(loadHudPrefs);
  const [lastCast, setLastCast] = useState<{ id: number; name: string } | null>(null);
  /** Timestamp of the last Space press; the avatar turns it into a purely visual hop. */
  const [jumpAt, setJumpAt] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const touchMovement = useRef({ right: 0, forward: 0 });
  const previousRealm = useRef(0);
  const previousScene = useRef<string | null>(null);
  const livePositionRef = useRef<{ x: number; z: number } | null>(null);
  livePositionRef.current = world?.scene === character?.scene ?
    world?.players.find((p) => p.id === character?.id)?.position ?? character?.position ?? null : character?.position ?? null;

  useEffect(() => { saveHudPrefs(hudPrefs); }, [hudPrefs]);
  const updateHudPrefs = useCallback((patch: Partial<HudPrefs>) => setHudPrefs((current) => ({ ...current, ...patch })), []);

  const notify = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    // Keep at most two compact notices on screen; repeated combat ticks replace themselves.
    setToasts((current) => [...current.filter((toast) => toast.text !== text).slice(-1), { id, text, kind }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000);
  }, []);

  const attach = useCallback(async (nextSession: Session): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ identity: { displayName: string; isAdmin: boolean }; character: OwnCharacter | null }>('/api/me', nextSession.token);
      setSession(nextSession);
      setCharacter(response.character);
      setWorld(null);
      setSelectedTarget(null);
      setPhase(response.character ? 'entering' : 'create');
      previousRealm.current = response.character?.realm ?? 0;
      setPanel(null);
    } catch (e) {
      // Never discard a saved guest identity because of a temporary network/server error.
      if (nextSession.kind === 'demo' && e instanceof ApiError && e.status === 401) {
        sessionStorage.removeItem(DEMO_KEY);
        if (localStorage.getItem(GUEST_KEY) === nextSession.token) localStorage.removeItem(GUEST_KEY);
      }
      setPhase('login');
      setError(e instanceof Error ? e.message : 'Không thể kết nối tài khoản.');
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    void (async () => {
      try {
        const health = await api<{ ok: boolean; mode: 'demo' | 'production'; devAutoLogin?: boolean }>('/api/health');
        if (cancelled) return;
        setDemoAvailable(health.mode === 'demo');
        setLocalDevAvailable(health.mode === 'demo' && health.devAutoLogin === true);
        setDevSandbox(health.mode === 'demo' && health.devAutoLogin === true);
        // `npm run dev` opens the sandbox account directly, unless this browser deliberately
        // switched to a normal player account (logout / guest / email login).
        if (health.mode === 'demo' && health.devAutoLogin && !sessionStorage.getItem(PLAYER_MODE_KEY)) {
          const { token } = await api<{ token: string }>('/api/dev/session', undefined, { method: 'POST' });
          if (cancelled) return;
          sessionStorage.setItem(DEMO_KEY, token);
          await attach({ kind: 'demo', token });
          return;
        }
        const restoreDemo = () => {
          const token = sessionStorage.getItem(DEMO_KEY);
          if (token && health.mode === 'demo') void attach({ kind: 'demo', token });
          else setPhase('login');
        };
        if (firebaseEnabled && health.mode !== 'demo') {
          unsubscribe = observeFirebase((user) => {
            if (cancelled) return;
            if (!user) { restoreDemo(); return; }
            void user.getIdToken().then((token) => { if (!cancelled) void attach({ kind: 'firebase', token, user }); })
              .catch(() => { if (!cancelled) { setError('Không thể xác thực phiên Firebase.'); setPhase('login'); } });
          });
        } else restoreDemo();
      } catch (e) {
        if (cancelled) return;
        setPhase('login');
        setError(connectionMessage(e));
      }
    })();
    return () => { cancelled = true; unsubscribe(); };
  }, [attach, bootAttempt]);

  const inWorld = phase === 'entering' || phase === 'game';
  useEffect(() => {
    if (!inWorld || !session || !character) return;
    const socket = io({
      path: '/socket.io',
      auth: (callback) => {
        if (session.kind === 'firebase') void session.user.getIdToken().then((token) => callback({ token })).catch(() => callback({ token: '' }));
        else callback({ token: session.token });
      },
      reconnectionDelay: 800,
      reconnectionDelayMax: 4500,
    });
    socketRef.current = socket;
    socket.on('connect', () => { setConnected(true); setError(null); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (e: Error) => { setConnected(false); setError(e.message); if (!e.message.includes('websocket error')) notify(e.message, 'bad'); });
    socket.on('fatal', (text: string) => { notify(text, 'bad'); setError(text); setWorld(null); setPhase('entering'); });
    socket.on('world', (snapshot: WorldSnapshot) => { setWorld(snapshot); setError(null); setPhase((current) => current === 'entering' ? 'game' : current); });
    socket.on('character', (next: OwnCharacter) => setCharacter(next));
    // Private rooms and trials have no world snapshot; this 10 Hz reference keeps their movement
    // smooth instead of stepping once a second.
    socket.on('motion', (next: MotionUpdate) => setCharacter((current) => current && current.scene === next.scene
      ? { ...current, position: next.position, rotation: next.rotation } : current));
    socket.on('tribulation', (next: TribulationState) => setTrial(next.active ? next : null));
    socket.on('cooldowns', (next: Record<string, number>) => setCooldowns(next));
    socket.on('admin:players', (next: AdminPlayer[]) => setRoster(next));
    socket.on('chat', (msg: ChatMessage) => setMessages((prev) => [...prev.slice(-49), msg]));
    socket.on('notice', (text: string) => {
      if (!text.startsWith('Chào mừng')) notify(text, 'info');
      setMessages((prev) => [...prev.slice(-49), { id: `${Date.now()}-${Math.random()}`, text, name: 'Thiên đạo', system: true, at: Date.now() }]);
    });
    socket.on('combat', (event: CombatEvent) => {
      const visual = { ...event, at: Date.now(), visualId: `${Date.now()}-${Math.random()}` };
      setEffects((prev) => [...prev.filter((effect) => Date.now() - effect.at < 1600), visual]);
    });
    return () => { socket.removeAllListeners(); socket.disconnect(); socketRef.current = null; setConnected(false); };
  }, [inWorld, session?.token, character?.id, notify]);

  useEffect(() => {
    if (phase !== 'entering') return;
    const timeout = setTimeout(() => setError((current) => current ?? 'Kết nối thế giới quá lâu. Vui lòng thử lại.'), 12000);
    return () => clearTimeout(timeout);
  }, [phase]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // A freshly registered account starts unverified; remind once without blocking play.
    if (phase === 'game' && session?.kind === 'firebase' && !session.user.emailVerified) {
      setNotice('Email chưa xác thực: bạn vẫn chơi được, nhưng hãy xác thực để bảo vệ tài khoản.');
      void resendVerification().catch(() => {});
    }
  }, [phase, session?.kind]);

  useEffect(() => {
    if (phase === 'game' && character && character.realm >= 2 && !character.path && previousRealm.current < 2) setPathModal(true);
    if (character) previousRealm.current = character.realm;
  }, [character?.realm, character?.path, phase]);

  useEffect(() => {
    const scene = character?.scene;
    if (!scene) { lastSceneRef.current = null; return; }
    const previous = lastSceneRef.current;
    lastSceneRef.current = scene;
    // Tribulation fades in on its own; every real move (portal, home, village, sanctum) gets the
    // travel curtain, which also hides the first frames of the new zone while props stream in.
    if (!previous || previous === scene || scene === 'tribulation') return;
    setTravelPercent(0);
    setTravelCurtain({ key: Date.now(), name: SCENE_LABEL[scene] ?? 'Đang chuyển cảnh' });
  }, [character?.scene]);

  useEffect(() => {
    if (!travelCurtain) return;
    const started = performance.now();
    const tick = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - started) / 900);
      setTravelPercent(Math.round(progress * 100));
      if (progress >= 1) window.clearInterval(tick);
    }, 55);
    // A short tail after 100% so nobody sees the new zone half-built.
    const clear = window.setTimeout(() => setTravelCurtain(null), 1080);
    return () => { window.clearInterval(tick); window.clearTimeout(clear); };
  }, [travelCurtain?.key]);

  useEffect(() => {
    if (!character) { previousScene.current = null; return; }
    if (previousScene.current && previousScene.current !== character.scene) {
      setSelectedTarget(null);
      setEffects([]);
      setMessages([]); // world chat and VFX belong to one instance only
      setPanel(null);
    }
    previousScene.current = character.scene;
  }, [character?.id, character?.scene]);

  useEffect(() => {
    if (panel === 'leaderboard') void api<{ entries: LeaderboardEntry[] }>('/api/leaderboard')
      .then((data) => setLeaderboard(data.entries)).catch((e) => notify(e instanceof Error ? e.message : 'Không thể tải bảng xếp hạng.', 'bad'));
    if (panel === 'quests' && session) void api<{ day: string; quests: DailyQuestProgress[] }>('/api/quests/daily', session.token)
      .then((data) => setCharacter((current) => current ? { ...current, dailyDay: data.day, dailyQuests: data.quests } : current))
      .catch((e) => notify(e instanceof Error ? e.message : 'Không thể tải nhiệm vụ.', 'bad'));
  }, [panel, session?.token, notify]);

  const retryServer = useCallback(() => {
    setError(null);
    setPhase('loading');
    setBootAttempt((attempt) => attempt + 1);
  }, []);

  const enterDemo = async () => {
    setBusy(true);
    setError(null);
    sessionStorage.setItem(PLAYER_MODE_KEY, '1');
    try {
      // A guest is separate from Daniel965, and can return to the same local save after a restart.
      const guest = localDevAvailable ? localStorage.getItem(GUEST_KEY) : null;
      if (guest) {
        try {
          await api('/api/me', guest);
          sessionStorage.setItem(DEMO_KEY, guest);
          await attach({ kind: 'demo', token: guest });
          return;
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) localStorage.removeItem(GUEST_KEY);
          else throw e;
        }
      }
      const result = await api<{ token: string }>('/api/demo/session', undefined, { method: 'POST' });
      if (localDevAvailable) localStorage.setItem(GUEST_KEY, result.token);
      sessionStorage.setItem(DEMO_KEY, result.token);
      await attach({ kind: 'demo', token: result.token });
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể vào bản chơi thử.'); }
    finally { setBusy(false); }
  };
  /** Return to the local `npm run dev` sandbox from the login screen. */
  const enterDevSandbox = async () => {
    setBusy(true);
    setError(null);
    try {
      sessionStorage.removeItem(PLAYER_MODE_KEY);
      const { token } = await api<{ token: string }>('/api/dev/session', undefined, { method: 'POST' });
      sessionStorage.setItem(DEMO_KEY, token);
      await attach({ kind: 'demo', token });
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể mở dev sandbox.'); }
    finally { setBusy(false); }
  };
  const enterGoogle = async () => { setBusy(true); setError(null); try { await loginGoogle(); }
    catch (e) { setError(describeAuthError(e)); } finally { setBusy(false); } };
  const enterPassword = async (email: string, password: string) => { setBusy(true); setError(null); try { await loginPassword(email, password); }
    catch (e) { setError(describeAuthError(e)); } finally { setBusy(false); } };
  const enterRegister = async (email: string, password: string, name: string) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      await registerPassword(email, password, name);
      setNotice('Tài khoản đã tạo. Kiểm tra email để xác thực, rồi tạo nhân vật đầu tiên.');
    } catch (e) { setError(describeAuthError(e)); }
    finally { setBusy(false); }
  };
  const sendReset = async (email: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await resetPassword(email); setNotice('Đã gửi email đặt lại mật khẩu. Hãy kiểm tra hộp thư.'); }
    catch (e) { setError(describeAuthError(e)); }
    finally { setBusy(false); }
  };

  const create = async () => {
    if (!session || busy) return;
    setBusy(true); setError(null);
    try {
      const data = await api<{ character: OwnCharacter }>('/api/characters', session.token, { method: 'POST', body: JSON.stringify({ name: preview.name, gender: preview.gender, appearance: preview.appearance }) });
      setCharacter(data.character);
      setPhase('reveal');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể tạo nhân vật.'); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    touchMovement.current = { right: 0, forward: 0 };
    socketRef.current?.disconnect();
    sessionStorage.removeItem(DEMO_KEY);
    // Logging out is an explicit choice to leave the sandbox account.
    sessionStorage.setItem(PLAYER_MODE_KEY, '1');
    if (session?.kind === 'firebase') await logoutFirebase().catch(() => {});
    setSession(null); setCharacter(null); setWorld(null); setTrial(null); setMessages([]); setPanel(null); setSelectedTarget(null);
    setPhase('login'); setError(null); setNotice(null);
  };

  const action = useCallback(async (event: string, payload: object = {}, options?: { quiet?: boolean }): Promise<boolean> => {
    const socket = socketRef.current;
    if (!socket?.connected) { notify('Đang kết nối thế giới. Vui lòng chờ...', 'bad'); return false; }
    try {
      const result = await new Promise<ActionResult>((resolve, reject) => {
        socket.timeout(6000).emit(event, payload, (error: Error | null, response: ActionResult) => {
          if (error) reject(new Error('Máy chủ không phản hồi. Hãy thử lại.'));
          else resolve(response);
        });
      });
      if (!result.ok) {
        // A cooling skill only counts down on its slot, never as a toast over the battlefield.
        if (!options?.quiet || !QUIET_CAST.test(result.error)) notify(result.error, 'bad');
        return false;
      }
      if (result.character) setCharacter(result.character);
      if (result.message && !options?.quiet) notify(result.message, 'good');
      return true;
    } catch (e) { notify(e instanceof Error ? e.message : 'Thao tác thất bại.', 'bad'); return false; }
  }, [notify]);

  const openPanel = (next: ActivePanel) => setPanel(next);
  const retryWorld = () => {
    setError(null);
    setWorld(null);
    const socket = socketRef.current;
    if (socket) { socket.disconnect(); socket.connect(); }
    else if (session) void attach(session);
  };

  const input = useCallback((movement: { x: number; z: number; rotation: number }) => {
    if (socketRef.current?.connected) socketRef.current.emit('input', movement);
  }, []);
  const pickup = useCallback((id: string) => { void action('pickup', { dropId: id }); }, [action]);
  const gather = useCallback((id: string) => { void action('gather', { nodeId: id }); }, [action]);
  const travel = useCallback(() => { void action('portal:travel'); }, [action]);
  const skill = useCallback((id: string) => {
    const definition = SKILLS[id];
    // Locked/cooling keys stay silent: the slot itself already shows the countdown.
    if (!definition || !character || character.hp <= 0 || !isWorldZone(character.scene)) return;
    if (definition.id !== 'healing_bloom' && isSafeScene(character.scene)) return;
    if (character.realm < skillRealm(definition) || (definition.path && definition.path !== character.path)) return;
    if (!character.devMode && (cooldowns[definition.id] ?? 0) > Date.now()) return;
    const stamp = Date.now();
    setLastCast({ id: stamp, name: definition.name });
    window.setTimeout(() => setLastCast((current) => current?.id === stamp ? null : current), 1600);
    const activeWorld = world?.scene === character?.scene ? world : null;
    const boss = activeWorld?.boss;
    const target = selectedTarget && (activeWorld?.monsters.some((m) => m.id === selectedTarget && m.hp > 0) ||
      selectedTarget === boss?.id && boss.hp > 0) ? selectedTarget :
      [...(activeWorld?.monsters.filter((m) => m.hp > 0) ?? []), ...(boss && boss.hp > 0 ? [boss] : [])]
        .sort((a, b) => Math.hypot(a.position.x - (livePositionRef.current?.x ?? 0), a.position.z - (livePositionRef.current?.z ?? 0)) -
          Math.hypot(b.position.x - (livePositionRef.current?.x ?? 0), b.position.z - (livePositionRef.current?.z ?? 0)))[0]?.id;
    void action('cast', { skillId: id, ...(id !== 'healing_bloom' && target ? { targetId: target } : {}) }, { quiet: true });
  }, [action, world, selectedTarget, character, cooldowns]);
  const basicAttack = useCallback(() => { playSwordWhoosh(); void action('basic-attack', { targetId: selectedTarget }, { quiet: true }); }, [action, selectedTarget]);
  const interactNpc = useCallback((id: NpcId) => {
    if (phase !== 'game') return;
    // The village elder points newcomers at the handbook instead of opening a shop.
    openPanel(id === 'master' ? 'sect' : id === 'quest' ? 'quests' : id === 'alchemist' ? 'alchemy' : id === 'beast' ? 'beast'
      : id === 'village_elder' ? 'help' : id === 'innkeeper' || id === 'tavern' || id === 'sect_inn' ? 'inn' : 'shop');
  }, [phase]);
  const chat = useCallback((text: string) => { socketRef.current?.emit('chat', text); }, []);
  const selectPath = (path: Path) => { void action('choose-path', { path }).then((ok) => { if (ok) setPathModal(false); }); };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (character?.isAdmin && event.ctrlKey && event.shiftKey && event.code === 'F12') {
        event.preventDefault(); setPanel((prev) => prev === 'admin' ? null : 'admin'); return;
      }
      if (phase !== 'game' || !character || event.repeat || event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.code === 'Escape') { openPanel(null); setPathModal(false); }
      if (event.code === 'KeyI') openPanel(panel === 'inventory' ? null : 'inventory');
      if (event.code === 'KeyQ') openPanel(panel === 'quests' ? null : 'quests');
      if (event.code === 'KeyK') openPanel(panel === 'skills' ? null : 'skills');
      if (event.code === 'KeyM') openPanel(panel === 'menu' ? null : 'menu');
      if (event.code === 'KeyC' && !panel) updateHudPrefs({ chatOpen: !hudPrefs.chatOpen });
      if (event.code === 'KeyT' && !panel) updateHudPrefs({ cultivateOpen: !hudPrefs.cultivateOpen });
      if (event.code === 'KeyR' && !panel && !pathModal) void action('flight:toggle');
      // Y pins the camera behind the character (locked third person).
      if (event.code === 'KeyY' && !panel && !pathModal && !event.ctrlKey && !event.metaKey)
        updateHudPrefs({ cameraLock: !hudPrefs.cameraLock });
      if (event.code === 'KeyF' && character.scene === 'tribulation' && !panel) void action('guard');
      const position = livePositionRef.current ?? character.position;
      const near = (target: { position: { x: number; z: number }; radius: number }) =>
        Math.hypot(position.x - target.position.x, position.z - target.position.z) <= target.radius;
      if (event.code === 'KeyE' && !panel && !pathModal) {
        const gate = isWorldZone(character.scene) ? PORTALS[character.scene] : null;
        if (gate && near(gate)) { event.preventDefault(); travel(); }
        else if (character.scene === 'overworld' && near(VILLAGE_GATE)) { event.preventDefault(); void action('village:enter'); }
        else if (character.scene === 'overworld' && near(HOME_GATE)) { event.preventDefault(); void action('home:enter'); }
        else if (character.scene === 'overworld' && (character.rebirths > 0 || character.realm === MAX_REALM && character.minorStage === 9) && near(SECRET_GATE)) {
          event.preventDefault(); void action('sanctum:enter');
        }
        else if (character.scene === 'residence' && near(HOME_CHEST)) { event.preventDefault(); openPanel('home'); }
        else if (character.scene === 'residence' && near(HOME_EXIT)) { event.preventDefault(); void action('home:exit'); }
        else if (character.scene === 'sanctum' && character.rebirths > 0 && near(ASCENDANT_GATE)) { event.preventDefault(); void action('sanctum:ascend'); }
        // The altar only responds at Tiên Đế tầng 9 — the same rule the server enforces.
        else if (character.scene === 'sanctum' && character.realm === MAX_REALM && character.minorStage === 9 && near(REBIRTH_ALTAR)) { event.preventDefault(); openPanel('rebirth'); }
        else if (character.scene === 'sanctum' && near(SANCTUM_EXIT)) { event.preventDefault(); void action('sanctum:exit'); }
      }
      if (event.code === 'KeyJ' && !panel && !pathModal &&
          (character.scene === 'wilderness' || character.scene === 'ascendant')) {
        event.preventDefault(); basicAttack();
      }
      // Space hops on the spot: presentation only, the server position stays on the ground plane.
      if (event.code === 'Space' && !panel && !pathModal) {
        event.preventDefault();
        if (!character.flying && character.hp > 0 && character.scene !== 'tribulation' &&
            character.scene !== 'residence' && character.scene !== 'sanctum') setJumpAt(Date.now());
      }
      const digit = /^Digit([1-9])$/.exec(event.code);
      if (digit && !panel && !pathModal) {
        const move = character.hotbar[Number(digit[1]) - 1];
        if (move) skill(move);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [character?.isAdmin, character?.hotbar, character?.scene, character?.rebirths, character?.realm, character?.minorStage,
    phase, panel, pathModal, skill, basicAttack, action, travel, hudPrefs.chatOpen, hudPrefs.cultivateOpen, hudPrefs.cameraLock, updateHudPrefs]);

  const devTools = canUseDevTools(character, devSandbox);
  useEffect(() => {
    // A player who switched accounts must not keep an open dev drawer.
    if (!devTools && panel === 'dev') setPanel(null);
  }, [devTools, panel]);
  const showCharacter = inWorld ? character : null;
  const livePosition = world && character && world.scene === character.scene ? world.players.find((p) => p.id === character.id)?.position : null;
  const panelCharacter = character && livePosition ? { ...character, position: livePosition } : character;
  const scenePreview = phase === 'reveal' && character ? { ...preview, root: character.root } : preview;
  return <div className="app-shell">
    <WorldScene character={showCharacter} world={phase === 'game' ? world : null} trial={trial} preview={scenePreview}
      effects={effects}
      touch={touchMovement} onInput={input} onPickup={pickup} onGather={gather} onPortal={travel} onNpc={interactNpc}
      onTarget={setSelectedTarget} selectedTarget={selectedTarget}
      onAttack={basicAttack} cameraLock={hudPrefs.cameraLock} jumpAt={jumpAt}
      onWorldAction={(event) => { void action(event); }} onOpenPanel={openPanel} />
    <div className="vignette" aria-hidden="true" />
    {travelCurtain && <div className={`travel-curtain ${travelPercent >= 100 ? 'done' : ''}`} role="status" aria-live="polite">
      <div className="travel-card">
        <span className="travel-seal" aria-hidden="true">雲</span>
        <span className="eyebrow">DỊCH CHUYỂN · ĐANG TẢI</span>
        <strong>{travelCurtain.name}</strong>
        <div className="travel-bar"><i style={{ width: `${travelPercent}%` }} /></div>
        <span className="travel-percent">{travelPercent}%</span>
      </div>
    </div>}
    {phase === 'loading' && <div className="loading-screen"><div className="loading-mark">雲</div><LoaderCircle size={24} className="spinner" /><span>Đang mở cổng Vân Thượng...</span></div>}
    {phase === 'login' && <LoginScreen demoAvailable={demoAvailable} firebaseAvailable={firebaseEnabled && !demoAvailable} busy={busy} error={error}
      notice={notice} onRegister={enterRegister} onReset={sendReset} devSandboxAvailable={localDevAvailable}
      onDevSandbox={() => { void enterDevSandbox(); }}
      onDemo={() => { void enterDemo(); }} onRetry={retryServer}
      onGoogle={() => { void enterGoogle(); }} onPassword={(email, password) => { void enterPassword(email, password); }} />}
    {(phase === 'create' || phase === 'reveal') && <CharacterCreation preview={preview} onChange={(next) => { setPreview(next); setError(null); }} onCreate={() => { void create(); }}
      busy={busy} error={error} revealed={phase === 'reveal' ? character : null}
      onEnter={() => { setWorld(null); setError(null); setPhase('entering'); }} onBack={() => { void logout(); }} />}
    {phase === 'entering' && <div className="loading-screen world-entry" role="status">
      <div className="loading-mark">雲</div><LoaderCircle size={29} className="spinner" />
      <strong>Đang mở cổng vào Vân Thượng...</strong><span>Đợi thế giới đồng bộ nhân vật của bạn.</span>
      {error && <><p className="inline-error" role="alert">{error}</p><div className="entry-actions">
        <button className="btn btn-gold" onClick={retryWorld}>Thử kết nối lại</button>
        <button className="btn btn-quiet" onClick={() => { void logout(); }}>Về đăng nhập</button>
      </div></>}
    </div>}
    {phase === 'game' && character && <>
      <GameHUD character={character} world={world} trial={trial} connected={connected} cooldowns={cooldowns} messages={messages} panel={panel} selectedTarget={selectedTarget}
        hudPrefs={hudPrefs} onHudPrefs={updateHudPrefs} lastCast={lastCast} devTools={devTools}
        onPanel={openPanel} onAction={(event, payload) => { void action(event, payload); }} onSkill={skill} onAttack={basicAttack} onChat={chat} onOpenPath={() => setPathModal(true)} onPickup={pickup} now={now} />
      <TouchJoystick movement={touchMovement} />
      {character.flying && character.scene !== 'tribulation' && <FlightControls />}
      <Panels panel={panel} onClose={() => openPanel(null)} onNavigate={openPanel} onOpenPath={() => { openPanel(null); setPathModal(true); }} character={panelCharacter ?? character} leaderboard={leaderboard} roster={roster} onAction={(event, payload) => { void action(event, payload); }} onLogout={() => { void logout(); }}
        connected={connected} devTools={devTools} hudPrefs={hudPrefs} onHudPrefs={updateHudPrefs} />
      {pathModal && character.realm >= 2 && (!character.path || devTools) && <PathModal devMode={devTools} onClose={() => setPathModal(false)} onSelect={selectPath} />}
    </>}
    <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div key={toast.id} className={`toast toast-${toast.kind}`}>{toast.kind === 'bad' ? <AlertCircle size={18} /> : toast.kind === 'good' ? <CheckCircle2 size={18} /> : <Sparkles size={18} />}<span>{toast.text}</span><button aria-label="Đóng thông báo" onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}><X size={14} /></button></div>)}</div>
  </div>;
}

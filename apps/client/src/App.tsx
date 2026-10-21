import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { AlertCircle, CheckCircle2, LoaderCircle, Sparkles, X } from 'lucide-react';
import { DEFAULT_APPEARANCE, ASCENDANT_GATE, HOME_CHEST, HOME_EXIT, HOME_GATE, MAX_REALM, PORTALS, REBIRTH_ALTAR, SANCTUM_EXIT, SECRET_GATE, isWorldZone, type ActionResult, type ChatMessage, type CombatEvent, type DailyQuestProgress, type LeaderboardEntry,
  type NpcId, type OwnCharacter, type Path, type TribulationState, type WorldSnapshot } from '@van-thuong/shared';
import { WorldScene, type PreviewOptions } from './game/WorldScene';
import { type VisualEffect } from './game/WorldDecor';
import { playSwordWhoosh } from './game/sound';
import { LoginScreen } from './components/LoginScreen';
import { CharacterCreation } from './components/CharacterCreation';
import { GameHUD } from './components/GameHUD';
import { TouchJoystick } from './components/TouchJoystick';
import { Panels, PathModal, type ActivePanel, type AdminPlayer } from './components/Panels';
import { ApiError, api } from './lib/api';
import { firebaseEnabled, loginGoogle, loginPassword, logoutFirebase, observeFirebase } from './lib/firebase';
import type { User } from 'firebase/auth';

type Phase = 'loading' | 'login' | 'create' | 'reveal' | 'entering' | 'game';
type Session = { kind: 'demo'; token: string } | { kind: 'firebase'; token: string; user: User };
type Toast = { id: string; text: string; kind: 'good' | 'bad' | 'info' };
const DEMO_KEY = 'van-thuong:demo-session';
const GUEST_KEY = 'van-thuong:local-guest'; // opt-in guest identity survives a local dev restart
const initialPreview: PreviewOptions = { name: '', gender: 'nu', appearance: { ...DEFAULT_APPEARANCE }, view: 'body' };

export function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [localDevAvailable, setLocalDevAvailable] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [character, setCharacter] = useState<OwnCharacter | null>(null);
  const [preview, setPreview] = useState<PreviewOptions>(initialPreview);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const socketRef = useRef<Socket | null>(null);
  const touchMovement = useRef({ right: 0, forward: 0 });
  const previousRealm = useRef(0);
  const previousScene = useRef<string | null>(null);
  const livePositionRef = useRef<{ x: number; z: number } | null>(null);
  livePositionRef.current = world?.scene === character?.scene ?
    world?.players.find((p) => p.id === character?.id)?.position ?? character?.position ?? null : character?.position ?? null;

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
        if (health.mode === 'demo' && health.devAutoLogin) {
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
        setError(e instanceof Error ? `Không thể kết nối máy chủ: ${e.message}` : 'Máy chủ chưa sẵn sàng.');
      }
    })();
    return () => { cancelled = true; unsubscribe(); };
  }, [attach]);

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
    if (phase === 'game' && character && character.realm >= 2 && !character.path && previousRealm.current < 2) setPathModal(true);
    if (character) previousRealm.current = character.realm;
  }, [character?.realm, character?.path, phase]);

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

  const enterDemo = async () => {
    setBusy(true);
    setError(null);
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
  const enterGoogle = async () => { setBusy(true); setError(null); try { await loginGoogle(); } catch (e) { setError(e instanceof Error ? e.message : 'Đăng nhập Google không thành công.'); } finally { setBusy(false); } };
  const enterPassword = async (email: string, password: string) => { setBusy(true); setError(null); try { await loginPassword(email, password); } catch (e) { setError(e instanceof Error ? e.message : 'Đăng nhập không thành công.'); } finally { setBusy(false); } };

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
    if (session?.kind === 'firebase') await logoutFirebase().catch(() => {});
    setSession(null); setCharacter(null); setWorld(null); setTrial(null); setMessages([]); setPanel(null); setSelectedTarget(null);
    setPhase('login'); setError(null);
  };

  const action = useCallback(async (event: string, payload: object = {}): Promise<boolean> => {
    const socket = socketRef.current;
    if (!socket?.connected) { notify('Đang kết nối thế giới. Vui lòng chờ...', 'bad'); return false; }
    try {
      const result = await new Promise<ActionResult>((resolve, reject) => {
        socket.timeout(6000).emit(event, payload, (error: Error | null, response: ActionResult) => {
          if (error) reject(new Error('Máy chủ không phản hồi. Hãy thử lại.'));
          else resolve(response);
        });
      });
      if (!result.ok) { notify(result.error, 'bad'); return false; }
      if (result.character) setCharacter(result.character);
      if (result.message) notify(result.message, 'good');
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
    const activeWorld = world?.scene === character?.scene ? world : null;
    const boss = activeWorld?.boss;
    const target = selectedTarget && (activeWorld?.monsters.some((m) => m.id === selectedTarget && m.hp > 0) ||
      selectedTarget === boss?.id && boss.hp > 0) ? selectedTarget :
      [...(activeWorld?.monsters.filter((m) => m.hp > 0) ?? []), ...(boss && boss.hp > 0 ? [boss] : [])]
        .sort((a, b) => Math.hypot(a.position.x - (livePositionRef.current?.x ?? 0), a.position.z - (livePositionRef.current?.z ?? 0)) -
          Math.hypot(b.position.x - (livePositionRef.current?.x ?? 0), b.position.z - (livePositionRef.current?.z ?? 0)))[0]?.id;
    void action('cast', { skillId: id, ...(id !== 'healing_bloom' && target ? { targetId: target } : {}) });
  }, [action, world, selectedTarget, character?.scene]);
  const basicAttack = useCallback(() => { playSwordWhoosh(); void action('basic-attack', { targetId: selectedTarget }); }, [action, selectedTarget]);
  const interactNpc = useCallback((id: NpcId) => {
    if (phase === 'game') openPanel(id === 'master' ? 'sect' : id === 'quest' ? 'quests' : id === 'alchemist' ? 'alchemy' : id === 'beast' ? 'beast' : 'shop');
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
      if (event.code === 'KeyF' && character.scene === 'tribulation' && !panel) void action('guard');
      const position = livePositionRef.current ?? character.position;
      const near = (target: { position: { x: number; z: number }; radius: number }) =>
        Math.hypot(position.x - target.position.x, position.z - target.position.z) <= target.radius;
      if (event.code === 'KeyE' && !panel && !pathModal) {
        const gate = isWorldZone(character.scene) ? PORTALS[character.scene] : null;
        if (gate && near(gate)) { event.preventDefault(); travel(); }
        else if (character.scene === 'overworld' && near(HOME_GATE)) { event.preventDefault(); void action('home:enter'); }
        else if (character.scene === 'overworld' && (character.rebirths > 0 || character.realm === MAX_REALM && character.minorStage === 9) && near(SECRET_GATE)) {
          event.preventDefault(); void action('sanctum:enter');
        }
        else if (character.scene === 'residence' && near(HOME_CHEST)) { event.preventDefault(); openPanel('home'); }
        else if (character.scene === 'residence' && near(HOME_EXIT)) { event.preventDefault(); void action('home:exit'); }
        else if (character.scene === 'sanctum' && character.rebirths > 0 && near(ASCENDANT_GATE)) { event.preventDefault(); void action('sanctum:ascend'); }
        else if (character.scene === 'sanctum' && !character.rebirths && near(REBIRTH_ALTAR)) { event.preventDefault(); openPanel('rebirth'); }
        else if (character.scene === 'sanctum' && near(SANCTUM_EXIT)) { event.preventDefault(); void action('sanctum:exit'); }
      }
      if ((event.code === 'KeyJ' || event.code === 'Space') && !panel && !pathModal &&
          (character.scene === 'wilderness' || character.scene === 'ascendant')) {
        event.preventDefault(); basicAttack();
      }
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(event.code) && !panel && !pathModal) {
        const move = character.hotbar[Number(event.code.slice(-1)) - 1];
        if (move) skill(move);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [character?.isAdmin, character?.hotbar, character?.scene, character?.rebirths, character?.realm, character?.minorStage,
    phase, panel, pathModal, skill, basicAttack, action, travel]);

  const showCharacter = inWorld ? character : null;
  const livePosition = world && character && world.scene === character.scene ? world.players.find((p) => p.id === character.id)?.position : null;
  const panelCharacter = character && livePosition ? { ...character, position: livePosition } : character;
  const scenePreview = phase === 'reveal' && character ? { ...preview, root: character.root } : preview;
  return <div className="app-shell">
    <WorldScene character={showCharacter} world={phase === 'game' ? world : null} trial={trial} preview={scenePreview}
      effects={effects}
      touch={touchMovement} onInput={input} onPickup={pickup} onGather={gather} onPortal={travel} onNpc={interactNpc}
      onTarget={setSelectedTarget} selectedTarget={selectedTarget}
      onWorldAction={(event) => { void action(event); }} onOpenPanel={openPanel} />
    <div className="vignette" aria-hidden="true" />
    {phase === 'loading' && <div className="loading-screen"><div className="loading-mark">雲</div><LoaderCircle size={24} className="spinner" /><span>Đang mở cổng Vân Thượng...</span></div>}
    {phase === 'login' && <LoginScreen demoAvailable={demoAvailable} firebaseAvailable={firebaseEnabled && !demoAvailable} busy={busy} error={error}
      onDemo={() => { void enterDemo(); }} onGoogle={() => { void enterGoogle(); }} onPassword={(email, password) => { void enterPassword(email, password); }} />}
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
        onPanel={openPanel} onAction={(event, payload) => { void action(event, payload); }} onSkill={skill} onAttack={basicAttack} onChat={chat} onOpenPath={() => setPathModal(true)} onPickup={pickup} now={now} />
      <TouchJoystick movement={touchMovement} />
      <Panels panel={panel} onClose={() => openPanel(null)} onNavigate={openPanel} onOpenPath={() => { openPanel(null); setPathModal(true); }} character={panelCharacter ?? character} leaderboard={leaderboard} roster={roster} onAction={(event, payload) => { void action(event, payload); }} onLogout={() => { void logout(); }}
        connected={connected} />
      {pathModal && character.realm >= 2 && (!character.path || character.devMode) && <PathModal devMode={character.devMode} onClose={() => setPathModal(false)} onSelect={selectPath} />}
    </>}
    <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div key={toast.id} className={`toast toast-${toast.kind}`}>{toast.kind === 'bad' ? <AlertCircle size={18} /> : toast.kind === 'good' ? <CheckCircle2 size={18} /> : <Sparkles size={18} />}<span>{toast.text}</span><button aria-label="Đóng thông báo" onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}><X size={14} /></button></div>)}</div>
  </div>;
}

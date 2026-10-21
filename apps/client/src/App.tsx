import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { AlertCircle, CheckCircle2, LoaderCircle, Sparkles, X } from 'lucide-react';
import { DEFAULT_APPEARANCE, skillsForPath, type ActionResult, type Appearance, type ChatMessage, type CombatEvent, type LeaderboardEntry,
  type OwnCharacter, type TribulationState, type WorldSnapshot } from '@van-thuong/shared';
import { WorldScene, type PreviewOptions } from './game/WorldScene';
import { type VisualEffect } from './game/WorldDecor';
import { LoginScreen } from './components/LoginScreen';
import { CharacterCreation } from './components/CharacterCreation';
import { GameHUD } from './components/GameHUD';
import { TouchJoystick } from './components/TouchJoystick';
import { Panels, PathModal, type ActivePanel, type AdminPlayer } from './components/Panels';
import { api } from './lib/api';
import { firebaseEnabled, loginGoogle, loginPassword, logoutFirebase, observeFirebase } from './lib/firebase';
import type { User } from 'firebase/auth';

type Phase = 'loading' | 'login' | 'create' | 'reveal' | 'entering' | 'game';
type Session = { kind: 'demo'; token: string } | { kind: 'firebase'; token: string; user: User };
type Toast = { id: string; text: string; kind: 'good' | 'bad' | 'info' };
const DEMO_KEY = 'van-thuong:demo-session';
const initialPreview: PreviewOptions = { name: '', gender: 'nu', appearance: { ...DEFAULT_APPEARANCE }, view: 'body' };

export function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [demoAvailable, setDemoAvailable] = useState(false);
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
  const [appearanceDraft, setAppearanceDraft] = useState<Appearance | null>(null);
  const [editorView, setEditorView] = useState<'body' | 'face'>('body');
  const [pathModal, setPathModal] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [roster, setRoster] = useState<AdminPlayer[]>([]);
  const [now, setNow] = useState(Date.now());
  const socketRef = useRef<Socket | null>(null);
  const touchMovement = useRef({ right: 0, forward: 0 });
  const previousRealm = useRef(0);

  const notify = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current.slice(-3), { id, text, kind }]);
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
      setPhase(response.character ? 'entering' : 'create');
      previousRealm.current = response.character?.realm ?? 0;
      setPanel(null);
    } catch (e) {
      if (nextSession.kind === 'demo') sessionStorage.removeItem(DEMO_KEY);
      setPhase('login');
      setError(e instanceof Error ? e.message : 'Không thể kết nối tài khoản.');
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    void (async () => {
      try {
        const health = await api<{ ok: boolean; mode: 'demo' | 'production' }>('/api/health');
        if (cancelled) return;
        setDemoAvailable(health.mode === 'demo');
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
    if (panel === 'leaderboard') void api<{ entries: LeaderboardEntry[] }>('/api/leaderboard')
      .then((data) => setLeaderboard(data.entries)).catch((e) => notify(e instanceof Error ? e.message : 'Không thể tải bảng xếp hạng.', 'bad'));
  }, [panel, notify]);

  const enterDemo = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ token: string }>('/api/demo/session', undefined, { method: 'POST' });
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
    setSession(null); setCharacter(null); setWorld(null); setTrial(null); setMessages([]); setPanel(null); setAppearanceDraft(null);
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

  const openPanel = (next: ActivePanel) => {
    if (next === 'appearance' && character) { setAppearanceDraft({ ...character.appearance }); setEditorView('body'); }
    if (panel === 'appearance' && next !== 'appearance') setAppearanceDraft(null);
    setPanel(next);
  };
  const saveAppearance = async () => {
    if (!appearanceDraft || !character) return;
    if (await action('appearance:update', { appearance: appearanceDraft })) openPanel(null);
  };
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
  const skill = useCallback((id: string) => { void action('cast', { skillId: id, targetId: 'world-boss' }); }, [action]);
  const chat = useCallback((text: string) => { socketRef.current?.emit('chat', text); }, []);
  const selectPath = (path: 'kiem' | 'phap' | 'the') => { void action('choose-path', { path }); setPathModal(false); };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (character?.isAdmin && event.ctrlKey && event.shiftKey && event.code === 'F12') {
        event.preventDefault(); setPanel((prev) => prev === 'admin' ? null : 'admin'); return;
      }
      if (phase !== 'game' || !character || event.repeat || event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.code === 'Escape') { setPanel(null); setPathModal(false); }
      if (event.code === 'KeyI') setPanel((prev) => prev === 'inventory' ? null : 'inventory');
      if (event.code === 'KeyF' && character.scene === 'tribulation' && !panel) void action('guard');
      if (['Digit1', 'Digit2', 'Digit3'].includes(event.code) && !panel && !pathModal) {
        const move = skillsForPath(character.path)[Number(event.code.slice(-1)) - 1];
        if (move) skill(move.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [character?.isAdmin, character?.path, character?.scene, phase, panel, pathModal, skill, action]);

  const showCharacter = inWorld ? character : null;
  const scenePreview = phase === 'reveal' && character ? { ...preview, root: character.root } : preview;
  return <div className="app-shell">
    <WorldScene character={showCharacter} world={phase === 'game' ? world : null} trial={trial} preview={scenePreview}
      appearanceDraft={panel === 'appearance' ? appearanceDraft : null} editorView={panel === 'appearance' ? editorView : null} effects={effects}
      touch={touchMovement} onInput={input} onPickup={pickup} />
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
      <GameHUD character={character} world={world} trial={trial} connected={connected} cooldowns={cooldowns} messages={messages} panel={panel}
        onPanel={openPanel} onAction={(event, payload) => { void action(event, payload); }} onSkill={skill} onChat={chat} onOpenPath={() => setPathModal(true)} onPickup={pickup} now={now} />
      <TouchJoystick movement={touchMovement} />
      <Panels panel={panel} onClose={() => openPanel(null)} character={character} leaderboard={leaderboard} roster={roster} onAction={(event, payload) => { void action(event, payload); }} onLogout={() => { void logout(); }}
        appearanceDraft={appearanceDraft} onAppearanceChange={setAppearanceDraft} onSaveAppearance={() => { void saveAppearance(); }} connected={connected}
        editorView={editorView} onEditorView={setEditorView} />
      {pathModal && character.realm >= 2 && !character.path && <PathModal onClose={() => setPathModal(false)} onSelect={selectPath} />}
    </>}
    <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div key={toast.id} className={`toast toast-${toast.kind}`}>{toast.kind === 'bad' ? <AlertCircle size={18} /> : toast.kind === 'good' ? <CheckCircle2 size={18} /> : <Sparkles size={18} />}<span>{toast.text}</span><button aria-label="Đóng thông báo" onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}><X size={14} /></button></div>)}</div>
  </div>;
}

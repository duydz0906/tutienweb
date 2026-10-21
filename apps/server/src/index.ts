import './env.js';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server } from 'socket.io';
import type { OwnCharacter, CharacterState } from '@van-thuong/shared';
import { demoMode, initializeAuthentication, makeDemoSession, verifyIdentity, type Identity } from './auth.js';
import { MemoryStore, MongoStore, type CharacterStore } from './db/store.js';
import { MemoryCache, RedisCache, type GameCache } from './db/cache.js';
import { World } from './game/World.js';
import { GOD_STAT, newCharacter, parseCreation } from './game/rules.js';

function ownCharacter(c: CharacterState, identity: Identity): OwnCharacter {
  const { ownerUid: _uid, ...data } = c;
  return { ...data,
    hp: identity.isAdmin ? GOD_STAT : c.hp, mp: identity.isAdmin ? GOD_STAT : c.mp,
    maxHp: identity.isAdmin ? GOD_STAT : c.maxHp, maxMp: identity.isAdmin ? GOD_STAT : c.maxMp,
    isAdmin: identity.isAdmin };
}

async function main(): Promise<void> {
  initializeAuthentication();
  let store: CharacterStore;
  let cache: GameCache;
  if (demoMode) { store = new MemoryStore(); cache = new MemoryCache(); }
  else {
    if (!process.env.MONGO_URI || !process.env.REDIS_URL) throw new Error('MONGO_URI and REDIS_URL are required.');
    const mongo = new MongoStore();
    await mongo.connect(process.env.MONGO_URI);
    const redis = new RedisCache(process.env.REDIS_URL);
    await redis.connect();
    store = mongo; cache = redis;
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: 16_384, pingTimeout: 20_000 });
  const world = new World(io, store, cache);

  const withAuth = (handler: (req: Request, res: Response, identity: Identity) => Promise<void>) =>
    (req: Request, res: Response): void => {
      void (async () => {
        try {
          const bearer = req.header('authorization');
          if (!bearer?.startsWith('Bearer ')) { res.status(401).json({ error: 'Vui lòng đăng nhập.' }); return; }
          const identity = await verifyIdentity(bearer.slice(7));
          await handler(req, res, identity);
        } catch (error) {
          if (error instanceof Error && /phiên|đăng nhập|token|expired|revoked|JWT/i.test(error.message)) {
            res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
          } else {
            console.error('[api] request failed:', error);
            res.status(500).json({ error: 'Máy chủ đang bận, hãy thử lại.' });
          }
        }
      })();
    };

  app.get('/api/health', (_req, res) => res.json({ ok: true, mode: demoMode ? 'demo' : 'production', online: io.engine.clientsCount }));

  const demoRequestTimes = new Map<string, number[]>();
  app.post('/api/demo/session', (req, res) => {
    if (!demoMode) { res.status(404).json({ error: 'Không hỗ trợ tài khoản chơi thử.' }); return; }
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const recent = (demoRequestTimes.get(ip) ?? []).filter((time) => time > now - 600_000);
    if (recent.length >= 12) { res.status(429).json({ error: 'Vui lòng thử lại sau ít phút.' }); return; }
    recent.push(now);
    demoRequestTimes.set(ip, recent);
    res.json(makeDemoSession());
  });

  app.get('/api/me', withAuth(async (_req, res, identity) => {
    await store.syncUser(identity);
    const character = await store.get(identity.uid);
    res.json({ identity: { displayName: identity.displayName, isAdmin: identity.isAdmin }, character: character ? ownCharacter(character, identity) : null });
  }));

  app.post('/api/characters', withAuth(async (req, res, identity) => {
    await store.syncUser(identity);
    const existing = await store.get(identity.uid);
    if (existing) { res.json({ character: ownCharacter(existing, identity), existing: true }); return; }
    let parsed: ReturnType<typeof parseCreation>;
    try { parsed = parseCreation(req.body, identity.isAdmin); }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Thông tin không hợp lệ.' }); return; }
    const created = await store.create(newCharacter(identity.uid, parsed));
    await cache.update(created, identity.isAdmin);
    res.status(201).json({ character: ownCharacter(created, identity), existing: false });
  }));

  app.get('/api/leaderboard', async (_req, res) => {
    try { res.json({ entries: await cache.leaderboard() }); }
    catch (error) { console.error('[api] leaderboard:', error); res.status(503).json({ error: 'Bảng xếp hạng chưa sẵn sàng.' }); }
  });

  io.use(async (socket, next) => {
    try {
      const identity = await verifyIdentity(socket.handshake.auth.token);
      socket.data.identity = identity;
      next();
    } catch { next(new Error('Phiên đăng nhập không hợp lệ.')); }
  });
  io.on('connection', (socket) => {
    void world.join(socket, socket.data.identity as Identity).catch((error) => {
      console.error('[socket] join failed:', error);
      socket.emit('fatal', 'Không thể vào thế giới lúc này.');
      socket.disconnect(true);
    });
  });

  const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: 'index.html', maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api] parse error:', error.message);
    res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ.' });
  });

  const port = Number(process.env.PORT || 3001);
  http.listen(port, '0.0.0.0', () => console.info(`[server] http://0.0.0.0:${port} (${demoMode ? 'demo' : 'Firebase + MongoDB + Redis'})`));

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await world.close();
    io.close();
    http.close();
    await cache.close();
    await store.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
}

main().catch((error) => { console.error('[server] startup failed:', error); process.exit(1); });

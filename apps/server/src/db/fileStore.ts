import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeAppearance, type CharacterState } from '@van-thuong/shared';
import type { Identity } from '../auth.js';
import { LOCAL_DATA_DIR, LOCAL_DEV_UID, LOCAL_DEV_NAME } from '../localDev.js';
import type { CharacterStore } from './store.js';

/** One ignored, atomic JSON save per account. Never mix local demo data with real MongoDB users. */
export class FileStore implements CharacterStore {
  private readonly pending = new Map<string, Promise<unknown>>();
  constructor(private readonly root: string = LOCAL_DATA_DIR) {}

  private location(uid: string): { directory: string; file: string } {
    // Hash arbitrary UIDs so even a future auth provider cannot traverse the save directory.
    const folder = uid === LOCAL_DEV_UID ? LOCAL_DEV_NAME : `user-${createHash('sha256').update(uid).digest('hex')}`;
    const directory = join(this.root, 'players', folder);
    return { directory, file: join(directory, 'character.json') };
  }

  private async read(uid: string): Promise<CharacterState | null> {
    const { file } = this.location(uid);
    let text: string;
    try { text = await readFile(file, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    // Bad/truncated saves are NOT silently overwritten or rerolled.
    const data: unknown = JSON.parse(text);
    const character = data as Partial<CharacterState> | null;
    if (!character || typeof character !== 'object' || character.ownerUid !== uid ||
      typeof character.id !== 'string' || typeof character.name !== 'string' ||
      !character.root || !character.position || !character.resources || !character.equipment ||
      !Array.isArray(character.inventory) || !Array.isArray(character.dailyQuests) ||
      !Array.isArray(character.learnedSkills) || !Array.isArray(character.hotbar) ||
      !['overworld', 'wilderness', 'ascendant', 'village', 'residence', 'sanctum', 'tribulation'].includes(character.scene ?? ''))
      throw new Error(`Invalid character save: ${file}`);
    return { ...character, appearance: normalizeAppearance(character.appearance),
      cultivationBank: character.cultivationBank ?? 0, highestRealm: Math.max(character.highestRealm ?? 0, character.devMode ? character.devModeBackup?.realm ?? 0 : character.realm ?? 0),
      rebirths: character.rebirths ?? 0, flying: character.flying === true,
      stash: Array.isArray(character.stash) ? character.stash : [] } as CharacterState;
  }

  private async write(character: CharacterState): Promise<void> {
    const { directory, file } = this.location(character.ownerUid);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.character-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(character, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      await rename(temporary, file);
    } finally { await rm(temporary, { force: true }); }
  }

  private queue<T>(uid: string, work: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(uid) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(work);
    this.pending.set(uid, current);
    void current.then(() => { if (this.pending.get(uid) === current) this.pending.delete(uid); },
      () => { if (this.pending.get(uid) === current) this.pending.delete(uid); });
    return current;
  }

  async syncUser(_identity: Identity): Promise<void> { /* Identity is bound to the signed session. */ }
  async hasAdminRole(_uid: string): Promise<boolean> { return false; }
  async get(uid: string): Promise<CharacterState | null> {
    await this.pending.get(uid)?.catch(() => {});
    const character = await this.read(uid);
    return character ? structuredClone(character) : null;
  }
  async create(character: CharacterState): Promise<CharacterState> {
    return this.queue(character.ownerUid, async () => {
      const existing = await this.read(character.ownerUid);
      if (existing) return structuredClone(existing); // never reroll an existing Linh Căn
      await this.write(character);
      return structuredClone(character);
    });
  }
  async save(character: CharacterState): Promise<void> {
    return this.queue(character.ownerUid, async () => {
      const existing = await this.read(character.ownerUid);
      if (!existing || existing.id !== character.id) throw new Error('Character disappeared during save.');
      await this.write(character);
    });
  }
  async close(): Promise<void> {
    await Promise.all([...this.pending.values()]); // files deliberately survive process shutdown
  }
}

import mongoose from 'mongoose';
import { DAILY_QUESTS, ITEMS, SKILLS, skillsForPath, normalizeAppearance, type CharacterState, type DailyQuestId } from '@van-thuong/shared';
import { type Identity } from '../auth.js';
import { CharacterModel, EquipmentModel, UserModel } from './models.js';

export interface CharacterStore {
  syncUser(identity: Identity): Promise<void>;
  hasAdminRole(uid: string): Promise<boolean>;
  get(uid: string): Promise<CharacterState | null>;
  create(character: CharacterState): Promise<CharacterState>;
  save(character: CharacterState): Promise<void>;
  close(): Promise<void>;
}

export class MemoryStore implements CharacterStore {
  private readonly characters = new Map<string, CharacterState>();
  async syncUser(_identity: Identity): Promise<void> { /* demo sessions are ephemeral */ }
  async hasAdminRole(_uid: string): Promise<boolean> { return false; } // demo cannot gain admin privileges
  async get(uid: string): Promise<CharacterState | null> {
    const state = this.characters.get(uid);
    return state ? structuredClone(state) : null;
  }
  async create(character: CharacterState): Promise<CharacterState> {
    const existing = this.characters.get(character.ownerUid);
    if (existing) return structuredClone(existing);
    this.characters.set(character.ownerUid, structuredClone(character));
    return structuredClone(character);
  }
  async save(character: CharacterState): Promise<void> {
    this.characters.set(character.ownerUid, structuredClone(character));
  }
  async close(): Promise<void> { this.characters.clear(); }
}

function fromMongo(doc: Record<string, any>): CharacterState {
  return {
    id: doc.id, ownerUid: doc.ownerUid, name: doc.name, gender: doc.gender,
    appearance: normalizeAppearance(doc.appearance),
    root: { tier: doc.root.tier, elements: doc.root.elements, multiplier: doc.root.multiplier },
    path: doc.path ?? null, realm: doc.realm,
    minorStage: Number.isInteger(doc.minorStage) && doc.minorStage >= 1 && doc.minorStage <= 9 ? doc.minorStage : doc.realm > 0 ? 1 : 0,
    cultivation: doc.cultivation, totalCultivation: doc.totalCultivation,
    lastCultivatedAt: doc.lastCultivatedAt, hp: doc.hp, mp: doc.mp, maxHp: doc.maxHp, maxMp: doc.maxMp,
    position: { x: doc.position.x, y: doc.position.y, z: doc.position.z },
    rotation: doc.rotation,
    scene: doc.scene, worldVersion: doc.worldVersion ?? 1,
    equipment: Object.fromEntries(Object.entries(doc.equipment ?? {}).filter(([key, value]) => !key.startsWith('_') && typeof value === 'string')),
    inventory: (doc.inventory ?? []).map((item: { instanceId: string; itemId: string; acquiredAt: number }) => ({ instanceId: item.instanceId, itemId: item.itemId, acquiredAt: item.acquiredAt })),
    resources: { stones: doc.resources.stones, herbs: doc.resources.herbs, ore: doc.resources.ore, ink: doc.resources.ink },
    contribution: doc.contribution ?? 0,
    sectRank: ['outer', 'inner', 'true'].includes(doc.sectRank) ? doc.sectRank : 'outer',
    storyStep: doc.storyStep ?? 0, storyKills: doc.storyKills ?? 0, bossKills: doc.bossKills ?? 0,
    dailyDay: doc.dailyDay ?? '',
    dailyQuests: (doc.dailyQuests ?? []).filter((q: { id: string }) => Object.hasOwn(DAILY_QUESTS, q.id))
      .map((q: { id: DailyQuestId; progress: number; claimed: boolean }) => ({ id: q.id, progress: q.progress, claimed: q.claimed })),
    learnedSkills: Array.isArray(doc.learnedSkills) ? doc.learnedSkills.filter((id: string) => Object.hasOwn(SKILLS, id)) : skillsForPath(doc.path).map((skill) => skill.id),
    hotbar: Array.isArray(doc.hotbar) && doc.hotbar.length === 4 ? doc.hotbar.map((id: unknown) => typeof id === 'string' && Object.hasOwn(SKILLS, id) ? id : null) :
      [...skillsForPath(doc.path).map((skill) => skill.id), null].slice(0, 4),
    devMode: doc.devMode === true, devModeBackup: doc.devModeBackup,
    createdAt: doc.createdAt,
  };
}

export class MongoStore implements CharacterStore {
  async connect(uri: string): Promise<void> {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 7000 });
    await Promise.all([UserModel.init(), CharacterModel.init(), EquipmentModel.init()]);
    console.info('[db] MongoDB indexes ready.');
  }
  async syncUser(identity: Identity): Promise<void> {
    // Role is a separate, revokable DB grant made by scripts/grant-admin.mjs. A login
    // with a still-valid custom claim must NOT reinstate a role removed by an operator.
    // Losing the Firebase claim, on the other hand, permanently demotes the DB record.
    await UserModel.updateOne(
      { firebaseUid: identity.uid },
      { $set: { displayName: identity.displayName, provider: identity.provider, lastLoginAt: new Date(),
          ...(!identity.isAdmin ? { role: 'player' } : {}) },
        $setOnInsert: { firebaseUid: identity.uid, ...(identity.isAdmin ? { role: 'player' } : {}) } },
      { upsert: true },
    );
  }
  async hasAdminRole(uid: string): Promise<boolean> {
    return Boolean(await UserModel.exists({ firebaseUid: uid, role: 'admin' }));
  }
  async get(uid: string): Promise<CharacterState | null> {
    const doc = await CharacterModel.findOne({ ownerUid: uid }).lean();
    return doc ? fromMongo(doc as unknown as Record<string, any>) : null;
  }
  async create(character: CharacterState): Promise<CharacterState> {
    const existing = await this.get(character.ownerUid);
    if (existing) return existing; // a second POST must NEVER re-roll the spirit root
    const user = await UserModel.findOne({ firebaseUid: character.ownerUid }).select('_id');
    if (!user) throw new Error('Tài khoản chưa được xác thực.');
    try {
      await CharacterModel.create({ ...character, user: user._id });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        const duplicate = await this.get(character.ownerUid);
        if (duplicate) return duplicate;
      }
      throw error;
    }
    await this.syncEquipment(character);
    return character;
  }
  async save(character: CharacterState): Promise<void> {
    const result = await CharacterModel.updateOne({ id: character.id, ownerUid: character.ownerUid }, { $set: character }, { runValidators: true });
    if (result.matchedCount !== 1) throw new Error('Character disappeared during save.');
    await this.syncEquipment(character);
  }
  private async syncEquipment(character: CharacterState): Promise<void> {
    const equipment = character.inventory.filter((owned) => Object.hasOwn(ITEMS, owned.itemId));
    if (!equipment.length) return;
    await EquipmentModel.bulkWrite(equipment.map((owned) => {
      const definition = ITEMS[owned.itemId];
      if (!definition) throw new Error('Unknown equipment item in inventory.');
      return { updateOne: {
        filter: { instanceId: owned.instanceId, ownerUid: character.ownerUid },
        update: { $set: {
          ownerUid: character.ownerUid, characterId: character.id, itemId: owned.itemId,
          slot: definition.slot, rarity: definition.rarity,
          modifiers: { attack: definition.attack, defense: definition.defense },
          equipped: character.equipment[definition.slot] === owned.instanceId,
          acquiredAt: owned.acquiredAt,
        } }, upsert: true,
      } };
    }), { ordered: false });
  }
  async close(): Promise<void> { await mongoose.disconnect(); }
}

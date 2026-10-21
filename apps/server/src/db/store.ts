import mongoose from 'mongoose';
import { ITEMS, normalizeAppearance, type CharacterState } from '@van-thuong/shared';
import { type Identity } from '../auth.js';
import { CharacterModel, EquipmentModel, UserModel } from './models.js';

export interface CharacterStore {
  syncUser(identity: Identity): Promise<void>;
  get(uid: string): Promise<CharacterState | null>;
  create(character: CharacterState): Promise<CharacterState>;
  save(character: CharacterState): Promise<void>;
  close(): Promise<void>;
}

export class MemoryStore implements CharacterStore {
  private readonly characters = new Map<string, CharacterState>();
  async syncUser(_identity: Identity): Promise<void> { /* demo sessions are ephemeral */ }
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
    path: doc.path ?? null, realm: doc.realm, cultivation: doc.cultivation, totalCultivation: doc.totalCultivation,
    lastCultivatedAt: doc.lastCultivatedAt, hp: doc.hp, mp: doc.mp, maxHp: doc.maxHp, maxMp: doc.maxMp,
    position: { x: doc.position.x, y: doc.position.y, z: doc.position.z },
    rotation: doc.rotation, scene: doc.scene,
    equipment: Object.fromEntries(Object.entries(doc.equipment ?? {}).filter(([key, value]) => !key.startsWith('_') && typeof value === 'string')),
    inventory: (doc.inventory ?? []).map((item: { instanceId: string; itemId: string; acquiredAt: number }) => ({ instanceId: item.instanceId, itemId: item.itemId, acquiredAt: item.acquiredAt })),
    resources: { stones: doc.resources.stones, herbs: doc.resources.herbs, ore: doc.resources.ore, ink: doc.resources.ink },
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
    await UserModel.updateOne(
      { firebaseUid: identity.uid },
      { $set: { displayName: identity.displayName, provider: identity.provider, role: identity.isAdmin ? 'admin' : 'player', lastLoginAt: new Date() }, $setOnInsert: { firebaseUid: identity.uid } },
      { upsert: true },
    );
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
    if (!character.inventory.length) return;
    await EquipmentModel.bulkWrite(character.inventory.map((owned) => {
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

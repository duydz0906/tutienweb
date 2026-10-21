import mongoose, { Schema } from 'mongoose';
import { EQUIPMENT_SLOTS, FACE_SHAPES, HAIR_COLORS, HAIR_STYLES, MAX_REALM, ROBE_COLORS, SKIN_TONES } from '@van-thuong/shared';

/** The Firebase UID is the only login identifier; passwords are never stored here. */
export const UserModel = mongoose.model('User', new Schema({
  firebaseUid: { type: String, required: true, unique: true, index: true },
  displayName: { type: String, required: true, maxlength: 80 },
  provider: { type: String, enum: ['google', 'password', 'demo'], required: true },
  // Independently provisioned in MongoDB only after Firebase UID/claim verification.
  // Normal login cannot re-grant a role that an operator has revoked.
  role: { type: String, enum: ['player', 'admin'], default: 'player' },
  lastLoginAt: { type: Date, default: Date.now },
}, { timestamps: true }));

const vectorSchema = new Schema({
  x: { type: Number, required: true }, y: { type: Number, required: true }, z: { type: Number, required: true },
}, { _id: false });
const inventoryItemSchema = new Schema({
  instanceId: { type: String, required: true }, itemId: { type: String, required: true },
  acquiredAt: { type: Number, required: true },
}, { _id: false });
const equipmentSlots = Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, { type: String }])) as Record<string, { type: StringConstructor }>;

/** Authoritative character and its current ten-slot loadout. */
export const CharacterModel = mongoose.model('Character', new Schema({
  id: { type: String, required: true, unique: true },
  ownerUid: { type: String, required: true, unique: true, index: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, maxlength: 20 },
  gender: { type: String, enum: ['nam', 'nu'], required: true },
  appearance: {
    hair: { type: String, enum: HAIR_STYLES, required: true },
    hairColor: { type: String, enum: HAIR_COLORS, required: true },
    robeColor: { type: String, enum: ROBE_COLORS, required: true },
    face: { type: String, enum: FACE_SHAPES, default: 'oval' },
    skinTone: { type: String, enum: SKIN_TONES, default: 'warm' },
    height: { type: Number, min: 0, max: 1, default: 0.5 },
    build: { type: Number, min: 0, max: 1, default: 0.5 },
  },
  root: {
    tier: { type: String, enum: ['tap', 'chan', 'thien', 'bien_di', 'hon_don'], required: true },
    elements: [{ type: String, required: true }],
    multiplier: { type: Number, required: true },
  },
  path: { type: String, enum: ['kiem', 'phap', 'the', 'thu', 'ma'], default: null },
  realm: { type: Number, default: 0, min: 0, max: MAX_REALM },
  // Old records without a stage are upgraded by fromMongo without rerolling the root.
  minorStage: { type: Number, min: 0, max: 9, default: 0 },
  cultivation: { type: Number, default: 0, min: 0 },
  totalCultivation: { type: Number, default: 0, min: 0 },
  lastCultivatedAt: { type: Number, required: true },
  cultivationBank: { type: Number, min: 0, default: 0 },
  highestRealm: { type: Number, min: 0, max: MAX_REALM, default: 0 },
  rebirths: { type: Number, min: 0, max: 1, default: 0 },
  stash: { type: [inventoryItemSchema], default: [] },
  hp: { type: Number, required: true }, mp: { type: Number, required: true },
  maxHp: { type: Number, required: true }, maxMp: { type: Number, required: true },
  position: { type: vectorSchema, required: true },
  rotation: { type: Number, required: true },
  scene: { type: String, enum: ['overworld', 'wilderness', 'ascendant', 'village', 'residence', 'sanctum', 'tribulation'], default: 'overworld' },
  worldVersion: { type: Number, default: 1 }, // legacy single-map records migrate once on join
  equipment: { type: new Schema(equipmentSlots, { _id: false }), default: () => ({}) },
  // Canonical ownership list. EquipmentModel is a queryable materialized view of it.
  inventory: { type: [inventoryItemSchema], default: [] },
  resources: {
    stones: { type: Number, default: 0, min: 0 }, herbs: { type: Number, default: 0, min: 0 },
    ore: { type: Number, default: 0, min: 0 }, ink: { type: Number, default: 0, min: 0 },
  },
  contribution: { type: Number, default: 0, min: 0 },
  sectRank: { type: String, enum: ['outer', 'inner', 'true'], default: 'outer' },
  storyStep: { type: Number, min: 0, max: 3, default: 0 },
  storyKills: { type: Number, min: 0, default: 0 }, bossKills: { type: Number, min: 0, default: 0 },
  dailyDay: { type: String, default: '' },
  dailyQuests: { type: [new Schema({ id: String, progress: { type: Number, min: 0, default: 0 }, claimed: { type: Boolean, default: false } }, { _id: false })], default: [] },
  learnedSkills: { type: [String], default: ['spirit_cut'] },
  hotbar: { type: [String], default: () => Array.from({ length: 9 }, (_, index) => index === 0 ? 'spirit_cut' : null) },
  flying: { type: Boolean, default: false },
  devMode: { type: Boolean, default: false },
  // Set by the server only, so a revoked admin session can restore the original character.
  devModeBackup: { type: Schema.Types.Mixed, default: undefined },
  createdAt: { type: Number, required: true },
}, { timestamps: { createdAt: false, updatedAt: true } }));

/** Individually owned equipment, with item metadata and an indexed owner. */
export const EquipmentModel = mongoose.model('Equipment', new Schema({
  instanceId: { type: String, required: true, unique: true },
  ownerUid: { type: String, required: true, index: true },
  characterId: { type: String, required: true, index: true },
  itemId: { type: String, required: true },
  slot: { type: String, enum: EQUIPMENT_SLOTS, required: true },
  rarity: { type: String, enum: ['common', 'rare', 'epic', 'immortal'], required: true },
  modifiers: {
    attack: { type: Number, default: 0 }, defense: { type: Number, default: 0 },
  },
  equipped: { type: Boolean, default: false },
  acquiredAt: { type: Number, required: true },
}, { timestamps: true }));

/* Wire contracts and public game data. Never put secrets or admin credentials here. */
import levelConfig from './level_config.json' with { type: 'json' };
export type Vector3 = { x: number; y: number; z: number };
export const LEVEL_CONFIG = levelConfig;
export const REALMS = levelConfig.realms;
export const MAX_REALM = REALMS.length - 1;
/** EXP for advancing FROM stage N. Resets at each new major realm; 100, 500, 2,500… */
export function expForStage(stage: number): number {
  if (!Number.isInteger(stage) || stage < 1 || stage > levelConfig.minorStages) throw new Error('Tầng cảnh giới không hợp lệ.');
  return levelConfig.exp.base * levelConfig.exp.multiplier ** (stage - 1);
}
/** Phàm Nhân has a short entry trial; a new major realm requires the ninth stage. */
export function majorBreakthroughCost(realm: number, stage: number): number | null {
  if (!Number.isInteger(realm) || realm < 0 || realm >= MAX_REALM) return null;
  if (realm === 0) return levelConfig.exp.entryCost;
  return stage === levelConfig.minorStages ? expForStage(stage) : null;
}
export type Gender = 'nam' | 'nu';
export type Path = 'kiem' | 'phap' | 'the';
export type RootTier = 'tap' | 'chan' | 'thien' | 'bien_di' | 'hon_don';
export type Element = 'kim' | 'moc' | 'thuy' | 'hoa' | 'tho' | 'bang' | 'phong' | 'loi' | 'am' | 'quang';
export const ELEMENT_LABEL: Record<Element, string> = {
  kim: 'Kim', moc: 'Mộc', thuy: 'Thủy', hoa: 'Hỏa', tho: 'Thổ',
  bang: 'Băng', phong: 'Phong', loi: 'Lôi', am: 'Ám', quang: 'Quang',
};
export const ELEMENT_COLOR: Record<Element, string> = {
  kim: '#ebc77f', moc: '#80c79a', thuy: '#6ac6d5', hoa: '#ff9369', tho: '#caa478',
  bang: '#a9e9fb', phong: '#b6e8be', loi: '#d6adff', am: '#a194de', quang: '#ffe7a5',
};
export const ROOT_LABEL: Record<RootTier, string> = {
  tap: 'Tạp Linh Căn', chan: 'Chân Linh Căn', thien: 'Thiên Linh Căn', bien_di: 'Biến Dị Linh Căn', hon_don: 'Hỗn Độn Linh Căn',
};
export const ROOT_MULTIPLIER: Record<RootTier, number> = { tap: 0.7, chan: 1, thien: 1.8, bien_di: 2.6, hon_don: 10 };
export type SpiritRoot = { tier: RootTier; elements: Element[]; multiplier: number };
export const HAIR_STYLES = ['long', 'tied', 'bob', 'braid', 'bun', 'short', 'cropped'] as const;
export const HAIR_COLORS = ['ink', 'silver', 'chestnut', 'auburn', 'gold', 'ash', 'plum', 'jade'] as const;
export const ROBE_COLORS = ['ivory', 'jade', 'ember', 'midnight', 'lilac'] as const;
export const FACE_SHAPES = ['oval', 'round', 'angular', 'heart'] as const;
export const SKIN_TONES = ['light', 'warm', 'bronze', 'deep'] as const;
export type Appearance = {
  hair: (typeof HAIR_STYLES)[number]; hairColor: (typeof HAIR_COLORS)[number];
  robeColor: (typeof ROBE_COLORS)[number]; face: (typeof FACE_SHAPES)[number];
  skinTone: (typeof SKIN_TONES)[number]; height: number; build: number;
};
export const DEFAULT_APPEARANCE: Appearance = {
  hair: 'long', hairColor: 'ink', robeColor: 'ivory', face: 'oval', skinTone: 'warm',
  height: 0.5, build: 0.5,
};
/** Old MongoDB characters only had hair/hairColor/robeColor. Upgrade them without rerolling Linh Căn. */
export function normalizeAppearance(raw: unknown): Appearance {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const choice = <T extends string>(options: readonly T[], key: string, fallback: T): T =>
    options.find((value) => value === data[key]) ?? fallback;
  const ratio = (key: string): number => typeof data[key] === 'number' && Number.isFinite(data[key]) &&
    (data[key] as number) >= 0 && (data[key] as number) <= 1 ? data[key] as number : 0.5;
  return {
    hair: choice(HAIR_STYLES, 'hair', DEFAULT_APPEARANCE.hair),
    hairColor: choice(HAIR_COLORS, 'hairColor', DEFAULT_APPEARANCE.hairColor),
    robeColor: choice(ROBE_COLORS, 'robeColor', DEFAULT_APPEARANCE.robeColor),
    face: choice(FACE_SHAPES, 'face', DEFAULT_APPEARANCE.face),
    skinTone: choice(SKIN_TONES, 'skinTone', DEFAULT_APPEARANCE.skinTone),
    height: ratio('height'), build: ratio('build'),
  };
}
export type Resources = { stones: number; herbs: number; ore: number; ink: number };
export const EQUIPMENT_SLOTS = ['weapon', 'robe', 'head', 'shoulder', 'boots', 'ring', 'necklace', 'artifact', 'pet', 'talisman'] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
export const SLOT_LABEL: Record<EquipmentSlot, string> = {
  weapon: 'Vũ khí', robe: 'Pháp y', head: 'Mũ', shoulder: 'Hộ vai', boots: 'Giày',
  ring: 'Nhẫn', necklace: 'Dây chuyền', artifact: 'Pháp bảo', pet: 'Linh thú', talisman: 'Bùa hộ mệnh',
};
export type ItemRarity = 'common' | 'rare' | 'epic' | 'immortal';
export type ItemDefinition = {
  id: string; name: string; slot: EquipmentSlot; rarity: ItemRarity;
  description: string; attack: number; defense: number; icon: string;
};
export const ITEMS: Record<string, ItemDefinition> = {
  wooden_sword: { id: 'wooden_sword', name: 'Thanh Trúc Kiếm', slot: 'weapon', rarity: 'common', description: 'Thanh kiếm đồng hành từ ngày đầu tu luyện.', attack: 4, defense: 0, icon: '⚔' },
  novice_robe: { id: 'novice_robe', name: 'Vân Bào', slot: 'robe', rarity: 'common', description: 'Lễ phục của đệ tử Vân Thượng.', attack: 0, defense: 3, icon: '◈' },
  moon_robe: { id: 'moon_robe', name: 'Nguyệt Ảnh Pháp Y', slot: 'robe', rarity: 'rare', description: 'Pháp y ánh bạc, thay đổi màu và chất liệu khi khoác lên người.', attack: 0, defense: 12, icon: '✥' },
  jade_blade: { id: 'jade_blade', name: 'Thanh Liên Kiếm', slot: 'weapon', rarity: 'epic', description: 'Kiếm khí xanh như nước hồ thu.', attack: 18, defense: 0, icon: '⚔' },
  immortal_sword: { id: 'immortal_sword', name: 'Xích Tiêu Tiên Kiếm', slot: 'weapon', rarity: 'immortal', description: 'Tiên khí lưu quang đỏ rực.', attack: 56, defense: 5, icon: '⚔' },
  cloud_crown: { id: 'cloud_crown', name: 'Lưu Vân Quan', slot: 'head', rarity: 'rare', description: 'Ngưng sương trời trên tóc.', attack: 0, defense: 6, icon: '♛' },
  shoulder_guard: { id: 'shoulder_guard', name: 'Huyền Thiết Hộ Vai', slot: 'shoulder', rarity: 'rare', description: 'Hộ vai rèn từ linh thiết.', attack: 0, defense: 8, icon: '⬡' },
  cloud_boots: { id: 'cloud_boots', name: 'Đạp Vân Ngoa', slot: 'boots', rarity: 'rare', description: 'Giày lướt qua mây trắng.', attack: 0, defense: 5, icon: '◢' },
  spirit_ring: { id: 'spirit_ring', name: 'Tụ Linh Giới', slot: 'ring', rarity: 'rare', description: 'Nhẫn giữ lại hơi thở linh khí.', attack: 5, defense: 2, icon: '◉' },
  jade_necklace: { id: 'jade_necklace', name: 'Ngọc Tâm Bội', slot: 'necklace', rarity: 'rare', description: 'Ngọc bội tĩnh tâm dưỡng khí.', attack: 3, defense: 4, icon: '◇' },
  fate_orb: { id: 'fate_orb', name: 'Bản Mệnh Châu', slot: 'artifact', rarity: 'epic', description: 'Pháp bảo bay quanh chủ nhân.', attack: 12, defense: 3, icon: '✧' },
  spirit_fox: { id: 'spirit_fox', name: 'Linh Hồ', slot: 'pet', rarity: 'epic', description: 'Tiểu hồ ly theo bước tu tiên.', attack: 5, defense: 5, icon: '✿' },
  lotus_talisman: { id: 'lotus_talisman', name: 'Liên Hoa Phù', slot: 'talisman', rarity: 'rare', description: 'Phù văn bảo vệ thần hồn.', attack: 2, defense: 7, icon: '✦' },
};
export const CONSUMABLES = {
  heal_pill: { id: 'heal_pill', name: 'Hồi Huyết Đan', icon: '♥', description: 'Hồi 70 sinh lực. Chỉ dùng khi bị thương.' },
  mana_pill: { id: 'mana_pill', name: 'Hồi Linh Đan', icon: '✧', description: 'Hồi 90 chân khí. Chỉ dùng khi chưa đầy.' },
  foundation_pill: { id: 'foundation_pill', name: 'Trúc Cơ Đan', icon: '✺', description: 'Dùng lúc bắt đầu độ kiếp: +20% cơ hội thành công (tối đa 95%).' },
} as const;
export type ConsumableId = keyof typeof CONSUMABLES;
export type OwnedItem = { instanceId: string; itemId: string; acquiredAt: number };

export type SectRank = 'outer' | 'inner' | 'true';
export const SECT_RANK_LABEL: Record<SectRank, string> = { outer: 'Ngoại môn', inner: 'Nội môn', true: 'Chân truyền' };
export const NPCS = {
  master: { id: 'master', name: 'Chưởng Môn Vân Thượng', role: 'Chính Điện · Cốt truyện và thăng cấp', position: { x: 0, y: 0, z: 29 } },
  quest: { id: 'quest', name: 'Trưởng Lão Chấp Sự', role: 'Nhiệm Vụ Các · Nhiệm vụ hằng ngày', position: { x: -8, y: 0, z: 14 } },
  shop: { id: 'shop', name: 'Trưởng Lão Hậu Cần', role: 'Tàng Bảo Các · Cửa hàng tông môn', position: { x: 8, y: 0, z: 14 } },
} as const;
export type NpcId = keyof typeof NPCS;
/** Herbs in the wilderness: positions are public, availability and rewards are server-owned. */
export const HERB_NODES = [
  { id: 'herb-1', position: { x: -10, y: 0, z: -8 } }, { id: 'herb-2', position: { x: 12, y: 0, z: -9 } },
  { id: 'herb-3', position: { x: -21, y: 0, z: -17 } }, { id: 'herb-4', position: { x: 22, y: 0, z: -18 } },
  { id: 'herb-5', position: { x: -12, y: 0, z: -29 } }, { id: 'herb-6', position: { x: 14, y: 0, z: -31 } },
] as const;
export type HerbState = { id: string; position: Vector3; availableAt: number };
export const DAILY_QUESTS = {
  gather_herbs: { id: 'gather_herbs', title: 'Hái 10 Linh thảo', description: 'Thu thập linh thảo ngoài Tông Môn.', kind: 'gather', target: 10, reward: { contribution: 25, exp: 100, stones: 12 } },
  gather_more: { id: 'gather_more', title: 'Vườn thuốc tiên', description: 'Tìm thêm 6 bụi linh thảo.', kind: 'gather', target: 6, reward: { contribution: 15, exp: 65, stones: 8 } },
  kill_wolves: { id: 'kill_wolves', title: 'Trừ 20 Linh Lang', description: 'Hạ Linh Lang ngoài cổng.', kind: 'wolf', target: 20, reward: { contribution: 40, exp: 500, stones: 30 } },
  kill_boars: { id: 'kill_boars', title: 'Trừ 5 Thiết Giáp Trư', description: 'Quét sạch bãi quái phía tây.', kind: 'boar', target: 5, reward: { contribution: 30, exp: 300, stones: 18 } },
  kill_monsters: { id: 'kill_monsters', title: 'Bảo vệ Tông Môn', description: 'Hạ 8 yêu thú bất kỳ.', kind: 'kill', target: 8, reward: { contribution: 22, exp: 175, stones: 12 } },
  courier_master: { id: 'courier_master', title: 'Chuyển thư Chính Điện', description: 'Gặp Chưởng Môn để chuyển thư.', kind: 'master', target: 1, reward: { contribution: 16, exp: 100, stones: 8 } },
  courier_shop: { id: 'courier_shop', title: 'Chuyển thư Hậu Cần', description: 'Gặp Trưởng Lão Hậu Cần để chuyển thư.', kind: 'shop', target: 1, reward: { contribution: 16, exp: 100, stones: 8 } },
  meditation: { id: 'meditation', title: 'Tĩnh tọa hấp thu', description: 'Thu 200 tu vi từ linh khí.', kind: 'cultivate', target: 200, reward: { contribution: 20, exp: 100, stones: 9 } },
} as const;
export type DailyQuestId = keyof typeof DAILY_QUESTS;
export type DailyQuestProgress = { id: DailyQuestId; progress: number; claimed: boolean };
export type ShopOffer = { id: string; itemId?: string; skillId?: string; stones: number; contribution: number };
export const SHOP_STOCK: ShopOffer[] = [
  { id: 'moon_robe', itemId: 'moon_robe', stones: 16, contribution: 0 },
  { id: 'jade_blade', itemId: 'jade_blade', stones: 30, contribution: 10 },
  { id: 'cloud_crown', itemId: 'cloud_crown', stones: 15, contribution: 0 },
  { id: 'fate_orb', itemId: 'fate_orb', stones: 36, contribution: 10 },
  { id: 'heal_pill', itemId: 'heal_pill', stones: 6, contribution: 0 },
  { id: 'mana_pill', itemId: 'mana_pill', stones: 6, contribution: 0 },
  { id: 'foundation_pill', itemId: 'foundation_pill', stones: 22, contribution: 12 },
  { id: 'healing_book', skillId: 'healing_bloom', stones: 18, contribution: 6 },
  { id: 'sword_book', skillId: 'sword_domain', stones: 28, contribution: 35 },
  { id: 'meteor_book', skillId: 'void_meteor', stones: 28, contribution: 35 },
  { id: 'diamond_book', skillId: 'diamond_body', stones: 28, contribution: 35 },
];
export type DevModeBackup = {
  root: SpiritRoot; realm: number; minorStage: number; cultivation: number; totalCultivation: number;
  hp: number; mp: number; maxHp: number; maxMp: number;
};
export type CharacterState = {
  id: string; ownerUid: string; name: string; gender: Gender; appearance: Appearance;
  root: SpiritRoot; path: Path | null; realm: number; minorStage: number;
  cultivation: number; totalCultivation: number; lastCultivatedAt: number;
  hp: number; mp: number; maxHp: number; maxMp: number;
  position: Vector3; rotation: number; scene: 'overworld' | 'tribulation';
  equipment: Partial<Record<EquipmentSlot, string>>; inventory: OwnedItem[]; resources: Resources;
  contribution: number; sectRank: SectRank; storyStep: number; storyKills: number; bossKills: number;
  dailyDay: string; dailyQuests: DailyQuestProgress[];
  learnedSkills: string[]; hotbar: (string | null)[];
  devMode: boolean; devModeBackup?: DevModeBackup;
  createdAt: number;
};
export type OwnCharacter = Omit<CharacterState, 'ownerUid' | 'devModeBackup'> & { isAdmin: boolean; shieldUntil?: number };
export type PublicPlayer = {
  id: string; name: string; position: Vector3; rotation: number;
  hp: number; maxHp: number; realm: number; minorStage: number; path: Path | null;
  root: SpiritRoot; gender: Gender; appearance: Appearance;
  equipment: Partial<Record<EquipmentSlot, string>>; isAdmin: boolean; devMode: boolean; shieldUntil?: number;
};
export type MonsterKind = 'wolf' | 'boar' | 'shade';
export type MonsterState = { id: string; kind: MonsterKind; name: string; level: number;
  position: Vector3; hp: number; maxHp: number; radius: number; respawnAt: number | null };
export type BossState = { id: string; name: string; position: Vector3; hp: number; maxHp: number; respawnAt: number | null };
export type WorldDrop = { id: string; itemId: string; position: Vector3; expiresAt: number };
export type FormationState = { id: string; ownerId: string; position: Vector3; radius: number; expiresAt: number };
export type WorldSnapshot = { players: PublicPlayer[]; boss: BossState; monsters: MonsterState[]; herbs: HerbState[];
  drops: WorldDrop[]; formations: FormationState[]; at: number };
export type TribulationState = { active: boolean; wave: number; phase: 'waiting' | 'warning' | 'strike'; target: Vector3 | null; nextAt: number; hits: number; guarding: boolean; pillUsed: boolean };
export type CombatEvent = {
  type: 'cast' | 'swing' | 'hit' | 'monster-hit' | 'monster-attack' | 'boss-hit' | 'lightning' | 'heal';
  skillId?: string; sourceId?: string; targetId?: string; position: Vector3; origin?: Vector3;
  damage?: number; critical?: boolean; at: number;
};
export type ChatMessage = { id: string; name: string; text: string; at: number; system?: boolean };
export type ActionResult = { ok: true; message?: string; character?: OwnCharacter } | { ok: false; error: string };
export type LeaderboardEntry = { id: string; name: string; score: number; realm: number };

export type SkillDefinition = {
  id: string; name: string; description: string; path: Path | null; shape: 'line' | 'sphere' | 'cone';
  range: number; radius: number; damage: number; mana: number; cooldown: number; ultimate?: boolean;
  icon: string; color: string;
};
export const SKILLS: Record<string, SkillDefinition> = {
  spirit_cut: { id: 'spirit_cut', name: 'Linh Khí Trảm', description: 'Kiếm khí thẳng phía trước.', path: null, shape: 'line', range: 9, radius: 1.15, damage: 19, mana: 5, cooldown: 1.6, icon: '✦', color: '#f3d8a3' },
  healing_bloom: { id: 'healing_bloom', name: 'Thanh Liên Dưỡng Khí', description: 'Hồi 80 sinh lực cho bản thân.', path: null, shape: 'sphere', range: 1, radius: 0, damage: 0, mana: 22, cooldown: 12, icon: '✿', color: '#88ead3' },
  flying_swords: { id: 'flying_swords', name: 'Vạn Kiếm Quy Tông', description: 'Phi kiếm xuyên qua hitbox hẹp.', path: 'kiem', shape: 'line', range: 16, radius: 1.4, damage: 54, mana: 19, cooldown: 6, icon: '⚔', color: '#9de9d6' },
  sword_domain: { id: 'sword_domain', name: 'Kiếm Vực', description: 'Mở kiếm trận quét quanh thân.', path: 'kiem', shape: 'cone', range: 12, radius: 0, damage: 135, mana: 62, cooldown: 34, ultimate: true, icon: '✧', color: '#b0f7ec' },
  falling_star: { id: 'falling_star', name: 'Thiên Thạch Thuật', description: 'Thiên thạch giáng xuống vùng mục tiêu.', path: 'phap', shape: 'sphere', range: 17, radius: 4.5, damage: 49, mana: 25, cooldown: 7, icon: '☄', color: '#ffa56b' },
  void_meteor: { id: 'void_meteor', name: 'Diệt Thế Tinh Vẫn', description: 'Triệu hồi thiên thạch từ hư không.', path: 'phap', shape: 'sphere', range: 19, radius: 7, damage: 150, mana: 70, cooldown: 36, ultimate: true, icon: '✺', color: '#ff795e' },
  earth_shatter: { id: 'earth_shatter', name: 'Chấn Địa Quyền', description: 'Nắm đấm tạo sóng xung kích.', path: 'the', shape: 'sphere', range: 1, radius: 5, damage: 43, mana: 16, cooldown: 6, icon: '◉', color: '#f3cc81' },
  diamond_body: { id: 'diamond_body', name: 'Kim Cang Hộ Thể', description: 'Hộ thân, hút máu và chấn địa.', path: 'the', shape: 'sphere', range: 1, radius: 7, damage: 98, mana: 55, cooldown: 33, ultimate: true, icon: '❖', color: '#ffdf81' },
};
export function skillsForPath(path: Path | null): SkillDefinition[] {
  if (path === 'kiem') return [SKILLS.spirit_cut, SKILLS.flying_swords, SKILLS.sword_domain];
  if (path === 'phap') return [SKILLS.spirit_cut, SKILLS.falling_star, SKILLS.void_meteor];
  if (path === 'the') return [SKILLS.spirit_cut, SKILLS.earth_shatter, SKILLS.diamond_body];
  return [SKILLS.spirit_cut];
}
export type Recipe = { id: string; name: string; profession: 'dan' | 'khi' | 'tran'; cost: Partial<Resources>; itemId?: string; reward?: Partial<Resources>; description: string };
export const RECIPES: Record<string, Recipe> = {
  spirit_pill: { id: 'spirit_pill', name: 'Tụ Khí Đan', profession: 'dan', cost: { herbs: 3, stones: 4 }, reward: { stones: 10 }, description: 'Luyện đan: chuyển dược thảo thành linh thạch.' },
  jade_blade: { id: 'jade_blade', name: 'Thanh Liên Kiếm', profession: 'khi', cost: { ore: 4, stones: 12 }, itemId: 'jade_blade', description: 'Luyện khí: rèn một thanh kiếm phẩm Tím.' },
  fate_orb: { id: 'fate_orb', name: 'Bản Mệnh Châu', profession: 'tran', cost: { ink: 3, stones: 16 }, itemId: 'fate_orb', description: 'Trận pháp: ngưng tụ pháp bảo bản mệnh.' },
};

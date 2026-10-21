/* Wire contracts and public game data. Never put secrets or admin credentials here. */
export type Vector3 = { x: number; y: number; z: number };
export const REALMS = ['Phàm Nhân', 'Luyện Khí', 'Trúc Cơ', 'Kim Đan', 'Nguyên Anh'] as const;
/** Tu vi needed to enter the NEXT realm; the nine-strike trial consumes it. */
export const BREAKTHROUGH_COSTS = [35, 100, 250, 550] as const;
export type Gender = 'nam' | 'nu';
export type Path = 'kiem' | 'phap' | 'the';
export type RootTier = 'tap' | 'chan' | 'thien' | 'bien_di';
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
  tap: 'Tạp Linh Căn', chan: 'Chân Linh Căn', thien: 'Thiên Linh Căn', bien_di: 'Biến Dị Linh Căn',
};
export const ROOT_MULTIPLIER: Record<RootTier, number> = { tap: 0.7, chan: 1, thien: 1.8, bien_di: 2.6 };
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
export type OwnedItem = { instanceId: string; itemId: string; acquiredAt: number };
export type CharacterState = {
  id: string; ownerUid: string; name: string; gender: Gender; appearance: Appearance;
  root: SpiritRoot; path: Path | null; realm: number; cultivation: number; totalCultivation: number;
  lastCultivatedAt: number; hp: number; mp: number; maxHp: number; maxMp: number;
  position: Vector3; rotation: number; scene: 'overworld' | 'tribulation';
  equipment: Partial<Record<EquipmentSlot, string>>; inventory: OwnedItem[]; resources: Resources;
  createdAt: number;
};
export type OwnCharacter = Omit<CharacterState, 'ownerUid'> & { isAdmin: boolean; shieldUntil?: number };
export type PublicPlayer = {
  id: string; name: string; position: Vector3; rotation: number;
  hp: number; maxHp: number; realm: number; path: Path | null;
  root: SpiritRoot; gender: Gender; appearance: Appearance;
  equipment: Partial<Record<EquipmentSlot, string>>; isAdmin: boolean; shieldUntil?: number;
};
export type BossState = { id: string; name: string; position: Vector3; hp: number; maxHp: number; respawnAt: number | null };
export type WorldDrop = { id: string; itemId: string; position: Vector3; expiresAt: number };
export type FormationState = { id: string; ownerId: string; position: Vector3; radius: number; expiresAt: number };
export type WorldSnapshot = { players: PublicPlayer[]; boss: BossState; drops: WorldDrop[]; formations: FormationState[]; at: number };
export type TribulationState = { active: boolean; wave: number; phase: 'waiting' | 'warning' | 'strike'; target: Vector3 | null; nextAt: number; hits: number; guarding: boolean };
export type CombatEvent = {
  type: 'cast' | 'hit' | 'boss-hit' | 'lightning' | 'heal';
  skillId?: string; sourceId?: string; targetId?: string; position: Vector3;
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

/* Wire contracts and public game data. Never put secrets or admin credentials here. */
import levelConfig from './level_config.json' with { type: 'json' };
export type Vector3 = { x: number; y: number; z: number };
/**
 * One map boundary for authoritative movement, rendering and minimap.
 *
 * The world was expanded to twenty times its old **area**: radius grows by √20 ≈ 4.47, so
 * 68 → 304 and 58 → 259. The hand-placed heart of each map (sect halls, village square, gates)
 * keeps its original coordinates, and the outer rings are filled with new districts, roads,
 * terraces, groves and hunting grounds — see `OuterLands` on the client and `HABITATS` below.
 */
export const WORLD_SCALE = 4.47;
export const WORLD_RADIUS = 304;
export const SECT_RADIUS = 259;
/** A valley village below the mountain gate; safe like the sect but a separate map. */
export const VILLAGE_RADIUS = 152;
export type WorldZone = 'overworld' | 'wilderness' | 'ascendant' | 'village';
export type GameScene = WorldZone | 'residence' | 'sanctum' | 'tribulation';
export const PUBLIC_ZONES: readonly WorldZone[] = ['overworld', 'wilderness', 'ascendant', 'village'];
/**
 * 10 Hz position reference for the scenes that have no public snapshot (home, sanctum, tribulation).
 * The client interpolates these exactly like a snapshot: without them a body in a private room is
 * only redrawn once a second and its movement looks broken, however well the renderer smooths it.
 */
export type MotionUpdate = { scene: GameScene; position: Vector3; rotation: number; at: number };
export function isWorldZone(scene: GameScene): scene is WorldZone { return PUBLIC_ZONES.includes(scene as WorldZone); }
/** No hostile casts and no monster spawns: the sect plateau and the village valley. */
export function isSafeScene(scene: GameScene): boolean { return scene === 'overworld' || scene === 'village'; }
/** Both ends of the gate, their arrival pads and interaction distance are shared by client and server. */
export const PORTALS = {
  overworld: { scene: 'overworld', destination: 'wilderness', name: 'Cổng Hoang Vực',
    position: { x: 0, y: 0, z: 2 }, arrival: { x: 0, y: 0, z: 23 }, radius: 4.2 },
  wilderness: { scene: 'wilderness', destination: 'overworld', name: 'Cổng Hồi Tông',
    position: { x: 0, y: 0, z: 34 }, arrival: { x: 0, y: 0, z: 10 }, radius: 4.2 },
  ascendant: { scene: 'ascendant', destination: 'overworld', name: 'Cổng Quy Sơn',
    position: { x: 0, y: 0, z: 34 }, arrival: { x: 32, y: 0, z: 19 }, radius: 4.2 },
  village: { scene: 'village', destination: 'overworld', name: 'Cổng Về Tông Môn',
    position: { x: 0, y: 0, z: -24 }, arrival: { x: 0, y: 0, z: -43 }, radius: 4.2 },
} as const satisfies Record<WorldZone, { scene: WorldZone; destination: WorldZone; name: string;
  position: Vector3; arrival: Vector3; radius: number }>;
/** Mountain path at the south edge of the sect: walk down to Vân Cốc village. */
export const VILLAGE_GATE = { position: { x: 0, y: 0, z: -50 }, radius: 3.8,
  arrival: { x: 0, y: 0, z: 18 }, exit: { x: 0, y: 0, z: -46 } } as const;
/** Private instances: the server decides entry, exit and proximity, never client coordinates. */
export const HOME_GATE = { position: { x: -33, y: 0, z: 12 }, radius: 3.2,
  arrival: { x: 0, y: 0, z: 5 }, exit: { x: -33, y: 0, z: 10 } } as const;
export const HOME_CHEST = { position: { x: 4, y: 0, z: -2 }, radius: 2.8 } as const;
export const HOME_EXIT = { position: { x: 0, y: 0, z: 7 }, radius: 2.8 } as const;
export const SECRET_GATE = { position: { x: 32, y: 0, z: 20 }, radius: 3.2,
  arrival: { x: 0, y: 0, z: 5 }, exit: { x: 32, y: 0, z: 18 } } as const;
export const SANCTUM_EXIT = { position: { x: 0, y: 0, z: 7 }, radius: 2.8 } as const;
export const REBIRTH_ALTAR = { position: { x: 0, y: 0, z: -3 }, radius: 3.3 } as const;
export const ASCENDANT_GATE = { position: { x: 5, y: 0, z: -3 }, radius: 3.2,
    arrival: { x: 0, y: 0, z: 23 } } as const;
export const SPIRIT_LAKE = { position: { x: -10, y: 0, z: -24 }, radius: 7.2, bonus: 0.15 } as const;
export const REBIRTH_BONUS = 0.5;
export const ASCENDANT_BONUS = 0.35;
/**
 * The four orthodox sects of Linh Giới (Thượng Giới). They are the "tông môn chính phái khác cảnh
 * giới cao hơn" the higher realm needed: each has its own walled courtyard, main hall, side halls
 * and a tĩnh tọa terrace where a cultivator can sit and drink in the denser qi of the upper world.
 *
 * Standing on a terrace adds `LINH_GIOI_BONUS` to the absorption multiplier — the AFK spot players
 * asked for (+40% linh khí). It stacks with the rebirth and Thượng Giới bonuses, and because
 * `absorptionMultiplier` is shared, the server's rate and the HUD's number can never disagree.
 */
export const LINH_GIOI_BONUS = 0.4;
export type LinhGioiSect = {
  id: string; name: string; epithet: string; color: string;
  /** Courtyard centre on the ascendant map. */
  center: { x: number; z: number };
  /** Main hall, measured the same way as `SECT_BUILDINGS` so collision and props agree. */
  hall: { name: string; width: number; depth: number; height: number };
  /** The tĩnh tọa (AFK) terrace: standing inside the radius grants the bonus. */
  afk: { name: string; position: Vector3; radius: number };
};
export const LINH_GIOI_SECTS: readonly LinhGioiSect[] = [
  { id: 'thien-kiem', name: 'THIÊN KIẾM TÔNG', epithet: 'Vạn kiếm quy tông', color: '#bfe4ff',
    center: { x: -160, z: 140 },
    hall: { name: 'KIẾM TRỦNG ĐIỆN', width: 20, depth: 13, height: 6.2 },
    afk: { name: 'TĨNH TỌA ĐÀI · THIÊN KIẾM', position: { x: -160, y: 0, z: 140 }, radius: 5.6 } },
  { id: 'ngoc-huyen', name: 'NGỌC HUYỀN MÔN', epithet: 'Huyền ngọc sinh huy', color: '#c9f5e6',
    center: { x: 170, z: 132 },
    hall: { name: 'NGỌC HUYỀN ĐIỆN', width: 18, depth: 12, height: 5.8 },
    afk: { name: 'TĨNH TỌA ĐÀI · NGỌC HUYỀN', position: { x: 170, y: 0, z: 132 }, radius: 5.6 } },
  { id: 'thai-hu', name: 'THÁI HƯ ĐIỆN', epithet: 'Hư không vô ảnh', color: '#d8ccff',
    center: { x: -152, z: -150 },
    hall: { name: 'THÁI HƯ ĐIỆN', width: 19, depth: 12, height: 6.0 },
    afk: { name: 'TĨNH TỌA ĐÀI · THÁI HƯ', position: { x: -152, y: 0, z: -150 }, radius: 5.6 } },
  { id: 'cuu-thien', name: 'CỬU THIÊN CUNG', epithet: 'Chín tầng mây tụ', color: '#ffe6b0',
    center: { x: 168, z: -168 },
    hall: { name: 'CỬU THIÊN CUNG', width: 21, depth: 14, height: 6.6 },
    afk: { name: 'TĨNH TỌA ĐÀI · CỬU THIÊN', position: { x: 168, y: 0, z: -168 }, radius: 5.6 } },
] as const;

/** Which Linh Giới sect's tĩnh tọa terrace (if any) the character is standing on. */
export function linhGioiSectAt(scene: GameScene, position: Vector3): LinhGioiSect | null {
  if (scene !== 'ascendant') return null;
  for (const sect of LINH_GIOI_SECTS) {
    if (Math.hypot(position.x - sect.afk.position.x, position.z - sect.afk.position.z) <= sect.afk.radius) return sect;
  }
  return null;
}
/** One house level per major realm, including Phàm Nhân. Highest attained realm survives rebirth. */
export function houseLevel(realm: number): number { return Math.max(0, Math.min(MAX_REALM, Math.floor(realm))) + 1; }
export function storageCapacity(realm: number): number { return 12 + (houseLevel(realm) - 1) * 6; }
export function houseAbsorptionBonus(realm: number): number { return (5 + Math.round((houseLevel(realm) - 1) * 15 / MAX_REALM)) / 100; }
export function inSpiritLake(scene: GameScene, position: Vector3): boolean {
  return scene === 'overworld' && Math.hypot(position.x - SPIRIT_LAKE.position.x, position.z - SPIRIT_LAKE.position.z) <= SPIRIT_LAKE.radius;
}
/** Shared display and server formula; server always supplies its own persisted position and scene. */
export function absorptionMultiplier(c: { scene: GameScene; position: Vector3; realm: number;
  highestRealm: number; rebirths: number; devMode: boolean }): number {
  const houseRealm = c.devMode ? MAX_REALM : Math.max(c.realm, c.highestRealm);
  return 1 + houseAbsorptionBonus(houseRealm) + (c.rebirths ? REBIRTH_BONUS : 0) +
    (inSpiritLake(c.scene, c.position) ? SPIRIT_LAKE.bonus : 0) +
    (linhGioiSectAt(c.scene, c.position) ? LINH_GIOI_BONUS : 0) +
    (c.scene === 'ascendant' && c.rebirths ? ASCENDANT_BONUS : 0);
}
/** Open-fronted rooms: width, depth and doorway are also used for authoritative wall collision. */
export const SECT_BUILDINGS = [
  { id: 'master', name: 'CHÍNH ĐIỆN', x: 0, z: 30, width: 19, depth: 13, doorway: 5.5, height: 5.6 },
  { id: 'quest', name: 'NHIỆM VỤ CÁC', x: -17, z: 18.5, width: 12, depth: 10, doorway: 4.2, height: 4.8 },
  { id: 'shop', name: 'TÀNG BẢO CÁC', x: 17, z: 18.5, width: 12, depth: 10, doorway: 4.2, height: 4.8 },
  { id: 'disciples', name: 'ĐỆ TỬ XÁ', x: -33, z: 18, width: 9, depth: 9, doorway: 3.4, height: 4.2 },
  { id: 'disciples-west', name: 'ĐỆ TỬ XÁ · TÂY', x: -32, z: -5, width: 9, depth: 8, doorway: 3.2, height: 4.0 },
  { id: 'disciples-south', name: 'ĐỆ TỬ XÁ · NAM', x: -31, z: -16, width: 9, depth: 8, doorway: 3.2, height: 4.0 },
  { id: 'beast', name: 'NGỰ THÚ VIỆN', x: -17, z: -4, width: 12, depth: 10, doorway: 4.2, height: 4.8 },
  { id: 'alchemy', name: 'PHÒNG LUYỆN ĐAN', x: 17, z: -8, width: 13, depth: 11, doorway: 4.4, height: 5.0 },
] as const;

/*
 * Authoritative movement, shared by the server that owns it and the client that predicts it.
 *
 * The client used to predict with its own private idea of the world — no walls, no bounds, no other
 * bodies — so every wall the server refused and every clamp it applied came back as a correction,
 * and a correction is exactly what a player sees as a jitter or a slide. Both sides now run this one
 * function on the same data, which is why walking into a building stops the body in the same place
 * twice and never needs correcting.
 */
/** Metres per second on foot and mounted; the server integrates with these too. */
export const WALK_SPEED = 6;
export const FLIGHT_SPEED = 10.5;
/** How far the body is allowed from the centre of a private room or the trial arena. */
export const TRIAL_RADIUS = 17;
export const PRIVATE_RADIUS = 8.5;
/** Half the width of a body, i.e. how much clearance a wall needs. */
const PLAYER_RADIUS = 0.43;
const WALL_THICKNESS = 0.42;
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
/** The sect walls, straight from the same table the 3D buildings are built from. */
export const SECT_WALLS: readonly Bounds[] = SECT_BUILDINGS.flatMap(({ x, z, width, depth, doorway }) => {
  const left = x - width / 2, right = x + width / 2;
  const front = z - depth / 2, back = z + depth / 2;
  const wall = WALL_THICKNESS / 2;
  return [
    { minX: left - wall, maxX: x - doorway / 2, minZ: front - wall, maxZ: front + wall },
    { minX: x + doorway / 2, maxX: right + wall, minZ: front - wall, maxZ: front + wall },
    { minX: left - wall, maxX: right + wall, minZ: back - wall, maxZ: back + wall },
    { minX: left - wall, maxX: left + wall, minZ: front, maxZ: back },
    { minX: right - wall, maxX: right + wall, minZ: front, maxZ: back },
  ];
});

function insideWall(p: Vector3, wall: Bounds): boolean {
  return p.x >= wall.minX - PLAYER_RADIUS && p.x <= wall.maxX + PLAYER_RADIUS &&
    p.z >= wall.minZ - PLAYER_RADIUS && p.z <= wall.maxZ + PLAYER_RADIUS;
}

function segmentHitsWall(from: Vector3, to: Vector3, wall: Bounds): boolean {
  // A save or a summon that already overlaps a wall may move OUT of it, never further in.
  if (insideWall(from, wall)) {
    const centreX = (wall.minX + wall.maxX) / 2, centreZ = (wall.minZ + wall.maxZ) / 2;
    return insideWall(to, wall) && Math.hypot(to.x - centreX, to.z - centreZ) < Math.hypot(from.x - centreX, from.z - centreZ);
  }
  let enter = 0, exit = 1;
  for (const [start, delta, min, max] of [
    [from.x, to.x - from.x, wall.minX - PLAYER_RADIUS, wall.maxX + PLAYER_RADIUS],
    [from.z, to.z - from.z, wall.minZ - PLAYER_RADIUS, wall.maxZ + PLAYER_RADIUS],
  ]) {
    if (Math.abs(delta) < 1e-9) { if (start < min || start > max) return false; continue; }
    const t1 = (min - start) / delta, t2 = (max - start) / delta;
    enter = Math.max(enter, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
    if (enter > exit) return false;
  }
  return true;
}

/** Walls are swept segments: the only way into a building is through its visible doorway. */
export function canWalkInSect(from: Vector3, to: Vector3): boolean {
  return !SECT_WALLS.some((wall) => segmentHitsWall(from, to, wall));
}

/** Map boundary of a public zone. */
export function worldRadiusFor(scene: WorldZone): number {
  return scene === 'overworld' ? SECT_RADIUS : scene === 'village' ? VILLAGE_RADIUS : WORLD_RADIUS;
}

/** A round body the player may not walk through (monster, another player, the boss). */
export type MoveObstacle = { position: { x: number; z: number }; radius: number };

export type MoveOptions = {
  scene: GameScene;
  /** Radius the position is clamped to; defaults to the scene's own boundary. */
  radius?: number;
  obstacles?: readonly MoveObstacle[];
  /** Off while flying: the rider is above walls and monster heads. */
  collide?: boolean;
};

/**
 * Where a body actually ends up after trying to move from `from` to `to`.
 *
 * One function for both sides: clamp to the map, sweep the sect walls, refuse to walk into another
 * body, and otherwise accept the step. Without obstacles or walls (`collide: false`) it is a plain
 * clamp, which is what the air and the private rooms need.
 */
export function resolveMove(from: Vector3, to: Vector3, options: MoveOptions): Vector3 {
  const radius = options.radius ?? (options.scene === 'tribulation' ? TRIAL_RADIUS
    : options.scene === 'residence' || options.scene === 'sanctum' ? PRIVATE_RADIUS
    : isWorldZone(options.scene) ? worldRadiusFor(options.scene) : PRIVATE_RADIUS);
  const position: Vector3 = { x: to.x, y: 0, z: to.z };
  const length = Math.hypot(position.x, position.z);
  if (length > radius) {
    position.x = (position.x / length) * radius;
    position.z = (position.z / length) * radius;
  }
  if (options.collide === false) return position;
  // Walls only exist in the sect plateau; the village, the wilds and the upper realm are open.
  if (options.scene === 'overworld' && !canWalkInSect(from, position)) return { x: from.x, y: 0, z: from.z };
  for (const obstacle of options.obstacles ?? []) {
    const next = Math.hypot(position.x - obstacle.position.x, position.z - obstacle.position.z);
    // Walking out of an overlap is allowed; walking further in is not.
    const was = Math.hypot(from.x - obstacle.position.x, from.z - obstacle.position.z);
    if (next < obstacle.radius && next < was) return { x: from.x, y: 0, z: from.z };
  }
  return position;
}
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
export type Path = 'kiem' | 'phap' | 'the' | 'thu' | 'ma';
export const PATH_LABEL: Record<Path, string> = {
  kiem: 'Kiếm Tu', phap: 'Pháp Tu', the: 'Thể Tu', thu: 'Ngự Thú', ma: 'Ma Tu',
};
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
export const EQUIPMENT_SLOTS = ['weapon', 'robe', 'head', 'shoulder', 'boots', 'ring', 'necklace', 'artifact', 'pet', 'mount', 'talisman'] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
export const SLOT_LABEL: Record<EquipmentSlot, string> = {
  weapon: 'Vũ khí', robe: 'Pháp y', head: 'Mũ', shoulder: 'Hộ vai', boots: 'Giày',
  ring: 'Nhẫn', necklace: 'Dây chuyền', artifact: 'Pháp bảo', pet: 'Linh thú', mount: 'Phi hành', talisman: 'Bùa hộ mệnh',
};
/** Nine shortcuts, matching the Digit1…Digit9 keys. */
export const HOTBAR_SLOTS = 9;
/** Old four-slot saves are padded (never reordered) so learned techniques stay on their key. */
export function normalizeHotbar(raw: unknown): (string | null)[] {
  const source = Array.isArray(raw) ? raw : [];
  return Array.from({ length: HOTBAR_SLOTS }, (_, index) => {
    const value = source[index];
    return typeof value === 'string' && Object.hasOwn(SKILLS, value) ? value : null;
  });
}
export type ItemRarity = 'common' | 'rare' | 'epic' | 'immortal';
/** How a mount carries its owner. Body cultivators ride wheels, sword cultivators ride swords. */
export type FlightStyle = 'sword' | 'disc' | 'wheel' | 'beast' | 'cloud';
export type FlightInfo = {
  style: FlightStyle;
  /** Paths allowed to ride; omitted means every path. Ma Tu may always ride any mount. */
  paths?: readonly Path[];
  /** Visual altitude above the server-owned ground position. */
  altitude: number;
  /** A flying spirit beast also counts as a companion for the Ngự Thú bonus. */
  beast?: boolean;
};
export type ItemDefinition = {
  id: string; name: string; slot: EquipmentSlot; rarity: ItemRarity;
  description: string; attack: number; defense: number; icon: string;
  flight?: FlightInfo;
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
  spirit_wolf: { id: 'spirit_wolf', name: 'Linh Lang Thuần Hóa', slot: 'pet', rarity: 'rare', description: 'Bạn đồng hành thuần phục từ bãi sói.', attack: 9, defense: 3, icon: '♟' },
  iron_boar: { id: 'iron_boar', name: 'Thiết Giáp Linh Trư', slot: 'pet', rarity: 'rare', description: 'Linh thú thủ hộ đến từ bãi đá.', attack: 5, defense: 10, icon: '◈' },
  cloud_crane_pet: { id: 'cloud_crane_pet', name: 'Vân Hạc', slot: 'pet', rarity: 'epic', description: 'Hạc tiên từ Thượng Giới.', attack: 14, defense: 7, icon: '❖' },
  spirit_stag_pet: { id: 'spirit_stag_pet', name: 'Ngọc Giác Linh Lộc', slot: 'pet', rarity: 'epic', description: 'Linh lộc thuần phục từ rừng Thượng Giới.', attack: 11, defense: 11, icon: '✥' },
  spirit_serpent: { id: 'spirit_serpent', name: 'Thanh Lân Linh Xà', slot: 'pet', rarity: 'epic', description: 'Rắn linh hộ pháp từ Hoang Vực hoặc Thượng Giới.', attack: 16, defense: 4, icon: '☯' },
  shadow_raven: { id: 'shadow_raven', name: 'Ám Nha', slot: 'pet', rarity: 'epic', description: 'Linh thú Ám hệ thuần phục bên rìa Hoang Vực.', attack: 13, defense: 4, icon: '◆' },
  lotus_talisman: { id: 'lotus_talisman', name: 'Liên Hoa Phù', slot: 'talisman', rarity: 'rare', description: 'Phù văn bảo vệ thần hồn.', attack: 2, defense: 7, icon: '✦' },
  flying_sword: { id: 'flying_sword', name: 'Ngự Kiếm · Thanh Phong', slot: 'mount', rarity: 'epic', description: 'Đạp kiếm quang bay giữa tầng mây. Kiếm Tu chuyên dụng.', attack: 8, defense: 2, icon: '⚔',
    flight: { style: 'sword', paths: ['kiem'], altitude: 2.1 } },
  cloud_disc: { id: 'cloud_disc', name: 'Linh Vân Phi Đĩa', slot: 'mount', rarity: 'epic', description: 'Pháp trận xoay tròn nâng chủ nhân lên không. Pháp Tu chuyên dụng.', attack: 2, defense: 6, icon: '☁',
    flight: { style: 'disc', paths: ['phap'], altitude: 2.0 } },
  wind_fire_wheel: { id: 'wind_fire_wheel', name: 'Phong Hỏa Luân', slot: 'mount', rarity: 'epic', description: 'Bánh xe lửa cuộn gió, Thể Tu đứng trên mà bay.', attack: 4, defense: 8, icon: '✺',
    flight: { style: 'wheel', paths: ['the'], altitude: 1.8 } },
  cloud_crane_mount: { id: 'cloud_crane_mount', name: 'Vân Hạc Tọa Kỵ', slot: 'mount', rarity: 'epic', description: 'Linh thú phi hành: chở chủ nhân và cùng ra trận như một linh thú đồng hành.', attack: 14, defense: 7, icon: '❖',
    flight: { style: 'beast', paths: ['thu'], altitude: 2.4, beast: true } },
  jade_stag_mount: { id: 'jade_stag_mount', name: 'Ngọc Giác Lộc Tọa Kỵ', slot: 'mount', rarity: 'epic', description: 'Linh lộc ngọc giác phi hành; tăng uy lực Ngự Thú khi đồng hành.', attack: 11, defense: 11, icon: '✥',
    flight: { style: 'beast', paths: ['thu'], altitude: 2.2, beast: true } },
  ink_cloud: { id: 'ink_cloud', name: 'Huyết Vân Xa', slot: 'mount', rarity: 'rare', description: 'Mây đen cuộn máu chỉ Ma Tu cưỡi được; đạo tu khác phải tìm vật phẩm hợp mệnh.', attack: 5, defense: 4, icon: '◆',
    flight: { style: 'cloud', paths: ['ma'], altitude: 2.0 } },
  spirit_cloud: { id: 'spirit_cloud', name: 'Đằng Vân Tọa', slot: 'mount', rarity: 'rare', description: 'Đám mây linh khí lành, đạo tu nào cũng cưỡi được.', attack: 3, defense: 5, icon: '☁',
    flight: { style: 'cloud', altitude: 1.9 } },
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
  quest: { id: 'quest', name: 'Trưởng Lão Chấp Sự', role: 'Nhiệm Vụ Các · Nhiệm vụ hằng ngày', position: { x: -17, y: 0, z: 18.5 } },
  shop: { id: 'shop', name: 'Trưởng Lão Hậu Cần', role: 'Tàng Bảo Các · Cửa hàng tông môn', position: { x: 17, y: 0, z: 18.5 } },
  beast: { id: 'beast', name: 'Ngự Thú Sư', role: 'Ngự Thú Viện · Thuần hóa linh thú', position: { x: -17, y: 0, z: -4 } },
  alchemist: { id: 'alchemist', name: 'Đan Sư', role: 'Phòng Luyện Đan · Luyện đan dược', position: { x: 17, y: 0, z: -8 } },
  // Vân Cốc village, reached by the mountain path at the south edge of the sect.
  village_shop: { id: 'village_shop', name: 'Lão Trương · Tạp Hóa', role: 'Chợ Vân Cốc · Trang bị và vật phẩm phi hành',
    position: { x: -8, y: 0, z: -6 }, scene: 'village' },
  village_elder: { id: 'village_elder', name: 'Lý Trưởng Vân Cốc', role: 'Chợ Vân Cốc · Tin tức sơn môn',
    position: { x: 8, y: 0, z: -2 }, scene: 'village' },
  // Quán trọ and tửu lầu, as in every xianxia road story: a bed and a bowl between expeditions.
  innkeeper: { id: 'innkeeper', name: 'Bà Tần · Chủ Quán Trọ', role: 'Vân Lai Khách Điếm · Nghỉ trọ hồi sức',
    position: { x: -19, y: 0, z: 6 }, scene: 'village' },
  tavern: { id: 'tavern', name: 'Tửu Lão Bạch', role: 'Thanh Phong Tửu Lầu · Rượu nóng và tin đồn',
    position: { x: 20, y: 0, z: 8 }, scene: 'village' },
  sect_inn: { id: 'sect_inn', name: 'Lý Quản Sự · Khách Điếm', role: 'Nghênh Khách Điếm · Nghỉ trọ trong tông môn',
    position: { x: -36, y: 0, z: 4 } },
} as const;
export type NpcId = keyof typeof NPCS;
/** The three innkeepers: an inn bed restores body and qi for a handful of spirit stones. */
export const INN_NPCS: readonly NpcId[] = ['innkeeper', 'sect_inn', 'tavern'];
/** Spirit stones for one night: cheaper for sect disciples than for road travellers. */
export function innRestCost(id: NpcId): number { return id === 'sect_inn' ? 4 : id === 'tavern' ? 10 : 8; }
export const INN_RADIUS = 4.6;
/** Sect NPCs live on the plateau; the village has its own two residents. */
export function npcScene(id: NpcId): GameScene {
  return (NPCS[id] as { scene?: GameScene }).scene ?? 'overworld';
}
export const VILLAGE_NPCS: readonly NpcId[] = (Object.keys(NPCS) as NpcId[]).filter((id) => npcScene(id) === 'village');
export const SECT_NPCS: readonly NpcId[] = (Object.keys(NPCS) as NpcId[]).filter((id) => npcScene(id) === 'overworld');
/** Herbs in the wilderness: positions are public, availability and rewards are server-owned. */
export const HERB_NODES = [
  { id: 'herb-1', position: { x: -10, y: 0, z: -8 } }, { id: 'herb-2', position: { x: 12, y: 0, z: -9 } },
  { id: 'herb-3', position: { x: -21, y: 0, z: -17 } }, { id: 'herb-4', position: { x: 22, y: 0, z: -18 } },
  { id: 'herb-5', position: { x: -12, y: 0, z: -29 } }, { id: 'herb-6', position: { x: 14, y: 0, z: -31 } },
  // The expanded hunting grounds each carry their own patches, so the walk out is worth it.
  { id: 'herb-7', position: { x: -74, y: 0, z: 38 } }, { id: 'herb-8', position: { x: 86, y: 0, z: 24 } },
  { id: 'herb-9', position: { x: -112, y: 0, z: -62 } }, { id: 'herb-10', position: { x: 118, y: 0, z: -74 } },
  { id: 'herb-11', position: { x: -46, y: 0, z: -128 } }, { id: 'herb-12', position: { x: 52, y: 0, z: -146 } },
  { id: 'herb-13', position: { x: -168, y: 0, z: 96 } }, { id: 'herb-14', position: { x: 176, y: 0, z: 88 } },
  { id: 'herb-15', position: { x: 24, y: 0, z: 168 } }, { id: 'herb-16', position: { x: -30, y: 0, z: 186 } },
] as const;
/** Reborn players can gather denser spirit herbs in the Ascendant world. */
export const ASCENDANT_HERBS = [
  { id: 'asc-herb-1', position: { x: -11, y: 0, z: -13 } }, { id: 'asc-herb-2', position: { x: 13, y: 0, z: -11 } },
  { id: 'asc-herb-3', position: { x: -20, y: 0, z: -22 } }, { id: 'asc-herb-4', position: { x: 22, y: 0, z: -20 } },
  { id: 'asc-herb-5', position: { x: -7, y: 0, z: -31 } }, { id: 'asc-herb-6', position: { x: 10, y: 0, z: -33 } },
  { id: 'asc-herb-7', position: { x: -96, y: 0, z: 64 } }, { id: 'asc-herb-8', position: { x: 104, y: 0, z: 58 } },
  { id: 'asc-herb-9', position: { x: -150, y: 0, z: -44 } }, { id: 'asc-herb-10', position: { x: 158, y: 0, z: -52 } },
  { id: 'asc-herb-11', position: { x: 36, y: 0, z: -164 } }, { id: 'asc-herb-12', position: { x: -42, y: 0, z: 172 } },
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
export type ShopOffer = { id: string; itemId?: string; skillId?: string; resource?: keyof Resources; quantity?: number; stones: number; contribution: number };
export const SHOP_STOCK: ShopOffer[] = [
  { id: 'stones_bundle', resource: 'stones', quantity: 8, stones: 0, contribution: 5 },
  { id: 'herbs_bundle', resource: 'herbs', quantity: 3, stones: 9, contribution: 0 },
  { id: 'ore_bundle', resource: 'ore', quantity: 2, stones: 10, contribution: 0 },
  { id: 'ink_bundle', resource: 'ink', quantity: 2, stones: 12, contribution: 0 },
  { id: 'spirit_fox', itemId: 'spirit_fox', stones: 50, contribution: 15 },
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
  { id: 'heaven_blade_book', skillId: 'heaven_blade', stones: 65, contribution: 60 },
  { id: 'celestial_swords_book', skillId: 'celestial_swords', stones: 130, contribution: 120 },
  { id: 'frost_lotus_book', skillId: 'frost_lotus', stones: 65, contribution: 60 },
  { id: 'thunder_stars_book', skillId: 'thunder_stars', stones: 130, contribution: 120 },
  { id: 'dragon_fist_book', skillId: 'dragon_fist', stones: 65, contribution: 60 },
  { id: 'immortal_body_book', skillId: 'immortal_body', stones: 130, contribution: 120 },
  { id: 'beast_roar_book', skillId: 'beast_roar', stones: 65, contribution: 60 },
  { id: 'myriad_beasts_book', skillId: 'myriad_beasts', stones: 130, contribution: 120 },
  { id: 'blood_moon_book', skillId: 'blood_moon', stones: 65, contribution: 60 },
  { id: 'abyss_reap_book', skillId: 'abyss_reap', stones: 130, contribution: 120 },
  // Every equipment slot is now available, so nothing sits in the world data without a way to wear it.
  { id: 'shoulder_guard', itemId: 'shoulder_guard', stones: 18, contribution: 4 },
  { id: 'cloud_boots', itemId: 'cloud_boots', stones: 16, contribution: 3 },
  { id: 'spirit_ring', itemId: 'spirit_ring', stones: 26, contribution: 8 },
  { id: 'jade_necklace', itemId: 'jade_necklace', stones: 24, contribution: 8 },
  { id: 'lotus_talisman', itemId: 'lotus_talisman', stones: 20, contribution: 6 },
  { id: 'immortal_sword', itemId: 'immortal_sword', stones: 160, contribution: 140 },
  { id: 'spirit_cloud', itemId: 'spirit_cloud', stones: 34, contribution: 8 },
  { id: 'flying_sword', itemId: 'flying_sword', stones: 42, contribution: 12 },
  { id: 'cloud_disc', itemId: 'cloud_disc', stones: 42, contribution: 12 },
  { id: 'wind_fire_wheel', itemId: 'wind_fire_wheel', stones: 42, contribution: 12 },
  { id: 'ink_cloud', itemId: 'ink_cloud', stones: 46, contribution: 14 },
  { id: 'cloud_crane_mount', itemId: 'cloud_crane_mount', stones: 58, contribution: 20 },
  { id: 'jade_stag_mount', itemId: 'jade_stag_mount', stones: 62, contribution: 22 },
];
/** Dev-mode teleport targets. The server owns the list; a client can only send one of these ids. */
export const DEV_TELEPORTS = [
  { id: 'sect-square', name: 'Quảng trường Tông Môn', scene: 'overworld', position: { x: 0, y: 0, z: 10 } },
  { id: 'master-hall', name: 'Chính Điện · Chưởng Môn', scene: 'overworld', position: { x: 0, y: 0, z: 26 } },
  { id: 'quest-hall', name: 'Nhiệm Vụ Các', scene: 'overworld', position: { x: -17, y: 0, z: 16 } },
  { id: 'shop-hall', name: 'Tàng Bảo Các', scene: 'overworld', position: { x: 17, y: 0, z: 16 } },
  { id: 'beast-hall', name: 'Ngự Thú Viện', scene: 'overworld', position: { x: -17, y: 0, z: -2 } },
  { id: 'alchemy-hall', name: 'Phòng Luyện Đan', scene: 'overworld', position: { x: 17, y: 0, z: -6 } },
  { id: 'spirit-lake', name: 'Hồ Tụ Linh', scene: 'overworld', position: { x: -10, y: 0, z: -24 } },
  { id: 'home-gate', name: 'Đệ Tử Xá (nhà riêng)', scene: 'overworld', position: { x: -33, y: 0, z: 13 } },
  { id: 'secret-gate', name: 'Mật Thất Tái Sinh', scene: 'overworld', position: { x: 32, y: 0, z: 19 } },
  { id: 'wild-portal', name: 'Cổng Hoang Vực', scene: 'overworld', position: { x: 0, y: 0, z: 4 } },
  { id: 'village-gate', name: 'Sơn đạo xuống làng', scene: 'overworld', position: { x: 0, y: 0, z: -47 } },
  { id: 'village-market', name: 'Chợ Vân Cốc', scene: 'village', position: { x: 0, y: 0, z: 4 } },
  { id: 'wild-arrival', name: 'Hoang Vực · Bãi nhập cảnh', scene: 'wilderness', position: { x: 0, y: 0, z: 23 } },
  { id: 'wild-boss', name: 'Hoang Vực · Long Vực Boss', scene: 'wilderness', position: { x: 0, y: 0, z: -46 } },
  // The expanded outer ring: one jump per new district so testers (and the levelling pass) do not
  // have to walk two hundred metres to check a courtyard or a hunting ground.
  { id: 'village-inn', name: 'Vân Lai Khách Điếm (quán trọ)', scene: 'village', position: { x: -19, y: 0, z: 9 } },
  { id: 'village-tavern', name: 'Thanh Phong Tửu Lầu', scene: 'village', position: { x: 20, y: 0, z: 11 } },
  { id: 'village-fields', name: 'Ruộng bậc thang · Nam thôn', scene: 'village', position: { x: 0, y: 0, z: -70 } },
  { id: 'sect-inn', name: 'Nghênh Khách Điếm (tông môn)', scene: 'overworld', position: { x: -36, y: 0, z: 8 } },
  { id: 'sect-outer', name: 'Ngoại môn · Diễn Vũ Trường', scene: 'overworld', position: { x: 0, y: 0, z: -88 } },
  { id: 'sect-scripture', name: 'Tàng Kinh Các · Bắc sơn', scene: 'overworld', position: { x: -28, y: 0, z: 152 } },
  { id: 'wild-moon', name: 'Hoang Vực · Nguyệt Lang cốc', scene: 'wilderness', position: { x: -118, y: 0, z: 132 } },
  { id: 'wild-crag', name: 'Hoang Vực · Nham Nhai', scene: 'wilderness', position: { x: 146, y: 0, z: -104 } },
  { id: 'wild-delta', name: 'Hoang Vực · Giao Hà', scene: 'wilderness', position: { x: 206, y: 0, z: 40 } },
  { id: 'linh-gioi', name: 'Linh Giới · Thiên Kiếm Tông (tĩnh tọa +40%)', scene: 'ascendant', position: { x: -160, y: 0, z: 140 } },
  { id: 'linh-gioi-2', name: 'Linh Giới · Ngọc Huyền Môn (tĩnh tọa +40%)', scene: 'ascendant', position: { x: 170, y: 0, z: 132 } },
  { id: 'linh-gioi-3', name: 'Linh Giới · Thái Hư Điện (tĩnh tọa +40%)', scene: 'ascendant', position: { x: -152, y: 0, z: -150 } },
  { id: 'linh-gioi-4', name: 'Linh Giới · Cửu Thiên Cung (tĩnh tọa +40%)', scene: 'ascendant', position: { x: 168, y: 0, z: -168 } },
  { id: 'ascendant', name: 'Thượng Giới', scene: 'ascendant', position: { x: 0, y: 0, z: 23 } },
] as const;
export type DevTeleportId = (typeof DEV_TELEPORTS)[number]['id'];
export type DevModeBackup = {
  root: SpiritRoot; realm: number; minorStage: number; cultivation: number; totalCultivation: number;
  hp: number; mp: number; maxHp: number; maxMp: number;
  /** Optional for characters whose dev mode was saved before resource backup was added. */
  resources?: Resources; contribution?: number;
  /** Dev-only customization and free acquisitions must not survive role revocation. Older backups lack these fields. */
  path?: Path | null; gender?: Gender; appearance?: Appearance;
  learnedSkills?: string[]; hotbar?: (string | null)[];
  inventory?: OwnedItem[]; equipment?: Partial<Record<EquipmentSlot, string>>; stash?: OwnedItem[];
};
export type CharacterState = {
  id: string; ownerUid: string; name: string; gender: Gender; appearance: Appearance;
  root: SpiritRoot; path: Path | null; realm: number; minorStage: number;
  cultivation: number; totalCultivation: number; lastCultivatedAt: number;
  /** Unclaimed EXP already calculated at the rate of the location where it was earned. */
  cultivationBank: number;
  /** Permanent maximum house level and capacity (never shrinks on rebirth). */
  highestRealm: number; rebirths: number; stash: OwnedItem[];
  hp: number; mp: number; maxHp: number; maxMp: number;
  position: Vector3; rotation: number; scene: GameScene; worldVersion: number;
  equipment: Partial<Record<EquipmentSlot, string>>; inventory: OwnedItem[]; resources: Resources;
  contribution: number; sectRank: SectRank; storyStep: number; storyKills: number; bossKills: number;
  dailyDay: string; dailyQuests: DailyQuestProgress[];
  learnedSkills: string[]; hotbar: (string | null)[];
  /** Server-owned flight state, only true while a valid mount carries the character. */
  flying?: boolean;
  devMode: boolean; devModeBackup?: DevModeBackup;
  createdAt: number;
};
export type OwnCharacter = Omit<CharacterState, 'ownerUid' | 'devModeBackup'> & { isAdmin: boolean; shieldUntil?: number };
export type PublicPlayer = {
  id: string; name: string; position: Vector3; rotation: number;
  hp: number; maxHp: number; realm: number; minorStage: number; path: Path | null;
  root: SpiritRoot; gender: Gender; appearance: Appearance;
  equipment: Partial<Record<EquipmentSlot, string>>; isAdmin: boolean; devMode: boolean; shieldUntil?: number;
  flying?: boolean;
};
/**
 * A mount may only be used by the paths it was forged for. Ma Tu steals techniques from every
 * school, so they can ride any mount; path-less mounts (Đằng Vân Tọa) are open to everyone.
 */
export function canRideMount(path: Path | null, item: ItemDefinition, realm: number, devMode = false): boolean {
  if (!item.flight) return false;
  if (devMode) return true;
  if (realm < 2) return false;
  const allowed = item.flight.paths;
  if (!allowed) return true;
  return path === 'ma' || (path !== null && allowed.includes(path));
}
export function flightItemOf(equipment: Partial<Record<EquipmentSlot, string>>, inventory: readonly OwnedItem[]): ItemDefinition | null {
  const instanceId = equipment.mount;
  if (!instanceId) return null;
  const owned = inventory.find((item) => item.instanceId === instanceId);
  const definition = owned ? ITEMS[owned.itemId] : undefined;
  return definition?.flight ? definition : null;
}
export const MONSTER_KINDS = ['wolf', 'boar', 'shade', 'forest_serpent', 'stone_golem',
  'spirit_stag', 'sky_wraith', 'cloud_crane', 'void_serpent', 'star_guardian', 'thunder_bird'] as const;
export type MonsterKind = (typeof MONSTER_KINDS)[number];
export const TAMEABLE_BEASTS: Partial<Record<MonsterKind, keyof typeof ITEMS>> = {
  wolf: 'spirit_wolf', boar: 'iron_boar', shade: 'shadow_raven', forest_serpent: 'spirit_serpent',
  spirit_stag: 'spirit_stag_pet', cloud_crane: 'cloud_crane_pet', sky_wraith: 'shadow_raven', void_serpent: 'spirit_serpent',
  // Flying beasts are tamed as mounts: they carry the owner and still fight as a spirit companion.
  thunder_bird: 'cloud_crane_mount',
};
/** One biome per level: server spawns here, client renders matching terrain and wayfinding. */
export type Habitat = { id: string; scene: 'wilderness' | 'ascendant'; kind: MonsterKind; name: string;
  level: number; center: { x: number; z: number }; radius: number; color: string;
  biome: 'pine' | 'rock' | 'mist' | 'swamp' | 'ruins' | 'grove' | 'cloud' | 'crystal'; hp: number };
export const HABITATS: readonly Habitat[] = [
  { id: 'wolf-glen', scene: 'wilderness', kind: 'wolf', name: 'Linh Lang', level: 1, center: { x: -14, z: 6 }, radius: 7, color: '#a9d7c5', biome: 'pine', hp: 75 },
  { id: 'wolf-ridge', scene: 'wilderness', kind: 'wolf', name: 'Linh Lang Đầu Đàn', level: 2, center: { x: 13, z: -8 }, radius: 7, color: '#b2d4ec', biome: 'pine', hp: 105 },
  { id: 'boar-quarry', scene: 'wilderness', kind: 'boar', name: 'Thiết Giáp Trư', level: 3, center: { x: -38, z: -10 }, radius: 7, color: '#e6b292', biome: 'rock', hp: 185 },
  { id: 'boar-ravine', scene: 'wilderness', kind: 'boar', name: 'Nham Giáp Trư', level: 4, center: { x: -44, z: -37 }, radius: 7, color: '#e89b73', biome: 'rock', hp: 235 },
  { id: 'shade-mist', scene: 'wilderness', kind: 'shade', name: 'U Ảnh', level: 5, center: { x: 36, z: -23 }, radius: 7, color: '#baa3f0', biome: 'mist', hp: 340 },
  { id: 'shade-marsh', scene: 'wilderness', kind: 'shade', name: 'Huyết Ảnh', level: 6, center: { x: 36, z: -50 }, radius: 7, color: '#ed9fc7', biome: 'swamp', hp: 420 },
  { id: 'serpent-thicket', scene: 'wilderness', kind: 'forest_serpent', name: 'Thanh Lân Xà', level: 7, center: { x: -19, z: -44 }, radius: 7, color: '#75d5a0', biome: 'swamp', hp: 505 },
  { id: 'golem-ruins', scene: 'wilderness', kind: 'stone_golem', name: 'Cổ Thạch Khôi', level: 8, center: { x: 7, z: -26 }, radius: 7, color: '#d8c298', biome: 'ruins', hp: 640 },
  // More hunting grounds per level band so Hoang Vực always has several camps at the player's level.
  { id: 'wolf-fang', scene: 'wilderness', kind: 'wolf', name: 'Nanh Sói Hoang', level: 2, center: { x: 44, z: 10 }, radius: 7, color: '#9fc7dc', biome: 'pine', hp: 112 },
  { id: 'boar-mud', scene: 'wilderness', kind: 'boar', name: 'Nham Trư Lầy', level: 4, center: { x: 55, z: -14 }, radius: 7, color: '#e3a27f', biome: 'rock', hp: 248 },
  { id: 'shade-hollow', scene: 'wilderness', kind: 'shade', name: 'Mộng Ảnh', level: 5, center: { x: -14, z: 40 }, radius: 7, color: '#bda6ef', biome: 'mist', hp: 352 },
  { id: 'serpent-pine', scene: 'wilderness', kind: 'forest_serpent', name: 'Tùng Lâm Xà', level: 6, center: { x: -48, z: 28 }, radius: 7, color: '#74d29d', biome: 'pine', hp: 438 },
  { id: 'crane-wild', scene: 'wilderness', kind: 'thunder_bird', name: 'Lôi Vũ Điêu', level: 7, center: { x: 30, z: 44 }, radius: 7, color: '#cfe4ff', biome: 'cloud', hp: 530 },
  { id: 'golem-barrow', scene: 'wilderness', kind: 'stone_golem', name: 'Bia Mộ Thạch Khôi', level: 8, center: { x: 14, z: -56 }, radius: 7, color: '#d3bd94', biome: 'ruins', hp: 668 },
  { id: 'stag-grove', scene: 'ascendant', kind: 'spirit_stag', name: 'Linh Lộc Thượng Giới', level: 9, center: { x: -17, z: 1 }, radius: 7, color: '#b3f4db', biome: 'grove', hp: 520 },
  { id: 'stag-spring', scene: 'ascendant', kind: 'spirit_stag', name: 'Ngọc Giác Linh Lộc', level: 10, center: { x: -30, z: -28 }, radius: 7, color: '#a1f5db', biome: 'grove', hp: 620 },
  { id: 'crane-peak', scene: 'ascendant', kind: 'cloud_crane', name: 'Vân Hạc', level: 11, center: { x: 15, z: -9 }, radius: 7, color: '#c1e8ff', biome: 'cloud', hp: 770 },
  { id: 'wraith-cloud', scene: 'ascendant', kind: 'sky_wraith', name: 'Thiên Ảnh', level: 12, center: { x: 36, z: -35 }, radius: 7, color: '#ccb9ff', biome: 'mist', hp: 940 },
  { id: 'serpent-void', scene: 'ascendant', kind: 'void_serpent', name: 'Hư Không Mãng', level: 14, center: { x: -20, z: -52 }, radius: 7, color: '#a29beb', biome: 'crystal', hp: 1230 },
  { id: 'guardian-star', scene: 'ascendant', kind: 'star_guardian', name: 'Tinh Thần Hộ Vệ', level: 16, center: { x: 18, z: -53 }, radius: 7, color: '#f4cc86', biome: 'ruins', hp: 1570 },
  // ── The outer ring ────────────────────────────────────────────────────────────────────────────
  // Land is now twenty times larger, so the hunt continues far beyond the old island edge: every
  // level band gets camps at several distances, and the furthest ones pay more.
  { id: 'wolf-moon', scene: 'wilderness', kind: 'wolf', name: 'Nguyệt Lang', level: 2, center: { x: -118, z: 148 }, radius: 7, color: '#a9d7c5', biome: 'pine', hp: 120 },
  { id: 'wolf-coast', scene: 'wilderness', kind: 'wolf', name: 'Hải Ngạn Lang', level: 3, center: { x: -238, z: 96 }, radius: 7, color: '#b2d4ec', biome: 'pine', hp: 150 },
  { id: 'boar-crag', scene: 'wilderness', kind: 'boar', name: 'Nham Nhai Trư', level: 4, center: { x: 146, z: -118 }, radius: 7, color: '#e6b292', biome: 'rock', hp: 240 },
  { id: 'boar-mire', scene: 'wilderness', kind: 'boar', name: 'Đầm Nê Trư', level: 5, center: { x: 234, z: -168 }, radius: 7, color: '#e89b73', biome: 'rock', hp: 300 },
  { id: 'shade-gloom', scene: 'wilderness', kind: 'shade', name: 'U Minh Ảnh', level: 6, center: { x: -64, z: -196 }, radius: 7, color: '#baa3f0', biome: 'mist', hp: 420 },
  { id: 'serpent-delta', scene: 'wilderness', kind: 'forest_serpent', name: 'Giao Hà Xà', level: 7, center: { x: 206, z: 52 }, radius: 7, color: '#75d5a0', biome: 'swamp', hp: 520 },
  { id: 'crane-sky', scene: 'wilderness', kind: 'thunder_bird', name: 'Phong Lôi Điêu', level: 7, center: { x: 36, z: 236 }, radius: 7, color: '#cfe4ff', biome: 'cloud', hp: 540 },
  { id: 'golem-crypt', scene: 'wilderness', kind: 'stone_golem', name: 'Cổ Mộ Thạch Khôi', level: 8, center: { x: -212, z: -36 }, radius: 7, color: '#d8c298', biome: 'ruins', hp: 690 },
  { id: 'wraith-mirror', scene: 'ascendant', kind: 'sky_wraith', name: 'Kính Ảnh', level: 9, center: { x: -256, z: 20 }, radius: 7, color: '#ccb9ff', biome: 'mist', hp: 760 },
  { id: 'stag-moon', scene: 'ascendant', kind: 'spirit_stag', name: 'Nguyệt Lộc', level: 10, center: { x: -120, z: 140 }, radius: 7, color: '#b3f4db', biome: 'grove', hp: 900 },
  { id: 'stag-jade', scene: 'ascendant', kind: 'spirit_stag', name: 'Bích Ngọc Lộc', level: 11, center: { x: 250, z: 20 }, radius: 7, color: '#a1f5db', biome: 'grove', hp: 1050 },
  { id: 'crane-cloud', scene: 'ascendant', kind: 'cloud_crane', name: 'Cửu Thiên Hạc', level: 12, center: { x: 124, z: 158 }, radius: 7, color: '#c1e8ff', biome: 'cloud', hp: 1180 },
  { id: 'wraith-void', scene: 'ascendant', kind: 'sky_wraith', name: 'Hư Không Ảnh', level: 13, center: { x: -190, z: -120 }, radius: 7, color: '#ccb9ff', biome: 'mist', hp: 1320 },
  { id: 'crane-storm', scene: 'ascendant', kind: 'cloud_crane', name: 'Lôi Vân Hạc', level: 14, center: { x: 62, z: -252 }, radius: 7, color: '#c1e8ff', biome: 'cloud', hp: 1460 },
  { id: 'serpent-abyss', scene: 'ascendant', kind: 'void_serpent', name: 'Vô Đáy Mãng', level: 15, center: { x: 210, z: -140 }, radius: 7, color: '#a29beb', biome: 'crystal', hp: 1610 },
  { id: 'guardian-heaven', scene: 'ascendant', kind: 'star_guardian', name: 'Thiên Môn Hộ Vệ', level: 16, center: { x: -40, z: 250 }, radius: 7, color: '#f4cc86', biome: 'ruins', hp: 1760 },
];
export type MonsterState = { id: string; scene: 'wilderness' | 'ascendant'; kind: MonsterKind; name: string; level: number;
  position: Vector3; hp: number; maxHp: number; radius: number; respawnAt: number | null };
export type BossState = { id: string; name: string; position: Vector3; hp: number; maxHp: number; respawnAt: number | null };
export type WorldDrop = { id: string; itemId: string; scene: WorldZone; position: Vector3; expiresAt: number };
export type FormationState = { id: string; ownerId: string; scene: WorldZone; position: Vector3; radius: number; expiresAt: number };
export type WorldSnapshot = { scene: GameScene; players: PublicPlayer[]; boss: BossState | null; monsters: MonsterState[]; herbs: HerbState[];
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
  /** Path skills default to Trúc Cơ (2); higher techniques require their book and realm. */
  minRealm?: number; icon: string; color: string;
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
  heaven_blade: { id: 'heaven_blade', name: 'Phá Thiên Kiếm', description: 'Kiếm quang đâm xuyên nhiều tầng yêu thú; cần Hóa Thần.', path: 'kiem', minRealm: 5, shape: 'line', range: 18, radius: 2, damage: 175, mana: 65, cooldown: 12, icon: '⚔', color: '#a5fff2' },
  celestial_swords: { id: 'celestial_swords', name: 'Tiên Kiếm Triều Thiên', description: 'Vạn kiếm đổ xuống trước mặt; cần Chân Tiên.', path: 'kiem', minRealm: 10, shape: 'cone', range: 17, radius: 0, damage: 310, mana: 105, cooldown: 38, ultimate: true, icon: '✧', color: '#dcfff5' },
  frost_lotus: { id: 'frost_lotus', name: 'Băng Liên Trận', description: 'Linh liên đóng băng một vùng; cần Hóa Thần.', path: 'phap', minRealm: 5, shape: 'sphere', range: 18, radius: 5.3, damage: 168, mana: 64, cooldown: 12, icon: '❄', color: '#9cddff' },
  thunder_stars: { id: 'thunder_stars', name: 'Cửu Thiên Tinh Lôi', description: 'Tinh lôi quét sạch thiên địa; cần Chân Tiên.', path: 'phap', minRealm: 10, shape: 'sphere', range: 19, radius: 8, damage: 312, mana: 110, cooldown: 39, ultimate: true, icon: '☄', color: '#d0b5ff' },
  dragon_fist: { id: 'dragon_fist', name: 'Long Tượng Quyền', description: 'Quyền phong rung chuyển mặt đất; cần Hóa Thần.', path: 'the', minRealm: 5, shape: 'cone', range: 11, radius: 0, damage: 169, mana: 60, cooldown: 12, icon: '◉', color: '#ffc787' },
  immortal_body: { id: 'immortal_body', name: 'Bất Diệt Kim Thân', description: 'Địa chấn cuồng bạo; cần Chân Tiên.', path: 'the', minRealm: 10, shape: 'sphere', range: 1, radius: 10, damage: 299, mana: 98, cooldown: 37, ultimate: true, icon: '❖', color: '#ffe698' },
  beast_pact: { id: 'beast_pact', name: 'Linh Thú Hiệp Kích', description: 'Linh thú phối hợp đánh phía trước. Trang bị thú tăng thêm sát thương.', path: 'thu', shape: 'cone', range: 10, radius: 0, damage: 54, mana: 21, cooldown: 6, icon: '✿', color: '#8ee3ac' },
  beast_roar: { id: 'beast_roar', name: 'Vạn Thú Khiếu', description: 'Tiếng gầm linh thú tràn ra bốn phía; cần Hóa Thần.', path: 'thu', minRealm: 5, shape: 'sphere', range: 1, radius: 7, damage: 175, mana: 67, cooldown: 14, icon: '❀', color: '#81d8bc' },
  myriad_beasts: { id: 'myriad_beasts', name: 'Bách Thú Triều Tông', description: 'Đàn thú xông lên như sóng, cần Chân Tiên.', path: 'thu', minRealm: 10, shape: 'cone', range: 18, radius: 0, damage: 304, mana: 108, cooldown: 39, ultimate: true, icon: '✥', color: '#c4ffcd' },
  shadow_claw: { id: 'shadow_claw', name: 'U Minh Trảo', description: 'Ma khí hóa trảo xuyên qua yêu thú.', path: 'ma', shape: 'line', range: 12, radius: 1.7, damage: 61, mana: 23, cooldown: 6, icon: '◆', color: '#e29cb8' },
  blood_moon: { id: 'blood_moon', name: 'Huyết Nguyệt Ấn', description: 'Phủ Huyết Ấn lên một vùng, cần Hóa Thần.', path: 'ma', minRealm: 5, shape: 'sphere', range: 16, radius: 5, damage: 181, mana: 71, cooldown: 14, icon: '☾', color: '#e47f9a' },
  abyss_reap: { id: 'abyss_reap', name: 'Vạn Hồn Quy Khư', description: 'Ma niệm thôn phệ chiến trường, cần Chân Tiên.', path: 'ma', minRealm: 10, shape: 'cone', range: 18, radius: 0, damage: 322, mana: 112, cooldown: 40, ultimate: true, icon: '✺', color: '#dd81bf' },
};
export function skillRealm(skill: SkillDefinition): number { return skill.minRealm ?? (skill.path ? 2 : 0); }
export function skillsForPath(path: Path | null): SkillDefinition[] {
  return [SKILLS.spirit_cut, ...Object.values(SKILLS).filter((skill) => skill.path === path && path !== null)];
}
export type Recipe = { id: string; name: string; profession: 'dan' | 'khi' | 'tran'; cost: Partial<Resources>; itemId?: string; reward?: Partial<Resources>; station?: 'alchemy'; description: string };
export const RECIPES: Record<string, Recipe> = {
  spirit_pill: { id: 'spirit_pill', name: 'Tụ Khí Đan', profession: 'dan', cost: { herbs: 3, stones: 4 }, reward: { stones: 10 }, description: 'Luyện đan cơ bản: đổi dược thảo thành linh thạch, có thể làm khi hành tẩu.' },
  heal_pill: { id: 'heal_pill', name: 'Hồi Huyết Đan', profession: 'dan', station: 'alchemy', cost: { herbs: 3, stones: 4 }, itemId: 'heal_pill', description: 'Trong Phòng Luyện Đan: luyện thuốc hồi 70 sinh lực.' },
  mana_pill: { id: 'mana_pill', name: 'Hồi Linh Đan', profession: 'dan', station: 'alchemy', cost: { herbs: 4, stones: 5 }, itemId: 'mana_pill', description: 'Trong Phòng Luyện Đan: luyện thuốc hồi 90 chân khí.' },
  foundation_pill: { id: 'foundation_pill', name: 'Trúc Cơ Đan', profession: 'dan', station: 'alchemy', cost: { herbs: 8, ore: 2, stones: 12 }, itemId: 'foundation_pill', description: 'Trong Phòng Luyện Đan: giúp vượt lôi kiếp (dùng khi bắt đầu độ kiếp).' },
  jade_blade: { id: 'jade_blade', name: 'Thanh Liên Kiếm', profession: 'khi', cost: { ore: 4, stones: 12 }, itemId: 'jade_blade', description: 'Luyện khí: rèn một thanh kiếm phẩm Tím.' },
  fate_orb: { id: 'fate_orb', name: 'Bản Mệnh Châu', profession: 'tran', cost: { ink: 3, stones: 16 }, itemId: 'fate_orb', description: 'Trận pháp: ngưng tụ pháp bảo bản mệnh.' },
};

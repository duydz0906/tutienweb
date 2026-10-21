import { SECT_BUILDINGS, type Vector3 } from '@van-thuong/shared';

const WALL_THICKNESS = 0.42;
const PLAYER_RADIUS = 0.43;
type Wall = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Same three open doorways as the 3D buildings; walls are solid even at admin movement speed. */
export const sectWalls: Wall[] = SECT_BUILDINGS.flatMap(({ x, z, width, depth, doorway }) => {
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

function inside(p: Vector3, wall: Wall): boolean {
  return p.x >= wall.minX - PLAYER_RADIUS && p.x <= wall.maxX + PLAYER_RADIUS &&
    p.z >= wall.minZ - PLAYER_RADIUS && p.z <= wall.maxZ + PLAYER_RADIUS;
}

function segmentHitsWall(from: Vector3, to: Vector3, wall: Wall): boolean {
  // If an old save or admin summon overlaps a wall, the character may move OUT of it.
  if (inside(from, wall)) return inside(to, wall) &&
    Math.hypot(to.x - (wall.minX + wall.maxX) / 2, to.z - (wall.minZ + wall.maxZ) / 2) <
    Math.hypot(from.x - (wall.minX + wall.maxX) / 2, from.z - (wall.minZ + wall.maxZ) / 2);
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

export function canWalkInSect(from: Vector3, to: Vector3): boolean {
  return !sectWalls.some((wall) => segmentHitsWall(from, to, wall));
}

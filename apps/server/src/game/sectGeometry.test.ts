import { describe, expect, it } from 'vitest';
import { NPCS, PORTALS, SECT_BUILDINGS } from '@van-thuong/shared';
import { canWalkInSect } from './sectGeometry.js';

const p = (x: number, z: number) => ({ x, y: 0, z });

describe('walkable, server-authoritative sect buildings', () => {
  it('has unobstructed front doorways to every NPC and an open path to the portal', () => {
    expect(canWalkInSect(p(0, 10), PORTALS.overworld.position)).toBe(true);
    for (const room of SECT_BUILDINGS) {
      const before = p(room.x, room.z - room.depth / 2 - 1.6);
      const inside = p(room.x, room.z - room.depth / 2 + 1.6);
      expect(canWalkInSect(before, inside)).toBe(true);
      expect(canWalkInSect(inside, before)).toBe(true);
      expect(canWalkInSect(inside, NPCS[room.id].position)).toBe(true);
    }
  });

  it('stops cutting through front, back and side walls, including fast/swept movement', () => {
    for (const room of SECT_BUILDINGS) {
      const side = room.x + room.width / 2;
      const front = room.z - room.depth / 2;
      expect(canWalkInSect(p(room.x + room.doorway / 2 + 2, front - 2), p(room.x + room.doorway / 2 + 2, front + 2))).toBe(false);
      expect(canWalkInSect(p(room.x, room.z + room.depth / 2 - 2), p(room.x, room.z + room.depth / 2 + 2))).toBe(false);
      expect(canWalkInSect(p(side + 2, room.z), p(side - 2, room.z))).toBe(false);
    }
    expect(canWalkInSect(p(0, 6), p(0, 8))).toBe(true);
  });
});

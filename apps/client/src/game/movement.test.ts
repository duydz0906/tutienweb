import { describe, expect, it } from 'vitest';
import { PRIVATE_RADIUS, SECT_BUILDINGS, TRIAL_RADIUS, VILLAGE_RADIUS, WALK_SPEED, WORLD_RADIUS,
  canWalkInSect, resolveMove } from '@van-thuong/shared';

/**
 * Movement is shared so that the client's prediction and the server's integration cannot disagree —
 * every disagreement is a correction, and every correction is something the player sees. These are
 * the rules both sides now run.
 */
const at = (x: number, z: number) => ({ x, y: 0, z });

describe('shared movement rule', () => {
  it('clamps to the boundary of whichever map the body is on', () => {
    const far = at(WORLD_RADIUS * 3, -WORLD_RADIUS * 3);
    const wilderness = resolveMove(at(0, 0), far, { scene: 'wilderness' });
    expect(Math.hypot(wilderness.x, wilderness.z)).toBeCloseTo(WORLD_RADIUS, 5);
    const village = resolveMove(at(0, 0), far, { scene: 'village' });
    expect(Math.hypot(village.x, village.z)).toBeCloseTo(VILLAGE_RADIUS, 5);
    const room = resolveMove(at(0, 0), far, { scene: 'residence' });
    expect(Math.hypot(room.x, room.z)).toBeCloseTo(PRIVATE_RADIUS, 5);
    const trial = resolveMove(at(0, 0), far, { scene: 'tribulation' });
    expect(Math.hypot(trial.x, trial.z)).toBeCloseTo(TRIAL_RADIUS, 5);
  });

  it('stops at a sect wall but lets the body through the doorway', () => {
    const hall = SECT_BUILDINGS[0];
    const front = hall.z - hall.depth / 2;
    const outside = at(hall.x + 6, front + 2.5);
    const through = at(hall.x + 6, front - 2.5);
    // Straight at the wall, well away from the doorway.
    expect(canWalkInSect(outside, through)).toBe(false);
    const blocked = resolveMove(outside, through, { scene: 'overworld' });
    expect(blocked.z).toBeCloseTo(outside.z, 5);
    // …and the same step at the middle of the building goes in, because that is the door.
    const doorway = resolveMove(at(hall.x, front + 2.5), at(hall.x, front - 2.5), { scene: 'overworld' });
    expect(doorway.z).toBeCloseTo(front - 2.5, 5);
  });

  it('keeps a body inside the hall unless it leaves through the doorway', () => {
    const hall = SECT_BUILDINGS[0];
    // From the middle of the hall straight at the front wall, off-centre: refused.
    const inside = at(hall.x + 6, hall.z);
    expect(canWalkInSect(inside, at(hall.x + 6, hall.z - 8))).toBe(false); // front wall
    expect(canWalkInSect(inside, at(hall.x + 6, hall.z + 8))).toBe(false); // back wall
    // …and straight out through the front doorway: allowed.
    expect(canWalkInSect(at(hall.x, hall.z), at(hall.x, hall.z - 8))).toBe(true);
  });

  it('does not walk through another body, but can step away from one', () => {
    const monster = { position: at(0, 0), radius: 1.2 };
    const approach = resolveMove(at(0, 2), at(0, 0.6), { scene: 'wilderness', obstacles: [monster] });
    expect(approach.z).toBe(2);
    const leave = resolveMove(at(0, 0.8), at(0, 1.6), { scene: 'wilderness', obstacles: [monster] });
    expect(leave.z).toBeCloseTo(1.6, 5);
  });

  it('predicts a whole second of walking exactly the distance the server integrates', () => {
    // 60 client frames of one 60th of a second against 20 server ticks of 50 ms: the same ground.
    let client = at(0, 0), server = at(0, 0);
    for (let frame = 0; frame < 60; frame++) client = resolveMove(client, at(client.x, client.z + WALK_SPEED / 60), { scene: 'wilderness' });
    for (let tick = 0; tick < 20; tick++) server = resolveMove(server, at(server.x, server.z + WALK_SPEED * 0.05), { scene: 'wilderness' });
    expect(client.z).toBeCloseTo(WALK_SPEED, 5);
    expect(server.z).toBeCloseTo(client.z, 5);
  });
});

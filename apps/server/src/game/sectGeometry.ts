/**
 * Sect wall collision now lives in `@van-thuong/shared`, because the client predicts movement with
 * exactly the same geometry — see `resolveMove`. This module stays as the server's import path so
 * existing rules and tests keep pointing at one place.
 */
export { SECT_WALLS as sectWalls, canWalkInSect } from '@van-thuong/shared';

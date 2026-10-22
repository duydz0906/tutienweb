import { describe, expect, it } from 'vitest';
import { canUseDevTools, heroEyebrow } from './devTools';

/**
 * Dev UI is a local sandbox affordance: `npm run dev` (signed local session, `devAutoLogin: true`)
 * or a verified admin. A normal player logging in — even on a save that still carries a dev flag —
 * must only ever see the regular panels.
 */
describe('dev tools visibility', () => {
  it('hides every dev panel for a normal player', () => {
    expect(canUseDevTools({ devMode: false, isAdmin: false }, false)).toBe(false);
    expect(canUseDevTools({ devMode: false, isAdmin: true }, false)).toBe(false);
    expect(canUseDevTools(null, false)).toBe(false);
  });

  it('shows dev tools inside the npm run dev sandbox', () => {
    expect(canUseDevTools({ devMode: true, isAdmin: false }, true)).toBe(true);
  });

  it('lets a verified admin use their own tools anywhere', () => {
    expect(canUseDevTools({ devMode: true, isAdmin: true }, false)).toBe(true);
  });

  it('never shows dev tools for a server that granted no dev power', () => {
    // The API is the authority: without `devMode` the flag alone cannot open the drawer.
    expect(canUseDevTools({ devMode: false, isAdmin: false }, true)).toBe(false);
  });

  it('labels the hero card honestly', () => {
    expect(heroEyebrow({ devMode: true, isAdmin: true }, true)).toBe('✦ THIÊN ĐẠO CHỦ');
    expect(heroEyebrow({ devMode: true, isAdmin: false }, true)).toBe('✦ DEV SANDBOX');
    expect(heroEyebrow({ devMode: false, isAdmin: false }, false)).toBe('ĐỆ TỬ VÂN THƯỢNG');
  });
});

/**
 * Personal HUD preferences only. Nothing here changes the authoritative game state:
 * the server still decides combat, movement and who may use dev tools.
 */
export type HudPrefs = {
  chatOpen: boolean;
  cultivateOpen: boolean;
  questCard: boolean;
  minimap: boolean;
  skillLabels: boolean;
};

export const DEFAULT_HUD_PREFS: HudPrefs = {
  chatOpen: true,
  cultivateOpen: true,
  // The old "Tông Môn" quest card duplicated the Menu; it starts hidden and can be re-enabled.
  questCard: false,
  minimap: true,
  skillLabels: true,
};

const KEY = 'van-thuong:hud-prefs';

export function loadHudPrefs(): HudPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_HUD_PREFS };
    const data = JSON.parse(raw) as Partial<Record<keyof HudPrefs, unknown>>;
    const bool = (key: keyof HudPrefs) => typeof data[key] === 'boolean' ? data[key] as boolean : DEFAULT_HUD_PREFS[key];
    return {
      chatOpen: bool('chatOpen'), cultivateOpen: bool('cultivateOpen'), questCard: bool('questCard'),
      minimap: bool('minimap'), skillLabels: bool('skillLabels'),
    };
  } catch { return { ...DEFAULT_HUD_PREFS }; }
}

export function saveHudPrefs(prefs: HudPrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode: session default is fine */ }
}

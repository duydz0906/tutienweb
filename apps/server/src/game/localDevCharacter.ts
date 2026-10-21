import { DEFAULT_APPEARANCE, type CharacterState } from '@van-thuong/shared';
import type { CharacterStore } from '../db/store.js';
import { LOCAL_DEV_NAME, LOCAL_DEV_UID } from '../localDev.js';
import { activateDevMode } from './devMode.js';
import { newCharacter } from './rules.js';

/** Only invoked for the server-issued local sandbox session; never for a Firebase admin UID. */
export async function ensureLocalDevCharacter(store: CharacterStore): Promise<CharacterState> {
  let character = await store.get(LOCAL_DEV_UID);
  if (!character) character = await store.create(newCharacter(LOCAL_DEV_UID, {
    name: LOCAL_DEV_NAME, gender: 'nam',
    appearance: { ...DEFAULT_APPEARANCE, hair: 'short', face: 'angular', robeColor: 'midnight', height: 0.6, build: 0.67 },
  }));
  // Existing files keep their ID, Linh Căn, appearance, inventory, quests and world position.
  const changed = activateDevMode(character);
  if (character.name !== LOCAL_DEV_NAME) { character.name = LOCAL_DEV_NAME; await store.save(character); }
  else if (changed) await store.save(character);
  return character;
}

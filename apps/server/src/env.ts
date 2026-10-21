import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
// Both workspaces read the SAME root .env; never bundle server variables in Vite.
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

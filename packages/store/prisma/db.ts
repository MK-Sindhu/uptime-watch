import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './schema.d';
config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
import contractJson from './schema.json' with { type: 'json' };

export const db = postgres<Contract>({
  contractJson,
  url: process.env['DATABASE_URL']!,
});

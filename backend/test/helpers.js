import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { readEnv } from '../src/config/env.js';
import { loadKnowledge } from '../src/services/knowledge.service.js';
import { createMemoryFavorites } from '../src/config/firebase.js';
import { createApp } from '../src/app.js';

export const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../data');
export const store = loadKnowledge(dataDir);

export async function startServer(overrides = {}) {
  const env = { ...readEnv({}), corsOrigins: ['http://localhost:5173', 'https://*.vercel.app'], rateLimitPerMinute: 10_000, ...overrides.env };
  const verifyToken = 'verifyToken' in overrides
    ? overrides.verifyToken
    : async (t) => { if (t === 'good-token') return { uid: 'u1' }; if (t === 'other-token') return { uid: 'u2' }; throw new Error('bad'); };
  const app = createApp({ store, env, verifyToken, favorites: createMemoryFavorites() });
  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

export async function get(base, path, headers = {}) {
  const res = await fetch(base + path, { headers });
  const body = await res.json();
  return { status: res.status, body, headers: res.headers };
}

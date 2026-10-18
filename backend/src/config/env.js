// 환경 변수 읽기. 실제 값은 코드에 두지 않는다 (Render 대시보드 / 로컬 .env).
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000', 'http://localhost:8080', 'http://127.0.0.1:8080'];

export function readEnv(source = process.env) {
  const production = source.NODE_ENV === 'production';
  const listed = (source.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const { FIREBASE_PROJECT_ID: projectId, FIREBASE_CLIENT_EMAIL: clientEmail, FIREBASE_PRIVATE_KEY: privateKey } = source;
  return {
    production,
    port: Number(source.PORT) || 8787,
    dataDir: source.DATA_DIR ? resolve(source.DATA_DIR) : resolve(here, '../../data'),
    corsOrigins: listed.length ? listed : production ? [] : DEV_ORIGINS,
    rateLimitPerMinute: Number(source.RATE_LIMIT_PER_MIN) || 240,
    firebase: projectId && clientEmail && privateKey
      ? { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') }
      : null,
  };
}

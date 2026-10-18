import { readEnv } from './config/env.js';
import { createFirebase } from './config/firebase.js';
import { loadKnowledge } from './services/knowledge.service.js';
import { createApp } from './app.js';

const env = readEnv();

// 데이터가 깨져 있으면 서버를 띄우지 않는다 (잘못된 지식을 서비스하는 것보다 낫다)
const store = loadKnowledge(env.dataDir);
for (const w of store.warnings) console.warn(`[data] ${w}`);

// Firebase 설정이 잘못되어도 지식(사전) API 는 계속 서비스한다. 인증이 필요한 API 만 503 이 된다.
let firebase = { enabled: false };
try {
  firebase = await createFirebase(env.firebase);
} catch (err) {
  console.error(`[firebase] 초기화 실패 — 인증 기능 없이 시작합니다: ${err.message}`);
}
if (!firebase.enabled) console.warn('[firebase] 비활성화됨 (환경 변수 없음 또는 초기화 실패) — 로그인/즐겨찾기 API는 503을 반환합니다');
if (env.production && env.corsOrigins.length === 0) console.warn('[cors] CORS_ORIGINS 가 비어 있어 브라우저에서의 교차 출처 요청이 모두 거부됩니다');

const app = createApp({ store, env, verifyToken: firebase.verifyToken, favorites: firebase.favorites });
const server = app.listen(env.port, () => {
  console.log(`[ieum-codingdictionary] http://localhost:${env.port}  data ${store.dataVersion} (${store.manifest.totalEntries} entries)`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

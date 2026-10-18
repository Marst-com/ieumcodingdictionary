import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import { corsMiddleware } from './middleware/cors.js';
import { dataVersion } from './middleware/data-version.js';
import { knowledgeRoutes } from './routes/knowledge.js';
import { userRoutes } from './routes/users.js';
import { ApiError, sendOk, sendFail } from './lib/http.js';

/**
 * Express 앱 팩토리. 의존성을 주입받기 때문에 테스트에서 Firebase 없이도 전체 API를 검증할 수 있다.
 * @param {{store: object, env: object, verifyToken?: Function, favorites?: object}} deps
 */
export function createApp({ store, env, verifyToken, favorites }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render 같은 프록시 뒤에서 실제 클라이언트 IP 사용

  // API 응답은 다른 출처(Vercel)에서 읽혀야 하므로 CORP 를 cross-origin 으로 둔다.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression()); // 검색 인덱스(JSON)는 gzip 으로 약 1/4 크기
  app.use(corsMiddleware(env.corsOrigins));
  app.use(rateLimit({
    windowMs: 60_000,
    limit: env.rateLimitPerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => sendFail(res, 429, 'RATE_LIMITED', '요청이 너무 많습니다. 잠시 후 다시 시도하세요'),
  }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', dataVersion: store.dataVersion, auth: Boolean(verifyToken) });
  });

  const v1 = express.Router();
  v1.use(dataVersion(store));
  v1.get('/', (req, res) => sendOk(res, { name: 'IEUM CodingDictionary API', ...store.manifest }));
  v1.use('/me', userRoutes({ store, verifyToken, favorites }));
  v1.use('/', knowledgeRoutes(store));
  app.use('/api/v1', v1);

  app.use((req, res) => sendFail(res, 404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) return sendFail(res, err.status, err.code, err.message);
    if (err?.type === 'entity.parse.failed') return sendFail(res, 400, 'INVALID_JSON', '요청 본문이 올바른 JSON이 아닙니다');
    if (err?.type === 'entity.too.large') return sendFail(res, 413, 'PAYLOAD_TOO_LARGE', '요청 본문이 너무 큽니다');
    console.error('[unhandled]', err);
    return sendFail(res, 500, 'INTERNAL_ERROR', '서버 오류가 발생했습니다');
  });

  return app;
}

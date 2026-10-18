// 로그인한 사용자의 동적 데이터 (Firebase) — 즐겨찾기
import { Router, json } from 'express';
import { sendOk, badRequest } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';

const MAX_FAVORITES = 500;

export function userRoutes({ store, verifyToken, favorites }) {
  const r = Router();
  r.use(requireAuth(verifyToken));

  r.get('/favorites', async (req, res) => {
    const ids = await favorites.get(req.user.uid);
    sendOk(res, { ids: ids.filter((id) => store.hasEntry(id)) });
  });

  // 전체 목록을 덮어쓴다 (클라이언트가 로컬 목록과 병합한 결과를 보냄)
  r.put('/favorites', json({ limit: '32kb' }), async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length > MAX_FAVORITES || !ids.every((x) => typeof x === 'string')) {
      throw badRequest(`ids는 문자열 배열(최대 ${MAX_FAVORITES}개)이어야 합니다`, 'INVALID_BODY');
    }
    const unknown = ids.filter((id) => !store.hasEntry(id));
    if (unknown.length) throw badRequest(`존재하지 않는 항목: ${unknown.slice(0, 5).join(', ')}`, 'INVALID_BODY');
    const unique = [...new Set(ids)];
    await favorites.set(req.user.uid, unique);
    sendOk(res, { ids: unique });
  });

  return r;
}

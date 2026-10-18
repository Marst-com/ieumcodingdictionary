import { ApiError } from '../lib/http.js';

/** Authorization: Bearer <Firebase ID token> 검증. verifyToken 이 없으면(Firebase 미설정) 503. */
export function requireAuth(verifyToken) {
  return async (req, res, next) => {
    if (!verifyToken) return next(new ApiError(503, 'AUTH_UNAVAILABLE', '인증 서비스가 설정되지 않았습니다'));
    const header = req.get('authorization') || '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) return next(new ApiError(401, 'UNAUTHORIZED', 'Authorization: Bearer <token> 헤더가 필요합니다'));
    try {
      req.user = await verifyToken(match[1]);
      return next();
    } catch {
      return next(new ApiError(401, 'UNAUTHORIZED', '유효하지 않거나 만료된 토큰입니다'));
    }
  };
}

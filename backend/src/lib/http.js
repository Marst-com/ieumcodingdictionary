// 모든 IEUM 서비스가 같은 형태로 응답을 받도록 하는 공용 응답 규격.
export const API_VERSION = '1.0.0';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (message = 'Not found') => new ApiError(404, 'NOT_FOUND', message);
export const badRequest = (message, code = 'INVALID_QUERY') => new ApiError(400, code, message);

export function sendOk(res, data, meta = {}) {
  res.json({ success: true, data, error: null, meta: { version: API_VERSION, ...res.locals.meta, ...meta } });
}

export function sendFail(res, status, code, message) {
  res.status(status).json({ success: false, data: null, error: { code, message }, meta: { version: API_VERSION, ...res.locals.meta } });
}

/** 정수 쿼리 파라미터 파서 (범위를 벗어나면 400) */
export function intParam(value, { name, min, max, fallback }) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${name}은(는) ${min}~${max} 사이의 정수여야 합니다`);
  return n;
}

/** "a,b" 형태 쿼리 파라미터를 배열로 (문자열이 아니면 400) */
export function listParam(value, name) {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw badRequest(`${name}은(는) 문자열이어야 합니다`);
  const list = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length > 10) throw badRequest(`${name}은(는) 최대 10개까지 지정할 수 있습니다`);
  return list;
}

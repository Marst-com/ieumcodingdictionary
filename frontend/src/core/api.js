// Backend(Render) API 클라이언트. 프론트엔드는 이 파일 밖에서 URL 구조를 알 필요가 없다.
export class ApiClientError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {{base: string, fetchImpl?: typeof fetch, timeoutMs?: number}} opts
 * 무료 호스팅의 콜드 스타트(수십 초)를 고려해 기본 타임아웃은 40초.
 */
export function createApi({ base, fetchImpl = (...a) => fetch(...a), timeoutMs = 40000 }) {
  if (!base) throw new Error('apiBase가 설정되지 않았습니다 (config.js)');
  const root = `${base.replace(/\/+$/, '')}/api/v1`;

  async function request(path, { method = 'GET', token, body } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json'; // GET 은 커스텀 헤더가 없어 CORS preflight 가 생기지 않는다
    let res;
    try {
      res = await fetchImpl(root + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
    } catch (e) {
      if (e?.name === 'AbortError') throw new ApiClientError('TIMEOUT', '서버 응답이 너무 오래 걸립니다');
      throw new ApiClientError('NETWORK', '서버에 연결할 수 없습니다');
    } finally {
      clearTimeout(timer);
    }
    let json = null;
    try { json = await res.json(); } catch { /* 본문이 JSON 이 아님 */ }
    if (!res.ok || !json || json.success !== true) {
      throw new ApiClientError(json?.error?.code || `HTTP_${res.status}`, json?.error?.message || `요청이 실패했습니다 (${res.status})`, res.status);
    }
    return { data: json.data, meta: json.meta };
  }

  return {
    manifest: () => request('/manifest'),
    index: (langs) => request(`/search/index${langs?.length ? `?lang=${encodeURIComponent(langs.join(','))}` : ''}`),
    syntaxIndex: (langs) => request(`/search/syntax-index${langs?.length ? `?lang=${encodeURIComponent(langs.join(','))}` : ''}`),
    entry: (id) => request(`/entries/${encodeURIComponent(id)}`),
    getFavorites: (token) => request('/me/favorites', { token }),
    putFavorites: (token, ids) => request('/me/favorites', { method: 'PUT', token, body: { ids } }),
  };
}

// 해시 라우팅:  #/                       홈
//               #/?q=함수&lang=python    검색 / 필터
//               #/?m=g&q=for%20(         문법(코드 모양) 검색 — m=g
//               #/entry/<id>?q=...       상세 (검색 상태 유지)
// 해시가 상태의 단일 원천이라 새로고침, 뒤로가기, 링크 공유가 모두 동작한다.
export const EMPTY_ROUTE = Object.freeze({ entryId: null, q: '', lang: '', type: '', category: '', fav: false, mode: 'word' });

export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const params = new URLSearchParams(queryPart);
  const m = /^\/entry\/(.+)$/.exec(pathPart);
  let entryId = null;
  if (m) { try { entryId = decodeURIComponent(m[1]); } catch { entryId = null; } }
  if (entryId && !/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(entryId)) entryId = null;
  return {
    entryId,
    q: (params.get('q') || '').slice(0, 100),
    lang: params.get('lang') || '',
    type: params.get('type') || '',
    category: params.get('cat') || '',
    fav: params.get('fav') === '1',
    mode: params.get('m') === 'g' ? 'grammar' : 'word',
  };
}

export function buildHash(route) {
  const p = new URLSearchParams();
  if (route.q) p.set('q', route.q);
  if (route.lang) p.set('lang', route.lang);
  if (route.type) p.set('type', route.type);
  if (route.category) p.set('cat', route.category);
  if (route.fav) p.set('fav', '1');
  if (route.mode === 'grammar') p.set('m', 'g');
  const qs = p.toString();
  const path = route.entryId ? `/entry/${encodeURIComponent(route.entryId)}` : '/';
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export function createRouter({ onChange, win = window }) {
  let current = parseHash(win.location.hash);
  win.addEventListener('hashchange', () => { current = parseHash(win.location.hash); onChange(current); });
  return {
    current: () => current,
    /** replace=true 면 히스토리를 쌓지 않는다 (타이핑, 미리보기 등) */
    go(route, { replace = false } = {}) {
      const next = { ...EMPTY_ROUTE, ...route };
      const hash = buildHash(next);
      if (hash === (win.location.hash || '#/')) { current = next; return; }
      if (replace) {
        win.history.replaceState(null, '', hash);
        current = parseHash(win.location.hash);
        onChange(current);
      } else {
        win.location.hash = hash; // hashchange 가 onChange 를 호출한다
      }
    },
  };
}

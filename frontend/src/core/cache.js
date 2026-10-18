// localStorage 래퍼. 용량 초과/사생활 보호 모드 등에서 실패해도 앱은 계속 동작한다.
export function createCache(storage, prefix = 'ieum.cd.') {
  const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
  return {
    get(key) {
      return safe(() => {
        const raw = storage.getItem(prefix + key);
        return raw == null ? null : JSON.parse(raw);
      }, null);
    },
    set(key, value) { return safe(() => { storage.setItem(prefix + key, JSON.stringify(value)); return true; }, false); },
    remove(key) { safe(() => storage.removeItem(prefix + key)); },
  };
}

/** window.localStorage 접근 자체가 예외를 던지는 환경을 위한 메모리 대체 */
export function getStorage() {
  try {
    const s = window.localStorage;
    s.setItem('__t', '1'); s.removeItem('__t');
    return s;
  } catch {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  }
}

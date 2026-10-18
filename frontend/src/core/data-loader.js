// 검색 인덱스 로더: localStorage 캐시를 먼저 쓰고(stale-while-revalidate), dataVersion 이 바뀌면 새로 받는다.
// 상세 정보는 클릭할 때만 요청하고 메모리에 보관한다.
const INDEX_KEY = 'index';
export const SUPPORTED_SCHEMA_MAJOR = '1';

const major = (v) => String(v || '').split('.')[0];

function usable(idx) {
  return Boolean(idx && Array.isArray(idx.records) && idx.records.length && Array.isArray(idx.concepts) && Array.isArray(idx.languages) && major(idx.schemaVersion) === SUPPORTED_SCHEMA_MAJOR);
}

async function fetchIndex(api) {
  const { data } = await api.index();
  if (!usable(data)) throw new Error('지원하지 않는 데이터 형식입니다. 페이지를 새로고침해 주세요.');
  return data;
}

/**
 * @returns {Promise<{index: object, fromCache: boolean}>}
 *   캐시가 있으면 즉시 반환하고, 백그라운드에서 버전을 확인해 달라졌을 때만 onFresh(newIndex)를 호출한다.
 */
export async function loadIndex({ api, cache, onFresh }) {
  const cached = cache.get(INDEX_KEY);
  if (usable(cached)) {
    api.manifest()
      .then(async ({ data }) => {
        if (data.dataVersion === cached.dataVersion) return;
        const fresh = await fetchIndex(api);
        cache.set(INDEX_KEY, fresh);
        onFresh?.(fresh);
      })
      .catch(() => { /* 오프라인이어도 캐시로 계속 사용 */ });
    return { index: cached, fromCache: true };
  }
  const fresh = await fetchIndex(api);
  cache.set(INDEX_KEY, fresh);
  return { index: fresh, fromCache: false };
}

const SYNTAX_KEY = 'syntax-index';

/**
 * 문법(코드 모양) 검색 인덱스. 문법 모드를 처음 열 때만 내려받고 dataVersion 별로 캐시한다.
 * @param {string} expectVersion 단어 인덱스의 dataVersion — 다르면 캐시를 버리고 새로 받는다
 */
export async function loadSyntaxIndex({ api, cache, expectVersion }) {
  const cached = cache.get(SYNTAX_KEY);
  const ok = (x) => Boolean(x && Array.isArray(x.records) && x.records.length && major(x.schemaVersion) === SUPPORTED_SCHEMA_MAJOR);
  if (ok(cached) && cached.dataVersion === expectVersion) return cached;
  const { data } = await api.syntaxIndex();
  if (!ok(data)) throw new Error('지원하지 않는 데이터 형식입니다. 페이지를 새로고침해 주세요.');
  cache.set(SYNTAX_KEY, data);
  return data;
}

/** 항목 상세 로더 (메모리 캐시 + 진행 중 요청 공유) */
export function createEntryLoader(api) {
  const done = new Map();
  const pending = new Map();
  return {
    peek: (id) => done.get(id) || null,
    load(id) {
      if (done.has(id)) return Promise.resolve(done.get(id));
      if (pending.has(id)) return pending.get(id);
      const p = api.entry(id)
        .then(({ data }) => { done.set(id, data); return data; })
        .finally(() => pending.delete(id));
      pending.set(id, p);
      return p;
    },
    clear: () => done.clear(),
  };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiClientError } from '../src/core/api.js';
import { createCache } from '../src/core/cache.js';
import { loadIndex, loadSyntaxIndex, createEntryLoader } from '../src/core/data-loader.js';
import { parseHash, buildHash, createRouter } from '../src/ui/navigation.js';
import { createStore } from '../src/core/state.js';
import { createSearchEngine, createSyntaxSearch, codePattern } from '../src/core/search-engine.js';

const ok = (data, status = 200) => new Response(JSON.stringify({ success: true, data, error: null, meta: { version: '1.0.0' } }), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status, code, message) => new Response(JSON.stringify({ success: false, data: null, error: { code, message } }), { status, headers: { 'Content-Type': 'application/json' } });
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const sampleIndex = (dataVersion = '1', schemaVersion = '1.0.0') => ({
  schemaVersion, dataVersion, languages: [{ id: 'html', name: 'HTML', nativeName: 'HTML' }], concepts: [],
  records: [{ id: 'html.tag.div', s: '<div>', n: 'div', a: [], c: [], l: 'html', t: 'tag', g: 'structure', d: 'd', x: '<div>' }],
});

test('api: GET 은 커스텀 헤더를 보내지 않는다 (CORS preflight 방지)', async () => {
  let seen;
  const api = createApi({ base: 'https://api.example.com/', fetchImpl: async (url, init) => { seen = { url, init }; return ok({ x: 1 }); } });
  const r = await api.entry('html.tag.div');
  assert.equal(seen.url, 'https://api.example.com/api/v1/entries/html.tag.div');
  assert.deepEqual(seen.init.headers, {});
  assert.deepEqual(r.data, { x: 1 });
});

test('api: 인증/본문이 있으면 Authorization 과 Content-Type 을 보낸다', async () => {
  let seen;
  const api = createApi({ base: 'http://x', fetchImpl: async (url, init) => { seen = init; return ok({ ids: [] }); } });
  await api.putFavorites('tok', ['a.b.c']);
  assert.equal(seen.method, 'PUT');
  assert.equal(seen.headers.Authorization, 'Bearer tok');
  assert.equal(seen.headers['Content-Type'], 'application/json');
  assert.equal(seen.body, JSON.stringify({ ids: ['a.b.c'] }));
});

test('api: 오류 응답/네트워크 실패/타임아웃/비 JSON 을 ApiClientError 로 변환', async () => {
  const mk = (fetchImpl, timeoutMs) => createApi({ base: 'http://x', fetchImpl, timeoutMs });
  await assert.rejects(mk(async () => fail(404, 'NOT_FOUND', '없음')).entry('a.b.c'), (e) => e instanceof ApiClientError && e.code === 'NOT_FOUND' && e.status === 404 && e.message === '없음');
  await assert.rejects(mk(async () => { throw new TypeError('fetch failed'); }).manifest(), (e) => e.code === 'NETWORK');
  const hang = (u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  await assert.rejects(mk(hang, 20).manifest(), (e) => e.code === 'TIMEOUT');
  await assert.rejects(mk(async () => new Response('<html>502</html>', { status: 502 })).manifest(), (e) => e.code === 'HTTP_502');
  assert.throws(() => createApi({ base: '' }), /apiBase/);
});

test('cache: 손상된 값/저장 실패에도 예외를 던지지 않는다', () => {
  const s = memStorage();
  const c = createCache(s);
  assert.equal(c.get('none'), null);
  s.setItem('ieum.cd.bad', '{oops');
  assert.equal(c.get('bad'), null);
  assert.equal(c.set('k', { a: 1 }), true);
  assert.deepEqual(c.get('k'), { a: 1 });
  const full = createCache({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem() {} });
  assert.equal(full.set('k', 1), false);
});

test('data-loader: 캐시가 없으면 받아서 저장한다', async () => {
  const cache = createCache(memStorage());
  let calls = 0;
  const api = { index: async () => { calls += 1; return { data: sampleIndex('7') }; }, manifest: async () => ({ data: { dataVersion: '7' } }) };
  const r = await loadIndex({ api, cache });
  assert.equal(r.fromCache, false);
  assert.equal(cache.get('index').dataVersion, '7');
  assert.equal(calls, 1);
});

test('data-loader: 캐시가 있으면 즉시 반환하고 버전이 같으면 다시 받지 않는다', async () => {
  const cache = createCache(memStorage());
  cache.set('index', sampleIndex('7'));
  let indexCalls = 0;
  const api = { index: async () => { indexCalls += 1; return { data: sampleIndex('8') }; }, manifest: async () => ({ data: { dataVersion: '7' } }) };
  const r = await loadIndex({ api, cache, onFresh: () => assert.fail('호출되면 안 됨') });
  assert.equal(r.fromCache, true);
  await new Promise((res) => setTimeout(res, 10));
  assert.equal(indexCalls, 0);
});

test('data-loader: 데이터 버전이 바뀌면 백그라운드로 갱신하고 onFresh 호출', async () => {
  const cache = createCache(memStorage());
  cache.set('index', sampleIndex('7'));
  const api = { index: async () => ({ data: sampleIndex('8') }), manifest: async () => ({ data: { dataVersion: '8' } }) };
  const fresh = await new Promise((resolve) => { loadIndex({ api, cache, onFresh: resolve }); });
  assert.equal(fresh.dataVersion, '8');
  assert.equal(cache.get('index').dataVersion, '8');
});

test('data-loader: 서버가 죽어 있어도 캐시로 계속 동작, 호환되지 않는 스키마 캐시는 버림', async () => {
  const cache = createCache(memStorage());
  cache.set('index', sampleIndex('7'));
  const down = { index: async () => { throw new Error('down'); }, manifest: async () => { throw new Error('down'); } };
  assert.equal((await loadIndex({ api: down, cache })).fromCache, true);
  cache.set('index', sampleIndex('7', '2.0.0'));
  await assert.rejects(loadIndex({ api: down, cache }), /down/);
  const v2 = { index: async () => ({ data: sampleIndex('9', '2.0.0') }), manifest: async () => ({ data: {} }) };
  await assert.rejects(loadIndex({ api: v2, cache: createCache(memStorage()) }), /지원하지 않는 데이터 형식/);
});

test('entry-loader: 같은 id 의 동시 요청은 하나로 합쳐지고 결과는 캐시된다', async () => {
  let calls = 0;
  const api = { entry: async (id) => { calls += 1; await new Promise((r) => setTimeout(r, 5)); return { data: { id } }; } };
  const loader = createEntryLoader(api);
  const [a, b] = await Promise.all([loader.load('x.y.z'), loader.load('x.y.z')]);
  assert.equal(a, b);
  await loader.load('x.y.z');
  assert.equal(calls, 1);
  assert.deepEqual(loader.peek('x.y.z'), { id: 'x.y.z' });
  const failing = createEntryLoader({ entry: async () => { throw new Error('boom'); } });
  await assert.rejects(failing.load('a.b.c'), /boom/);
  assert.equal(failing.peek('a.b.c'), null);
});

test('navigation: 해시 파싱/생성 왕복, 잘못된 id 는 무시', () => {
  const route = { entryId: 'javascript.operator.strict-equality', q: '엄격한 비교', lang: 'javascript', type: 'operator', category: 'comparison', fav: true, mode: 'grammar' };
  const hash = buildHash(route);
  assert.deepEqual(parseHash(hash), route);
  assert.equal(buildHash({ entryId: null, q: '', lang: '', type: '', category: '', fav: false, mode: 'word' }), '#/');
  assert.equal(buildHash({ entryId: null, q: 'for (', lang: '', type: '', category: '', fav: false, mode: 'grammar' }), '#/?q=for+%28&m=g');
  assert.equal(parseHash('#/?m=g&q=def').mode, 'grammar');
  assert.equal(parseHash('#/?q=def').mode, 'word');
  assert.equal(parseHash('#/?m=x').mode, 'word');
  assert.equal(parseHash('#/entry/<script>').entryId, null);
  assert.equal(parseHash('#/entry/%E0%A4%A').entryId, null);
  assert.equal(parseHash('').q, '');
  assert.equal(parseHash('#/?q=' + 'a'.repeat(500)).q.length, 100);
});

test('navigation: replace 는 히스토리를 쌓지 않고 즉시 onChange, push 는 hashchange 로 전달', () => {
  const listeners = {};
  const win = {
    location: { hash: '' },
    history: { replaceState: (_s, _t, h) => { win.location.hash = h; } },
    addEventListener: (n, f) => { listeners[n] = f; },
  };
  const seen = [];
  const router = createRouter({ onChange: (r) => seen.push(r), win });
  router.go({ q: 'abc' }, { replace: true });
  assert.equal(win.location.hash, '#/?q=abc');
  assert.equal(seen.length, 1);
  router.go({ q: 'abc' }, { replace: true });
  assert.equal(seen.length, 1, '같은 해시는 중복 알림 없음');
  router.go({ q: 'abc', entryId: 'html.tag.div' });
  assert.equal(win.location.hash, '#/entry/html.tag.div?q=abc');
  listeners.hashchange();
  assert.equal(seen.at(-1).entryId, 'html.tag.div');
  assert.equal(router.current().q, 'abc');
});

test('state: 바뀐 키만 구독자에게 전달', () => {
  const store = createStore({ a: 1, b: 2 });
  const calls = [];
  store.subscribe((s, changed) => calls.push(changed));
  store.set({ a: 1 });
  store.set({ a: 2, b: 2 });
  store.set({ b: 3, a: 2 });
  assert.deepEqual(calls, [['a'], ['b']]);
  assert.deepEqual(store.get(), { a: 2, b: 3 });
});

test('search-engine(프론트 복사본): 인덱스만으로 동작한다', () => {
  const idx = sampleIndex();
  const engine = createSearchEngine(idx);
  assert.equal(engine.search('<div>').results[0].record.id, 'html.tag.div');
  assert.equal(engine.search('div', { lang: 'css' }).total, 0);
});


const synIndex = (dataVersion = '1', schemaVersion = '1.0.0') => ({ schemaVersion, dataVersion, records: [{ id: 'html.tag.div', x: '<div>CONTENT</div>', e: ['<div class="card">내용</div>'] }] });

test('data-loader(문법 인덱스): 같은 버전 캐시는 재사용, 버전이 다르면 새로 받는다', async () => {
  const cache = createCache(memStorage());
  let calls = 0;
  const api = { syntaxIndex: async () => { calls += 1; return { data: synIndex('2') }; } };
  assert.equal((await loadSyntaxIndex({ api, cache, expectVersion: '2' })).dataVersion, '2');
  assert.equal(calls, 1);
  await loadSyntaxIndex({ api, cache, expectVersion: '2' });
  assert.equal(calls, 1, '캐시 재사용');
  await loadSyntaxIndex({ api, cache, expectVersion: '3' });
  assert.equal(calls, 2, '버전이 다르면 다시 받음');
  const bad = { syntaxIndex: async () => ({ data: synIndex('9', '2.0.0') }) };
  await assert.rejects(loadSyntaxIndex({ api: bad, cache: createCache(memStorage()), expectVersion: '9' }), /지원하지 않는 데이터 형식/);
});

test('문법 검색(프론트 복사본): 공백 무시·강조 위치·필터', () => {
  const idx = sampleIndex();
  const engine = createSyntaxSearch({ records: idx.records, syntax: synIndex().records });
  const r = engine.search('<div class').results[0];
  assert.equal(r.record.id, 'html.tag.div');
  assert.equal(r.snippet.text.slice(r.snippet.start, r.snippet.end), '<div class');
  assert.equal(engine.search('< div >').results.length, 1);
  assert.equal(engine.search('div', { lang: 'css' }).total, 0);
  assert.equal(codePattern('  '), null);
  assert.doesNotThrow(() => engine.search('(((['));
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer, get, store } from './helpers.js';

// fetch(undici)는 If-None-Match 를 보내면 Cache-Control: no-cache 를 덧붙여 304 를 막는다 → 순수 http 로 검사
const rawGet = (url, headers = {}) => new Promise((resolve, reject) => {
  http.get(url, { headers }, (res) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers })); }).on('error', reject);
});

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

test('GET /health', async () => {
  const r = await get(srv.base, '/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
});

test('성공 응답 규격: success/data/error/meta', async () => {
  const r = await get(srv.base, '/api/v1/languages');
  assert.equal(r.status, 200);
  assert.equal(r.body.success, true);
  assert.equal(r.body.error, null);
  assert.equal(r.body.meta.version, '1.0.0');
  assert.equal(r.body.meta.dataVersion, store.dataVersion);
  assert.equal(r.headers.get('x-data-version'), store.dataVersion);
  assert.deepEqual(r.body.data.map((l) => l.id), ['html', 'css', 'javascript', 'typescript', 'python', 'c', 'java', 'go', 'rust', 'sql', 'common']);
  assert.match(r.headers.get('cache-control'), /max-age=300/);
});

test('오류 응답 규격 + 404', async () => {
  const r = await get(srv.base, '/api/v1/entries/javascript.keyword.nope');
  assert.equal(r.status, 404);
  assert.equal(r.body.success, false);
  assert.equal(r.body.data, null);
  assert.equal(r.body.error.code, 'NOT_FOUND');
  const r2 = await get(srv.base, '/api/v1/nothing-here');
  assert.equal(r2.status, 404);
  assert.equal(r2.body.error.code, 'NOT_FOUND');
});

test('GET /languages/:lang, 알 수 없는 언어는 404', async () => {
  const r = await get(srv.base, '/api/v1/languages/python?type=keyword');
  assert.equal(r.status, 200);
  assert.ok(r.body.data.entries.length > 0 && r.body.data.entries.every((e) => e.type === 'keyword'));
  assert.equal((await get(srv.base, '/api/v1/languages/cobol')).status, 404);
});

test('GET /entries/:id — related / conceptLinks 해석', async () => {
  const r = await get(srv.base, '/api/v1/entries/javascript.operator.strict-equality');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.syntax, 'A === B');
  assert.ok(r.body.data.relatedEntries.some((x) => x.id === 'javascript.operator.loose-equality'));
  const link = r.body.data.conceptLinks[0];
  assert.equal(link.concept.id, 'concept.comparison');
  assert.ok(link.implementations.python.some((x) => x.id === 'python.operator.equal'));
});

test('GET /search', async () => {
  const r = await get(srv.base, '/api/v1/search?q=function&limit=5');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.results.length, 5);
  assert.equal(r.body.data.results[0].id, 'javascript.keyword.function');
  const filtered = await get(srv.base, '/api/v1/search?q=for&lang=python,javascript&type=keyword');
  assert.ok(filtered.body.data.results.every((x) => x.entry.type === 'keyword' && ['python', 'javascript'].includes(x.entry.language)));
});

test('GET /search 입력 검증', async () => {
  for (const path of ['/api/v1/search', '/api/v1/search?q=' + 'a'.repeat(101), '/api/v1/search?q=x&limit=0', '/api/v1/search?q=x&limit=abc',
    '/api/v1/search?q=a&q=b', '/api/v1/search?q=x&lang=cobol']) {
    const r = await get(srv.base, path);
    assert.equal(r.status, 400, path);
    assert.equal(r.body.error.code, 'INVALID_QUERY', path);
  }
});

test('GET /search/index — compact 인덱스, 언어별 lazy loading', async () => {
  const all = await get(srv.base, '/api/v1/search/index');
  assert.equal(all.body.data.records.length, store.manifest.totalEntries);
  assert.ok(all.body.data.concepts.length >= 10);
  const rec = all.body.data.records[0];
  assert.deepEqual(Object.keys(rec).sort(), ['a', 'c', 'd', 'g', 'id', 'l', 'n', 's', 't', 'x']);
  const py = await get(srv.base, '/api/v1/search/index?lang=python');
  assert.ok(py.body.data.records.length > 0 && py.body.data.records.every((x) => x.l === 'python'));
  assert.equal((await get(srv.base, '/api/v1/search/index?lang=cobol')).status, 404);
});

test('ETag 로 304 응답', async () => {
  const first = await rawGet(srv.base + '/api/v1/search/index');
  const etag = first.headers.etag;
  assert.equal(first.status, 200);
  assert.ok(etag);
  const second = await rawGet(srv.base + '/api/v1/search/index', { 'If-None-Match': etag });
  assert.equal(second.status, 304);
  const stale = await rawGet(srv.base + '/api/v1/search/index', { 'If-None-Match': 'W/"other"' });
  assert.equal(stale.status, 200);
});

test('GET /tags/:lang/:name, /grammar/:lang/:name', async () => {
  assert.equal((await get(srv.base, '/api/v1/tags/html/div')).body.data.id, 'html.tag.div');
  assert.equal((await get(srv.base, '/api/v1/tags/html/h2')).body.data.id, 'html.tag.h1'); // alias
  assert.equal((await get(srv.base, '/api/v1/grammar/javascript/function')).body.data.id, 'javascript.grammar.function-declaration');
  const g = await get(srv.base, '/api/v1/grammar/python/function-definition');
  assert.equal(g.body.data.tree.node, 'FUNCTION_DEF');
  assert.equal((await get(srv.base, '/api/v1/tags/html/nope')).status, 404);
  assert.equal((await get(srv.base, '/api/v1/tags/rust/div')).status, 404);
});

test('GET /concepts', async () => {
  const list = await get(srv.base, '/api/v1/concepts');
  assert.ok(list.body.data.find((c) => c.id === 'concept.function').languages.includes('python'));
  const one = await get(srv.base, '/api/v1/concepts/function');
  assert.ok(one.body.data.implementations.javascript.length > 0);
  assert.equal((await get(srv.base, '/api/v1/concepts/nope')).status, 404);
});

test('데이터 버전 지정: 다른 버전은 409', async () => {
  const bad = await get(srv.base, '/api/v1/languages', { 'X-Data-Version': '1999.1.1' });
  assert.equal(bad.status, 409);
  assert.equal(bad.body.error.code, 'DATA_VERSION_UNAVAILABLE');
  assert.equal((await get(srv.base, '/api/v1/languages?dataVersion=' + store.dataVersion)).status, 200);
});

test('CORS: 허용된 출처(와일드카드 포함)만 허용', async () => {
  const allowed = await fetch(srv.base + '/api/v1/languages', { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const preview = await fetch(srv.base + '/api/v1/languages', { headers: { Origin: 'https://ieum-abc123.vercel.app' } });
  assert.equal(preview.headers.get('access-control-allow-origin'), 'https://ieum-abc123.vercel.app');
  const denied = await fetch(srv.base + '/api/v1/languages', { headers: { Origin: 'https://evil.example.com' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  const lookalike = await fetch(srv.base + '/api/v1/languages', { headers: { Origin: 'https://x.vercel.app.evil.com' } });
  assert.equal(lookalike.headers.get('access-control-allow-origin'), null);
  const preflight = await fetch(srv.base + '/api/v1/me/favorites', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/i);
});

test('인증 필요 API: 토큰 없음/잘못된 토큰 401', async () => {
  assert.equal((await get(srv.base, '/api/v1/me/favorites')).status, 401);
  const r = await get(srv.base, '/api/v1/me/favorites', { Authorization: 'Bearer nope' });
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, 'UNAUTHORIZED');
});

test('즐겨찾기 GET/PUT — 사용자별 분리, 입력 검증, 중복 제거', async () => {
  const auth = { Authorization: 'Bearer good-token', 'Content-Type': 'application/json' };
  assert.deepEqual((await get(srv.base, '/api/v1/me/favorites', auth)).body.data.ids, []);
  const put = await fetch(srv.base + '/api/v1/me/favorites', { method: 'PUT', headers: auth, body: JSON.stringify({ ids: ['html.tag.div', 'python.keyword.def', 'html.tag.div'] }) });
  assert.equal(put.status, 200);
  assert.deepEqual((await put.json()).data.ids, ['html.tag.div', 'python.keyword.def']);
  assert.deepEqual((await get(srv.base, '/api/v1/me/favorites', auth)).body.data.ids, ['html.tag.div', 'python.keyword.def']);
  assert.deepEqual((await get(srv.base, '/api/v1/me/favorites', { Authorization: 'Bearer other-token' })).body.data.ids, []);

  const bad = await fetch(srv.base + '/api/v1/me/favorites', { method: 'PUT', headers: auth, body: JSON.stringify({ ids: ['nope.entry.x'] }) });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'INVALID_BODY');
  const notJson = await fetch(srv.base + '/api/v1/me/favorites', { method: 'PUT', headers: auth, body: '{oops' });
  assert.equal(notJson.status, 400);
  assert.equal((await notJson.json()).error.code, 'INVALID_JSON');
  const tooBig = await fetch(srv.base + '/api/v1/me/favorites', { method: 'PUT', headers: auth, body: JSON.stringify({ ids: ['x'.repeat(40_000)] }) });
  assert.equal(tooBig.status, 413);
});

test('Firebase 미설정(verifyToken 없음)이면 인증 API 는 503, 지식 API 는 정상', async () => {
  const s = await startServer({ verifyToken: undefined });
  try {
    const r = await get(s.base, '/api/v1/me/favorites', { Authorization: 'Bearer good-token' });
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'AUTH_UNAVAILABLE');
    assert.equal((await get(s.base, '/api/v1/languages')).status, 200);
    assert.equal((await get(s.base, '/health')).body.auth, false);
  } finally { await s.close(); }
});

test('레이트 리밋: 한도를 넘으면 429 + 표준 오류 규격', async () => {
  const s = await startServer({ env: { rateLimitPerMinute: 3 } });
  try {
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await get(s.base, '/api/v1/languages')).status);
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
    const r = await get(s.base, '/api/v1/languages');
    assert.equal(r.body.error.code, 'RATE_LIMITED');
  } finally { await s.close(); }
});

test('검색 인덱스는 gzip 으로 압축되어 전송된다', async () => {
  const plain = await rawGet(srv.base + '/api/v1/search/index', { 'Accept-Encoding': 'identity' });
  assert.equal(plain.headers['content-encoding'], undefined);
  const gz = await rawGet(srv.base + '/api/v1/search/index', { 'Accept-Encoding': 'gzip' });
  assert.equal(gz.headers['content-encoding'], 'gzip');
});


test('GET /search?mode=syntax — 코드 모양 검색', async () => {
  const r = await get(srv.base, '/api/v1/search?q=' + encodeURIComponent('def ') + '&mode=syntax&limit=5');
  assert.equal(r.status, 200);
  assert.ok(r.body.data.results.some((x) => x.id === 'python.grammar.function-definition'));
  const hit = r.body.data.results.find((x) => x.id === 'python.grammar.function-definition');
  assert.ok(hit.snippet.text.includes('def') && hit.snippet.end > hit.snippet.start);
  const bad = await get(srv.base, '/api/v1/search?q=x&mode=nope');
  assert.equal(bad.status, 400);
  const onlyGrammar = await get(srv.base, '/api/v1/search?mode=syntax&type=grammar&limit=100');
  assert.ok(onlyGrammar.body.data.total >= 40);
});

test('GET /search/syntax-index — lazy 인덱스, 언어별', async () => {
  const all = await get(srv.base, '/api/v1/search/syntax-index');
  assert.equal(all.status, 200);
  assert.equal(all.body.data.records.length, store.manifest.totalEntries);
  assert.deepEqual(Object.keys(all.body.data.records[0]).sort(), ['e', 'id', 'x']);
  const go = await get(srv.base, '/api/v1/search/syntax-index?lang=go');
  assert.ok(go.body.data.records.length > 0 && go.body.data.records.every((x) => x.id.startsWith('go.')));
  assert.equal((await get(srv.base, '/api/v1/search/syntax-index?lang=cobol')).status, 404);
});

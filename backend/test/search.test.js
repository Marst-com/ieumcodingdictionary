import { test } from 'node:test';
import assert from 'node:assert/strict';
import { store } from './helpers.js';
import { createSearchEngine, normalize } from '../src/lib/search-engine.js';

const top = (q, opts) => store.search(q, opts).results.map((r) => r.id);

test('symbol 정확 일치가 1순위', () => {
  assert.equal(top('===')[0], 'javascript.operator.strict-equality');
  assert.equal(top('=>')[0], 'javascript.operator.arrow');
  assert.equal(top('<div>')[0], 'html.tag.div');
  assert.equal(top('?.')[0], 'javascript.operator.optional-chaining');
  assert.equal(top('//')[0], 'python.operator.floor-divide');
});

test('id 정확 일치가 최우선', () => {
  const r = store.search('python.keyword.def').results[0];
  assert.equal(r.id, 'python.keyword.def');
  assert.equal(r.score, 1000);
  assert.equal(r.why, 'id');
});

test('정확 일치(키워드는 symbol=name) > alias 일치 (function)', () => {
  const r = store.search('function').results;
  assert.equal(r[0].id, 'javascript.keyword.function');
  assert.equal(r[0].score, 900);
  assert.equal(r[0].why, 'symbol');
  // symbol 과 name 이 다른 항목은 name 이 더 높은 점수를 받는다
  assert.equal(store.search('div').results[0].why, 'name');
  assert.ok(r.some((x) => x.id === 'python.keyword.def' && x.why === 'alias'));
});

test('한글 검색: "함수" 로 여러 언어의 관련 문법이 나온다', () => {
  const ids = top('함수', { limit: 50 });
  for (const id of ['javascript.keyword.function', 'python.keyword.def', 'javascript.grammar.function-declaration', 'python.grammar.function-definition']) {
    assert.ok(ids.includes(id), `${id} 누락`);
  }
  const head = top('함수').slice(0, 6);
  for (const id of ['python.keyword.def', 'javascript.keyword.function', 'go.keyword.func', 'rust.keyword.fn']) assert.ok(head.includes(id), `${id} 가 상위 6개에 없음: ${head}`);
});

test('한글 alias 접두 일치: "엄격" → Strict Equality / Strict Inequality', () => {
  const ids = top('엄격');
  assert.ok(ids.slice(0, 2).includes('javascript.operator.strict-equality'));
  assert.ok(ids.includes('javascript.operator.strict-inequality'));
});

test('여러 단어: "try catch" → 각 언어의 try 항목이 모두 상위에 나온다', () => {
  const ids = top('try catch').slice(0, 8);
  for (const id of ['javascript.keyword.try', 'python.keyword.try', 'java.keyword.try']) assert.ok(ids.includes(id), `${id} 가 상위 8개에 없음: ${ids}`);
});

test('언어 + 타입 단어 조합: "javascript operator" → JS 연산자(타입 또는 카테고리)가 상위', () => {
  const ops = store.listLanguages().find((l) => l.id === 'javascript').types.operator;
  const res = store.search('javascript operator', { limit: 100 }).results.filter((r) => r.score === 300);
  assert.ok(res.every((r) => r.entry.language === 'javascript'));
  assert.equal(res.filter((r) => r.entry.type === 'operator').length, ops);
  assert.ok(res.some((r) => r.id === 'javascript.keyword.typeof'));   // typeof 는 카테고리가 operator
});

test('필터: lang/type 로 좁히고, 쿼리가 비어 있으면 필터만 적용', () => {
  const py = store.search('for', { lang: 'python' }).results;
  assert.ok(py.length > 0 && py.every((r) => r.entry.language === 'python'));
  const tags = store.search('', { lang: ['html'], type: 'tag', limit: 100 });
  assert.ok(tags.total > 31);
  assert.equal(tags.total, store.listLanguages().find((l) => l.id === 'html').types.tag);
  assert.ok(tags.results.every((r) => r.entry.type === 'tag'));
});

test('결과가 없으면 빈 배열, 대소문자/공백/유니코드 정규화', () => {
  assert.deepEqual(store.search('zzzzqqqq').results, []);
  assert.equal(top('  DIV  ')[0], 'html.tag.div');
  assert.equal(normalize('Ａ'.normalize('NFD')), 'ａ');
});

test('limit / offset 페이지네이션', () => {
  const all = top('a', { limit: 100 });
  assert.deepEqual(top('a', { limit: 5, offset: 5 }), all.slice(5, 10));
});

test('엔진은 인덱스만으로 독립 동작한다 (concept 없이도)', () => {
  const engine = createSearchEngine({ records: store.getIndex().records });
  assert.equal(engine.search('===').results[0].record.id, 'javascript.operator.strict-equality');
  assert.equal(engine.size, store.manifest.totalEntries);
});


// ---------------------------------------------------------------- 문법 검색
import { codePattern, createSyntaxSearch } from '../src/lib/search-engine.js';
const sx = (q, o) => store.searchSyntax(q, o);
const sxIds = (q, o) => sx(q, o).results.map((r) => r.id);

test('문법 검색: 공백 차이와 대소문자를 무시한다', () => {
  const a = sxIds('for(');  const b = sxIds('for (');  const c = sxIds('FOR (');
  assert.deepEqual(a.slice(0, 10), b.slice(0, 10));
  assert.deepEqual(b.slice(0, 10), c.slice(0, 10));
  assert.ok(sxIds('x=>x').length > 0 && sxIds('x => x').length > 0);
});

test('문법 검색: 코드 모양으로 각 언어의 문법 항목을 찾는다', () => {
  assert.ok(sxIds('def ').includes('python.grammar.function-definition'));
  assert.ok(sxIds('func ').includes('go.grammar.function-declaration'));
  assert.ok(sxIds('fn ').includes('rust.grammar.function-declaration'));
  assert.ok(sxIds('SELECT').includes('sql.grammar.select-statement'));
  assert.ok(sxIds('try {').includes('java.grammar.try-catch'));
  assert.ok(sxIds('match').includes('rust.grammar.match-expression'));
  assert.ok(sxIds('=>').includes('javascript.operator.arrow'));
  assert.ok(sxIds('interface').includes('typescript.grammar.interface-declaration'));
});

test('문법 검색: grammar 타입이 같은 점수대에서 앞선다', () => {
  const r = sx('for', { limit: 10 }).results;
  assert.ok(r[0].entry.type === 'grammar' || r[0].score >= 900, JSON.stringify(r[0]));
  const g = r.findIndex((x) => x.entry.type === 'grammar');
  assert.ok(g >= 0 && g < 5, 'grammar 항목이 상위에 없음');
});

test('문법 검색: snippet 이 일치 위치를 정확히 가리킨다', () => {
  const r = sx('catch (', { lang: 'java', type: 'grammar' }).results[0];
  assert.equal(r.id, 'java.grammar.try-catch');
  const { text, start, end } = r.snippet;
  assert.equal(text.slice(start, end).replace(/\s+/g, '').toLowerCase(), 'catch(');
  assert.ok(text.split('\n').length <= 6);
});

test('문법 검색: 필터와 빈 질의(문법 사전 목록)', () => {
  const all = sx('', { type: 'grammar', limit: 100 });
  assert.ok(all.total >= 40 && all.results.every((r) => r.entry.type === 'grammar'));
  assert.ok(all.results.every((r) => r.snippet.text.length > 0));
  const py = sx('', { type: 'grammar', lang: 'python', limit: 100 });
  assert.ok(py.total > 0 && py.results.every((r) => r.entry.language === 'python'));
});

test('문법 검색: 특수문자 질의도 안전하다 (정규식 주입 없음)', () => {
  for (const q of ['(', '[', '.*', '\\', '{', '$', '^', '?', '+', '|', '(((']) assert.doesNotThrow(() => sx(q));
  assert.equal(codePattern('   '), null);
  assert.deepEqual(sxIds('zzzzqqqq'), []);
  const long = 'a'.repeat(100);
  const t0 = Date.now(); sx(long); assert.ok(Date.now() - t0 < 500, '긴 질의가 느림');
});

test('문법 검색 엔진은 인덱스만으로 독립 동작한다', () => {
  const engine = createSyntaxSearch({ records: store.getIndex().records, syntax: store.getSyntaxIndex().records });
  assert.equal(engine.size, store.manifest.totalEntries);
  assert.ok(engine.search('def ').results.some((r) => r.record.id === 'python.grammar.function-definition'));
});

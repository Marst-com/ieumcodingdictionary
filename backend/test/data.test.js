import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateDataDir } from '../src/services/data-validator.js';
import { loadKnowledge } from '../src/services/knowledge.service.js';
import { dataDir, store } from './helpers.js';

test('실제 Knowledge 데이터는 검증을 통과한다', () => {
  const { errors, warnings } = validateDataDir(dataDir);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('확장 범위: 10개 언어 + 공통 기호, 항목 650개 이상, 개념 20개 이상', () => {
  const byLang = Object.fromEntries(store.listLanguages().map((l) => [l.id, l.count]));
  for (const id of ['html', 'css', 'javascript', 'python', 'typescript', 'c', 'java', 'go', 'rust', 'sql', 'common']) assert.ok(byLang[id] >= 19, `${id} 항목이 너무 적음: ${byLang[id]}`);
  assert.ok(store.manifest.totalEntries >= 650, `entries=${store.manifest.totalEntries}`);
  assert.ok(store.manifest.totalConcepts >= 20);
});

test('모든 개념에 둘 이상의 언어가 연결되거나(공통 개념) 연결 항목이 있다', () => {
  for (const c of store.listConcepts()) assert.ok(c.implementationCount >= 2, `${c.id}: 연결 항목 ${c.implementationCount}개`);
  const multi = store.listConcepts().filter((c) => c.languages.length >= 3).length;
  assert.ok(multi >= 14, `3개 이상 언어에 걸친 개념이 ${multi}개뿐`);
});

test('엔트리에 language/type/version 이 파일 헤더로부터 채워진다', () => {
  const e = store.getEntry('javascript.operator.strict-equality');
  assert.equal(e.language, 'javascript');
  assert.equal(e.type, 'operator');
  assert.equal(e.version, '1.0.0');
  assert.equal(e.symbol, '===');
});

function brokenCopy(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'ieum-data-'));
  cpSync(dataDir, dir, { recursive: true });
  mutate(dir);
  return dir;
}
const editJson = (dir, rel, fn) => {
  const p = join(dir, rel);
  const j = JSON.parse(readFileSync(p, 'utf8'));
  fn(j);
  writeFileSync(p, JSON.stringify(j));
};

test('검증기: 중복 id, 잘못된 related/concept, id 접두사 오류를 잡아낸다', () => {
  const dir = brokenCopy((d) => editJson(d, 'languages/html/tag.json', (j) => {
    j.entries[1].id = j.entries[0].id;                       // 중복
    j.entries[2].related = ['html.tag.nope'];                // 깨진 related
    j.entries[3].concepts = ['concept.nope'];                // 깨진 concept
    j.entries[4].id = 'css.tag.wrong-prefix';                // 접두사 오류
  }));
  try {
    const { errors } = validateDataDir(dir);
    const text = errors.join('\n');
    assert.match(text, /id 중복/);
    assert.match(text, /html\.tag\.nope/);
    assert.match(text, /concept\.nope/);
    assert.match(text, /로 시작해야 함/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('검증기: manifest 에 없는 JSON 파일과 grammar tree 누락을 잡아낸다', () => {
  const dir = brokenCopy((d) => {
    writeFileSync(join(d, 'languages/html/extra.json'), '{}');
    editJson(d, 'languages/python/grammar.json', (j) => { delete j.entries[0].tree; });
  });
  try {
    const text = validateDataDir(dir).errors.join('\n');
    assert.match(text, /등록되지 않은 JSON 파일: languages\/html\/extra\.json/);
    assert.match(text, /tree 필요/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('strict 로딩은 깨진 데이터에서 예외를 던진다', () => {
  const dir = brokenCopy((d) => editJson(d, 'languages/css/property.json', (j) => { j.entries[0].examples = []; }));
  try { assert.throws(() => loadKnowledge(dir), /검증 실패/); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('concept 연결: 함수 개념은 모든 프로그래밍 언어에 구현이 있다', () => {
  const c = store.getConcept('function');
  for (const l of ['javascript', 'python', 'typescript', 'c', 'java', 'go', 'rust']) assert.ok(c.implementations[l]?.length > 0, `${l} 누락`);
  assert.equal(store.getConcept('concept.function').id, c.id);
  const e = store.getEntry('python.keyword.def');
  const link = e.conceptLinks.find((l) => l.concept.id === 'concept.function');
  assert.ok(link.implementations.javascript.some((x) => x.id === 'javascript.keyword.function'));
  assert.ok(!Object.values(link.implementations).flat().some((x) => x.id === 'python.keyword.def'), '자기 자신은 제외');
});

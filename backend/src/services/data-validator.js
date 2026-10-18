// Coding Knowledge JSON 검증기. 서버 시작 시, `npm run validate`, 테스트에서 공통으로 쓴다.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ID_RE = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const CONCEPT_ID_RE = /^concept\.[a-z0-9-]+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const NODE_RE = /^[A-Z][A-Z0-9_]*$/;

const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isStrArray = (v) => Array.isArray(v) && v.every((x) => isStr(x));

function listJson(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listJson(full, base, out);
    else if (name.endsWith('.json')) out.push(relative(base, full).split(sep).join('/'));
  }
  return out;
}

function readJson(path, errors, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`${label}: JSON을 읽을 수 없음 (${e.message})`);
    return null;
  }
}

/** 디스크에서 원본 JSON을 읽는다. 읽기 실패는 errors에 모은다. */
export function readRawKnowledge(dataDir) {
  const errors = [];
  const manifestPath = join(dataDir, 'manifest.json');
  if (!existsSync(manifestPath)) return { errors: [`manifest.json 없음: ${manifestPath}`], manifest: null, files: [], conceptsDoc: null, onDisk: [] };
  const manifest = readJson(manifestPath, errors, 'manifest.json');
  const files = [];
  for (const rel of manifest?.files || []) {
    const p = join(dataDir, rel);
    if (!existsSync(p)) { errors.push(`manifest.files: 파일 없음 → ${rel}`); continue; }
    const json = readJson(p, errors, rel);
    if (json) files.push({ path: rel, json });
  }
  let conceptsDoc = null;
  if (manifest?.conceptsFile) {
    const p = join(dataDir, manifest.conceptsFile);
    if (existsSync(p)) conceptsDoc = readJson(p, errors, manifest.conceptsFile);
    else errors.push(`conceptsFile 없음 → ${manifest.conceptsFile}`);
  }
  return { errors, manifest, files, conceptsDoc, onDisk: listJson(dataDir) };
}

/** 원본 구조를 검증한다. { errors: string[], warnings: string[] } */
export function validateRaw(raw) {
  const errors = [...raw.errors];
  const warnings = [];
  const { manifest, files, conceptsDoc, onDisk } = raw;
  if (!manifest) return { errors, warnings };

  // manifest
  if (!SEMVER_RE.test(manifest.schemaVersion || '')) errors.push('manifest.schemaVersion은 x.y.z 형식이어야 함');
  if (!isStr(manifest.dataVersion)) errors.push('manifest.dataVersion 필요');
  const langIds = new Set();
  if (!Array.isArray(manifest.languages) || manifest.languages.length === 0) errors.push('manifest.languages 필요');
  for (const l of manifest.languages || []) {
    if (!isStr(l.id) || !isStr(l.name)) errors.push(`manifest.languages: id/name 누락 ${JSON.stringify(l)}`);
    else if (langIds.has(l.id)) errors.push(`manifest.languages: 중복 id ${l.id}`);
    else langIds.add(l.id);
  }
  const listed = new Set([...(manifest.files || []), manifest.conceptsFile, 'manifest.json']);
  for (const rel of onDisk) if (!listed.has(rel)) errors.push(`manifest에 등록되지 않은 JSON 파일: ${rel}`);

  // concepts
  const conceptIds = new Set();
  for (const c of conceptsDoc?.concepts || []) {
    if (!CONCEPT_ID_RE.test(c.id || '')) errors.push(`concept id 형식 오류: ${c.id}`);
    else if (conceptIds.has(c.id)) errors.push(`concept id 중복: ${c.id}`);
    else conceptIds.add(c.id);
    if (!isStr(c.name)) errors.push(`${c.id}: name 필요`);
    if (!isStrArray(c.aliases)) errors.push(`${c.id}: aliases는 문자열 배열이어야 함`);
    if (!isStr(c.description)) errors.push(`${c.id}: description 필요`);
  }

  // entries
  const ids = new Set();
  const all = [];
  for (const { path, json } of files) {
    const { language, type } = json;
    if (!langIds.has(language)) errors.push(`${path}: manifest에 없는 language "${language}"`);
    if (!isStr(type)) errors.push(`${path}: type 필요`);
    if (!SEMVER_RE.test(json.entryVersion || '')) errors.push(`${path}: entryVersion은 x.y.z 형식이어야 함`);
    if (!SEMVER_RE.test(json.schemaVersion || '')) errors.push(`${path}: schemaVersion은 x.y.z 형식이어야 함`);
    if (!Array.isArray(json.entries)) { errors.push(`${path}: entries 배열 필요`); continue; }
    for (const e of json.entries) {
      const where = `${path} › ${e.id ?? '(id 없음)'}`;
      all.push({ e, where, language, type, path });
      if (!ID_RE.test(e.id || '')) { errors.push(`${where}: id 형식 오류 (소문자/숫자/하이픈, 점으로 구분)`); continue; }
      if (!String(e.id).startsWith(`${language}.${type}.`)) errors.push(`${where}: id는 "${language}.${type}."로 시작해야 함`);
      if (ids.has(e.id)) errors.push(`${where}: id 중복`);
      ids.add(e.id);
      for (const k of ['symbol', 'name', 'category', 'description', 'syntax']) if (!isStr(e[k])) errors.push(`${where}: ${k} 필요`);
      if (!isStrArray(e.aliases)) errors.push(`${where}: aliases는 문자열 배열`);
      if (!isStrArray(e.examples) || e.examples.length === 0) errors.push(`${where}: examples는 비어 있지 않은 문자열 배열`);
      if (!isStrArray(e.related)) errors.push(`${where}: related는 문자열 배열`);
      if (!isStrArray(e.concepts)) errors.push(`${where}: concepts는 문자열 배열`);
      if (e.version !== undefined && !SEMVER_RE.test(e.version)) errors.push(`${where}: version 형식 오류`);
      if (e.roles !== undefined && !isStrArray(e.roles)) errors.push(`${where}: roles는 문자열 배열`);
      if (e.appliesTo !== undefined && (!isStrArray(e.appliesTo) || e.appliesTo.length === 0)) errors.push(`${where}: appliesTo는 비어 있지 않은 문자열 배열 (전체 적용은 ["*"])`);
      if (e.contexts !== undefined) {
        if (typeof e.contexts !== 'object' || e.contexts === null || Array.isArray(e.contexts)) errors.push(`${where}: contexts는 객체`);
        else for (const [k, v] of Object.entries(e.contexts)) {
          if (!langIds.has(k) || k === 'common') errors.push(`${where}: contexts 키 "${k}"는 manifest의 언어가 아님`);
          if (!isStr(v)) errors.push(`${where}: contexts.${k} 설명 필요`);
        }
      }
      if (type === 'grammar') validateTree(e.tree, where, errors);
      else if (e.tree !== undefined) warnings.push(`${where}: grammar가 아닌데 tree가 있음`);
    }
  }
  for (const { e, where } of all) {
    for (const r of e.related || []) if (!ids.has(r)) errors.push(`${where}: related가 존재하지 않는 id를 가리킴 → ${r}`);
    for (const c of e.concepts || []) if (!conceptIds.has(c)) errors.push(`${where}: 존재하지 않는 concept → ${c}`);
  }
  const used = new Set(all.flatMap(({ e }) => e.concepts || []));
  for (const c of conceptIds) if (!used.has(c)) warnings.push(`concept "${c}"에 연결된 항목이 없음`);
  return { errors, warnings };
}

function validateTree(tree, where, errors, path = 'tree') {
  if (!tree || typeof tree !== 'object') { errors.push(`${where}: ${path} 필요 (grammar 항목)`); return; }
  if (!NODE_RE.test(tree.node || '')) errors.push(`${where}: ${path}.node는 UPPER_SNAKE_CASE`);
  if (tree.text !== undefined && typeof tree.text !== 'string') errors.push(`${where}: ${path}.text는 문자열`);
  if (tree.children !== undefined) {
    if (!Array.isArray(tree.children) || tree.children.length === 0) errors.push(`${where}: ${path}.children은 비어 있지 않은 배열`);
    else tree.children.forEach((c, i) => validateTree(c, where, errors, `${path}.children[${i}]`));
  }
  if (tree.text === undefined && tree.children === undefined) errors.push(`${where}: ${path}는 text 또는 children이 필요`);
}

export function validateDataDir(dataDir) {
  return validateRaw(readRawKnowledge(dataDir));
}

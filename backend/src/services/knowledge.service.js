// JSON(원본) → 메모리 상의 읽기 전용 Knowledge Store.
// 서버 시작 시 한 번 로드하고, 요청마다 디스크를 읽지 않는다.
import { readRawKnowledge, validateRaw } from './data-validator.js';
import { createSearchEngine, createSyntaxSearch, normalize } from '../lib/search-engine.js';

const summary = (e) => ({
  id: e.id, language: e.language, type: e.type, symbol: e.symbol, name: e.name,
  category: e.category, description: e.description, syntax: e.syntax,
});
const slugOf = (id) => id.split('.').slice(2).join('.');

export function loadKnowledge(dataDir, { strict = true } = {}) {
  const raw = readRawKnowledge(dataDir);
  const { errors, warnings } = validateRaw(raw);
  if (strict && errors.length) {
    const err = new Error(`Coding Knowledge 데이터 검증 실패 (${errors.length}건)\n - ${errors.join('\n - ')}`);
    err.validationErrors = errors;
    throw err;
  }
  return buildStore(raw, warnings);
}

function buildStore(raw, warnings = []) {
  const { manifest, files, conceptsDoc } = raw;
  const entries = [];
  const byId = new Map();
  for (const { json } of files) {
    for (const e of json.entries) {
      const full = {
        ...e,
        language: json.language,
        type: json.type,
        version: e.version ?? json.entryVersion,
        schemaVersion: json.schemaVersion,
      };
      entries.push(full);
      byId.set(full.id, full);
    }
  }

  const concepts = (conceptsDoc?.concepts || []).map((c) => ({ ...c }));
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const implementations = new Map(concepts.map((c) => [c.id, {}]));
  for (const e of entries) {
    for (const cid of e.concepts || []) {
      const impl = implementations.get(cid);
      (impl[e.language] ||= []).push(e.id);
    }
  }

  const langMeta = new Map(manifest.languages.map((l) => [l.id, l]));
  const languages = manifest.languages.map((l) => {
    const own = entries.filter((e) => e.language === l.id);
    const types = {};
    const categories = {};
    for (const e of own) {
      types[e.type] = (types[e.type] || 0) + 1;
      categories[e.category] = (categories[e.category] || 0) + 1;
    }
    return { ...l, count: own.length, types, categories };
  });

  const records = entries.map((e) => ({
    id: e.id, s: e.symbol, n: e.name, a: e.aliases, c: e.concepts, l: e.language,
    t: e.type, g: e.category, d: e.description, x: e.syntax,
  }));
  const indexConcepts = concepts.map((c) => ({ id: c.id, name: c.name, aliases: c.aliases }));
  const langForSearch = manifest.languages.map((l) => ({ id: l.id, name: l.name, nativeName: l.nativeName }));
  const engine = createSearchEngine({ records, concepts: indexConcepts, languages: langForSearch });
  const syntaxRecords = entries.map((e) => ({ id: e.id, x: e.syntax, e: e.examples }));
  const syntaxEngine = createSyntaxSearch({ records, syntax: syntaxRecords });

  const meta = { schemaVersion: manifest.schemaVersion, dataVersion: manifest.dataVersion };
  const toSummary = (id) => { const e = byId.get(id); return e ? summary(e) : null; };

  /** type 안에서 slug / name / alias / slug 접두사 순으로 항목 하나를 찾는다 */
  function resolve(language, type, rawName) {
    const q = normalize(rawName).replace(/\s+/g, '-');
    const pool = entries.filter((e) => e.language === language && e.type === type);
    return (
      pool.find((e) => slugOf(e.id) === q) ||
      pool.find((e) => normalize(e.name).replace(/\s+/g, '-') === q) ||
      pool.find((e) => e.aliases.some((a) => normalize(a).replace(/\s+/g, '-') === q)) ||
      pool.find((e) => normalize(e.symbol).replace(/[<>]/g, '') === q) ||
      pool.find((e) => slugOf(e.id).startsWith(`${q}-`)) ||
      null
    );
  }

  return {
    ...meta,
    warnings,
    manifest: { ...meta, languages: manifest.languages, totalEntries: entries.length, totalConcepts: concepts.length },
    hasLanguage: (id) => langMeta.has(id),
    hasEntry: (id) => byId.has(id),
    listLanguages: () => languages,
    getLanguage(id, { type, category } = {}) {
      const lang = languages.find((l) => l.id === id);
      if (!lang) return null;
      const list = entries.filter((e) => e.language === id && (!type || e.type === type) && (!category || e.category === category));
      return { ...lang, entries: list.map(summary) };
    },
    getEntry(id) {
      const e = byId.get(id);
      if (!e) return null;
      const conceptLinks = (e.concepts || []).map((cid) => {
        const c = conceptById.get(cid);
        const impl = {};
        for (const [lang, ids] of Object.entries(implementations.get(cid) || {})) {
          const others = ids.filter((x) => x !== id).map(toSummary);
          if (others.length) impl[lang] = others;
        }
        return { concept: { id: c.id, name: c.name, aliases: c.aliases, description: c.description }, implementations: impl };
      });
      return { ...e, relatedEntries: (e.related || []).map(toSummary).filter(Boolean), conceptLinks };
    },
    findByName: (language, type, name) => { const e = resolve(language, type, name); return e ? e.id : null; },
    listConcepts: () => concepts.map((c) => ({
      ...c, implementationCount: Object.values(implementations.get(c.id)).reduce((n, a) => n + a.length, 0),
      languages: Object.keys(implementations.get(c.id)),
    })),
    getConcept(rawId) {
      const id = rawId.startsWith('concept.') ? rawId : `concept.${rawId}`;
      const c = conceptById.get(id);
      if (!c) return null;
      const impl = {};
      for (const [lang, ids] of Object.entries(implementations.get(id))) impl[lang] = ids.map(toSummary);
      return { ...c, implementations: impl };
    },
    search(query, options) {
      const out = engine.search(query, options);
      return {
        query: out.query, total: out.total,
        results: out.results.map(({ record, score, why }) => ({ id: record.id, score, why, entry: summary(byId.get(record.id)) })),
      };
    },
    /** 문법(코드 모양) 검색 */
    searchSyntax(query, options) {
      const out = syntaxEngine.search(query, options);
      return {
        query: out.query, total: out.total,
        results: out.results.map(({ record, score, snippet }) => ({ id: record.id, score, snippet, entry: summary(byId.get(record.id)) })),
      };
    },
    /** 문법 검색용 인덱스 (syntax + 예제). 문법 모드를 처음 쓸 때만 내려받는다 */
    getSyntaxIndex(langs) {
      const set = langs ? new Set(langs) : null;
      return { ...meta, records: syntaxRecords.filter((r) => !set || set.has(byId.get(r.id).language)) };
    },
    /** 프론트가 로컬 검색에 쓰는 compact 인덱스 */
    getIndex(langs) {
      const set = langs ? new Set(langs) : null;
      return {
        ...meta,
        languages: langForSearch.filter((l) => !set || set.has(l.id)),
        concepts: indexConcepts,
        records: set ? records.filter((r) => set.has(r.l)) : records,
      };
    },
  };
}

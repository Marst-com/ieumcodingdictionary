// 이 파일은 backend/src/lib/search-engine.js 와 frontend/src/core/search-engine.js 에 같은 내용으로 들어 있습니다. 고칠 때는 두 파일을 함께 수정하세요.
/**
 * IEUM CodingDictionary — Search Engine (pure ES module)
 *
 * DOM, Node, Firebase 어디에도 의존하지 않는다. 브라우저(frontend)와 Node(backend)에서
 * 똑같이 동작하며, 다른 IEUM 서비스(Marst Editor 등)도 그대로 import 해서 쓸 수 있다.
 *
 * 인덱스 레코드(compact):
 *   { id, s: symbol, n: name, a: aliases[], c: conceptIds[], l: language, t: type,
 *     g: category, d: description, x: syntax }
 * 개념(concept):  { id, name, aliases[] }
 * 언어(language): { id, name, nativeName }
 *
 * 점수 우선순위 (높을수록 먼저):
 *   1000 id 정확 일치        900 symbol 정확 일치     800 name 정확 일치
 *    700 alias 정확 일치     600 name/symbol/alias 접두 일치
 *    500 concept 정확 일치   450 concept 접두 일치
 *    400 name 부분 일치      350 alias 부분 일치
 *    300 언어/타입/카테고리 일치
 *    200 syntax 부분 일치    100 description 부분 일치
 */

export const SCORE = Object.freeze({
  ID: 1000, SYMBOL: 900, NAME: 800, ALIAS: 700, PREFIX: 600,
  CONCEPT: 500, CONCEPT_PREFIX: 450, NAME_CONTAINS: 400, ALIAS_CONTAINS: 350,
  FACET: 300, SYNTAX: 200, DESCRIPTION: 100,
});

export function normalize(value) {
  return String(value ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function toArray(v) {
  if (v == null || v === '') return null;
  return Array.isArray(v) ? (v.length ? v : null) : [v];
}

/**
 * @param {{records: object[], concepts?: object[], languages?: object[]}} index
 */
export function createSearchEngine({ records = [], concepts = [], languages = [] } = {}) {
  // concept id -> normalized terms (id, name, aliases)
  const conceptTerms = new Map();
  for (const c of concepts) {
    const terms = new Set([normalize(c.id), normalize(c.id.replace(/^concept\./, '')), normalize(c.name)]);
    for (const a of c.aliases || []) terms.add(normalize(a));
    terms.delete('');
    conceptTerms.set(c.id, [...terms]);
  }
  // language id -> normalized names
  const langTerms = new Map();
  for (const l of languages) {
    langTerms.set(l.id, [...new Set([normalize(l.id), normalize(l.name), normalize(l.nativeName)])].filter(Boolean));
  }

  const docs = records.map((r) => {
    const terms = [];
    for (const cid of r.c || []) terms.push(...(conceptTerms.get(cid) || []));
    return {
      r,
      id: normalize(r.id),
      sym: normalize(r.s),
      name: normalize(r.n),
      aliases: (r.a || []).map(normalize).filter(Boolean),
      concepts: terms,
      facets: [...(langTerms.get(r.l) || [normalize(r.l)]), normalize(r.t), normalize(r.g)].filter(Boolean),
      syntax: normalize(r.x),
      desc: normalize(r.d),
    };
  });

  /** 토큰 하나를 문서 하나에 대해 채점한다. [score, why] */
  function scoreText(q, d) {
    if (q === d.id) return [SCORE.ID, 'id'];
    if (q === d.sym) return [SCORE.SYMBOL, 'symbol'];
    if (q === d.name) return [SCORE.NAME, 'name'];
    if (d.aliases.includes(q)) return [SCORE.ALIAS, 'alias'];
    if (d.name.startsWith(q) || d.sym.startsWith(q) || d.aliases.some((a) => a.startsWith(q))) {
      return [SCORE.PREFIX, 'prefix'];
    }
    if (d.concepts.includes(q)) return [SCORE.CONCEPT, 'concept'];
    if (q.length >= 2 && d.concepts.some((t) => t.startsWith(q))) return [SCORE.CONCEPT_PREFIX, 'concept'];
    if (q.length >= 2) {
      if (d.name.includes(q)) return [SCORE.NAME_CONTAINS, 'name'];
      if (d.aliases.some((a) => a.includes(q))) return [SCORE.ALIAS_CONTAINS, 'alias'];
    }
    if (d.facets.includes(q)) return [SCORE.FACET, 'facet'];
    if (q.length >= 2) {
      if (d.syntax.includes(q)) return [SCORE.SYNTAX, 'syntax'];
      if (d.desc.includes(q)) return [SCORE.DESCRIPTION, 'description'];
    }
    return [0, null];
  }

  function scoreDoc(whole, tokens, d) {
    let [best, why] = scoreText(whole, d);
    if (tokens.length > 1) {
      let sum = 0;
      let weakest = [Infinity, null];
      for (const t of tokens) {
        const s = scoreText(t, d);
        if (s[0] === 0) { sum = 0; weakest = [0, null]; break; } // 모든 토큰이 어딘가에 있어야 한다(AND)
        sum += s[0];
        if (s[0] < weakest[0]) weakest = s;
      }
      const combined = Math.floor(sum / tokens.length);
      if (combined > best) { best = combined; why = weakest[1]; }
    }
    return [best, why];
  }

  function matchesFilter(r, f) {
    return (!f.lang || f.lang.includes(r.l)) && (!f.type || f.type.includes(r.t)) && (!f.category || f.category.includes(r.g));
  }

  /**
   * @param {string} query
   * @param {{lang?: string|string[], type?: string|string[], category?: string|string[], limit?: number, offset?: number, ids?: string[]}} [options]
   * @returns {{query: string, total: number, results: {record: object, score: number, why: string|null}[]}}
   */
  function search(query, options = {}) {
    const q = normalize(query);
    const filter = { lang: toArray(options.lang), type: toArray(options.type), category: toArray(options.category) };
    const idSet = options.ids ? new Set(options.ids) : null;
    const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 50;
    const offset = Number.isInteger(options.offset) && options.offset > 0 ? options.offset : 0;
    const tokens = q ? q.split(' ') : [];

    const hits = [];
    for (const d of docs) {
      if (!matchesFilter(d.r, filter)) continue;
      if (idSet && !idSet.has(d.r.id)) continue;
      if (!q) { hits.push({ record: d.r, score: 0, why: null }); continue; }
      const [score, why] = scoreDoc(q, tokens, d);
      if (score > 0) hits.push({ record: d.r, score, why });
    }
    hits.sort((a, b) =>
      b.score - a.score ||
      a.record.n.length - b.record.n.length ||
      (a.record.n < b.record.n ? -1 : a.record.n > b.record.n ? 1 : 0) ||
      (a.record.id < b.record.id ? -1 : 1));
    return { query: q, total: hits.length, results: hits.slice(offset, offset + limit) };
  }

  /** 필터에 걸리는 항목 수 (사이드바 카운트용) */
  function count(options = {}) {
    const filter = { lang: toArray(options.lang), type: toArray(options.type), category: toArray(options.category) };
    let n = 0;
    for (const d of docs) if (matchesFilter(d.r, filter)) n += 1;
    return n;
  }

  return { search, count, size: docs.length };
}

/* ------------------------------------------------------------------------------------------------
 * 문법(코드 형태) 검색
 *
 * 단어 검색이 "이름·기호·별칭"을 찾는다면, 문법 검색은 syntax 와 예제 코드의 "글자 모양"을 찾는다.
 *   - 공백 차이를 무시한다:  "for(" == "for (" ,  "x=>x" == "x => x"
 *   - 대소문자를 무시한다.
 *   - 일치한 줄과 그 위치(snippet)를 돌려줘서 화면에서 강조할 수 있다.
 * 문법 레코드(syntax): { id, x: syntax 문자열, e: 예제 문자열[] }
 * 점수:  syntax 안에서 일치 900(앞쪽일수록 높음) / 예제 안에서 일치 700 / grammar 타입 +80
 * ---------------------------------------------------------------------------------------------- */
const SNIPPET_LINES = 6;

function escapeChar(c) { return c.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&'); }

/** 질의를 "글자 사이에 공백이 있어도 되는" 정규식으로 바꾼다. 질의가 비어 있으면 null */
export function codePattern(query) {
  const chars = [...String(query ?? '').normalize('NFC').replace(/\s+/g, '')];
  if (!chars.length) return null;
  return new RegExp(chars.map(escapeChar).join('\\s*'), 'i');
}

/** text 에서 match 가 있는 줄 근처의 SNIPPET_LINES 줄을 잘라 { text, start, end } 로 돌려준다 */
function windowSnippet(text, match) {
  const lines = text.split('\n');
  let offset = 0;
  let hitLine = 0;
  const starts = lines.map((l) => { const s = offset; offset += l.length + 1; return s; });
  for (let i = 0; i < lines.length; i += 1) if (match.index >= starts[i]) hitLine = i;
  const first = Math.max(0, Math.min(hitLine - 1, lines.length - SNIPPET_LINES));
  const shown = lines.slice(first, first + SNIPPET_LINES);
  const base = starts[first];
  const out = shown.join('\n');
  const start = match.index - base;
  return { text: out, start, end: Math.min(out.length, start + match[0].length), truncatedTop: first > 0, truncatedBottom: first + SNIPPET_LINES < lines.length };
}

function firstLines(text) {
  const lines = text.split('\n');
  return { text: lines.slice(0, SNIPPET_LINES).join('\n'), start: 0, end: 0, truncatedTop: false, truncatedBottom: lines.length > SNIPPET_LINES };
}

/**
 * @param {{records: object[], syntax: {id: string, x: string, e: string[]}[]}} input  records 는 단어 인덱스(메타 정보용)
 */
export function createSyntaxSearch({ records = [], syntax = [] } = {}) {
  const meta = new Map(records.map((r) => [r.id, r]));
  const docs = syntax.filter((s) => meta.has(s.id)).map((s) => ({ r: meta.get(s.id), x: s.x || '', e: s.e || [] }));

  function search(query, options = {}) {
    const re = codePattern(query);
    const lang = toArray(options.lang); const type = toArray(options.type); const category = toArray(options.category);
    const idSet = options.ids ? new Set(options.ids) : null;
    const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 50;
    const offset = Number.isInteger(options.offset) && options.offset > 0 ? options.offset : 0;

    const hits = [];
    for (const d of docs) {
      const r = d.r;
      if (lang && !lang.includes(r.l)) continue;
      if (type && !type.includes(r.t)) continue;
      if (category && !category.includes(r.g)) continue;
      if (idSet && !idSet.has(r.id)) continue;
      const bonus = r.t === 'grammar' ? 80 : 0;
      if (!re) {
        const sample = d.e[0] ?? d.x;
        hits.push({ record: r, score: bonus, snippet: { ...firstLines(sample), source: 'example' } });
        continue;
      }
      let best = null;
      const mx = re.exec(d.x);
      if (mx) best = { score: 900 - Math.min(mx.index, 60) + (mx.index === 0 ? 40 : 0) + bonus, snippet: { ...windowSnippet(d.x, mx), source: 'syntax' } };
      for (const ex of d.e) {
        const me = re.exec(ex);
        if (!me) continue;
        const score = 700 - Math.min(me.index, 60) + bonus;
        if (!best || score > best.score) best = { score, snippet: { ...windowSnippet(ex, me), source: 'example' } };
      }
      if (best) hits.push({ record: r, score: best.score, snippet: best.snippet });
    }
    hits.sort((a, b) => b.score - a.score || a.record.n.length - b.record.n.length || (a.record.id < b.record.id ? -1 : 1));
    return { query: String(query ?? '').trim(), total: hits.length, results: hits.slice(offset, offset + limit) };
  }

  return { search, size: docs.length };
}

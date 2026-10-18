// 읽기 전용 Coding Knowledge API  (/api/v1)
import { Router } from 'express';
import { sendOk, notFound, badRequest, intParam, listParam } from '../lib/http.js';
import { cacheable } from '../middleware/data-version.js';

const MAX_QUERY_LENGTH = 100;

export function knowledgeRoutes(store) {
  const r = Router();
  r.use(cacheable(300));

  r.get('/manifest', (req, res) => sendOk(res, store.manifest));

  r.get('/languages', (req, res) => sendOk(res, store.listLanguages()));

  r.get('/languages/:lang', (req, res) => {
    const { type, category } = req.query;
    if ((type !== undefined && typeof type !== 'string') || (category !== undefined && typeof category !== 'string')) {
      throw badRequest('type/category는 문자열이어야 합니다');
    }
    const lang = store.getLanguage(req.params.lang, { type, category });
    if (!lang) throw notFound(`Language not found: ${req.params.lang}`);
    sendOk(res, lang);
  });

  r.get('/entries/:id', (req, res) => {
    const entry = store.getEntry(req.params.id);
    if (!entry) throw notFound(`Entry not found: ${req.params.id}`);
    sendOk(res, entry);
  });

  // GET /search?q=function&lang=javascript,python&type=keyword&category=declaration&limit=20&offset=0
  r.get('/search', (req, res) => {
    const q = req.query.q === undefined ? '' : req.query.q;
    if (typeof q !== 'string') throw badRequest('q는 문자열이어야 합니다');
    if (q.length > MAX_QUERY_LENGTH) throw badRequest(`q는 ${MAX_QUERY_LENGTH}자 이하여야 합니다`);
    const lang = listParam(req.query.lang, 'lang');
    const type = listParam(req.query.type, 'type');
    const category = listParam(req.query.category, 'category');
    if (!q.trim() && !lang && !type && !category) throw badRequest('검색어(q) 또는 필터(lang/type/category)가 필요합니다');
    for (const l of lang || []) if (!store.hasLanguage(l)) throw badRequest(`알 수 없는 언어: ${l}`);
    const limit = intParam(req.query.limit, { name: 'limit', min: 1, max: 100, fallback: 30 });
    const offset = intParam(req.query.offset, { name: 'offset', min: 0, max: 100000, fallback: 0 });
    const mode = req.query.mode === undefined ? 'word' : req.query.mode;
    if (mode !== 'word' && mode !== 'syntax') throw badRequest('mode는 word 또는 syntax여야 합니다');
    sendOk(res, mode === 'syntax' ? store.searchSyntax(q, { lang, type, category, limit, offset }) : store.search(q, { lang, type, category, limit, offset }));
  });

  // 프론트가 로컬 검색에 쓰는 compact 인덱스. ?lang=html,css 로 언어별 lazy loading 가능
  r.get('/search/index', (req, res) => {
    const lang = listParam(req.query.lang, 'lang');
    for (const l of lang || []) if (!store.hasLanguage(l)) throw notFound(`Language not found: ${l}`);
    sendOk(res, store.getIndex(lang));
  });

  // 문법 검색용 인덱스 (syntax + 예제). 문법 모드를 쓸 때 lazy 로 내려받는다
  r.get('/search/syntax-index', (req, res) => {
    const lang = listParam(req.query.lang, 'lang');
    for (const l of lang || []) if (!store.hasLanguage(l)) throw notFound(`Language not found: ${l}`);
    sendOk(res, store.getSyntaxIndex(lang));
  });

  r.get('/concepts', (req, res) => sendOk(res, store.listConcepts()));

  r.get('/concepts/:id', (req, res) => {
    const concept = store.getConcept(req.params.id);
    if (!concept) throw notFound(`Concept not found: ${req.params.id}`);
    sendOk(res, concept);
  });

  const byName = (type) => (req, res) => {
    const { lang, name } = req.params;
    if (!store.hasLanguage(lang)) throw notFound(`Language not found: ${lang}`);
    const id = store.findByName(lang, type, name);
    if (!id) throw notFound(`${type} not found: ${lang}/${name}`);
    sendOk(res, store.getEntry(id));
  };
  r.get('/tags/:lang/:name', byName('tag'));
  r.get('/grammar/:lang/:name', byName('grammar'));

  return r;
}

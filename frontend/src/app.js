// IEUM CodingDictionary — 프론트엔드 진입점. 상태/라우팅/데이터를 연결하고 UI 모듈을 호출한다.
import { createApi } from './core/api.js';
import { createCache, getStorage } from './core/cache.js';
import { loadIndex, loadSyntaxIndex, createEntryLoader } from './core/data-loader.js';
import { createSearchEngine, createSyntaxSearch } from './core/search-engine.js';
import { createStore } from './core/state.js';
import { createAuth } from './core/auth.js';
import { createRouter, parseHash, EMPTY_ROUTE } from './ui/navigation.js';
import { setupSearch } from './ui/search.js';
import { renderSidebar } from './ui/sidebar.js';
import { renderResults } from './ui/results.js';
import { renderDetail } from './ui/detail.js';
import { renderAccount } from './ui/account.js';
import { typeLabel, categoryLabel } from './labels.js';

const PAGE = 50;
const BASE_TITLE = 'IEUM CodingDictionary';
const cfg = window.IEUM_CONFIG || {};
const $ = (id) => document.getElementById(id);
const els = { tabWord: $('tab-word'), tabGrammar: $('tab-grammar'), q: $('q'), clear: $('q-clear'), sidebar: $('sidebar'), results: $('results'), detail: $('detail'), account: $('account'), toast: $('toast') };
const desktop = window.matchMedia('(min-width: 901px)');

const cache = createCache(getStorage());
let api = null;
let entries = null;
let engine = null;
let syntaxEngine = null;
let auth = { enabled: false };

const store = createStore({
  status: 'loading', slow: false, error: null,
  index: null, indexVersion: '',
  route: parseHash(location.hash),
  activeIndex: 0, limit: PAGE,
  syntaxStatus: 'idle', syntaxError: null,
  entry: null, entryStatus: 'idle', entryError: null,
  favorites: new Set(cache.get('favorites') || []),
  user: null, authBusy: false,
});

/* ------------------------------------------------------------------ 라우팅 */
const router = createRouter({ onChange: onRoute });
const go = (patch, opts) => router.go({ ...router.current(), ...patch }, opts);
const FILTER_KEYS = ['q', 'lang', 'type', 'category', 'fav', 'mode'];

function onRoute(route) {
  const prev = store.get().route;
  const filtersChanged = FILTER_KEYS.some((k) => prev[k] !== route[k]);
  store.set({ route, ...(filtersChanged ? { limit: PAGE, activeIndex: 0 } : {}) });
  if (filtersChanged) els.results.scrollTop = 0;
  // 검색어가 실제로 바뀐 이동(뒤로가기 등)일 때만 입력창을 덮어쓴다. 필터 클릭 직후 바로 타이핑해도 입력이 지워지지 않는다.
  if (route.q !== prev.q) search.setValue(route.q);
  if (route.entryId !== prev.entryId) loadEntry(route.entryId);
  maybeLoadSyntax();
}

/* ------------------------------------------------------------------ 데이터 */
function useIndex(index) {
  engine = createSearchEngine({ records: index.records, concepts: index.concepts, languages: index.languages });
  const ids = new Set(index.records.map((r) => r.id));
  const favorites = new Set([...store.get().favorites].filter((id) => ids.has(id)));
  cache.set('favorites', [...favorites]);
  const versionChanged = store.get().indexVersion && store.get().indexVersion !== index.dataVersion;
  if (versionChanged) { syntaxEngine = null; store.set({ syntaxStatus: 'idle', syntaxError: null }); }
  store.set({ status: 'ready', error: null, index, indexVersion: index.dataVersion, favorites });
  search.enable();
  maybeLoadSyntax();
}

async function boot() {
  store.set({ status: 'loading', slow: false, error: null });
  const slowTimer = setTimeout(() => store.set({ slow: true }), 4000);
  try {
    api = api || createApi({ base: cfg.apiBase });
    entries = entries || createEntryLoader(api);
    if (!store.get().entry && store.get().route.entryId) loadEntry(store.get().route.entryId); // 공유 링크: 인덱스와 병렬로 상세를 먼저 요청
    const { index } = await loadIndex({
      api, cache,
      onFresh: (fresh) => { useIndex(fresh); entries.clear(); toast('사전이 새 버전으로 업데이트되었어요'); },
    });
    useIndex(index);
    setupAuth();
  } catch (err) {
    store.set({ status: 'error', error: err });
  } finally {
    clearTimeout(slowTimer);
  }
}

/** 문법 모드를 쓸 때만 문법 인덱스(syntax + 예제)를 내려받는다 */
async function maybeLoadSyntax() {
  const s = store.get();
  if (s.route.mode !== 'grammar' || s.status !== 'ready' || s.syntaxStatus !== 'idle') return;
  store.set({ syntaxStatus: 'loading', syntaxError: null });
  try {
    const data = await loadSyntaxIndex({ api, cache, expectVersion: store.get().indexVersion });
    syntaxEngine = createSyntaxSearch({ records: store.get().index.records, syntax: data.records });
    store.set({ syntaxStatus: 'ready' });
  } catch (err) {
    store.set({ syntaxStatus: 'error', syntaxError: err });
  }
}

async function loadEntry(id) {
  if (!id) { store.set({ entry: null, entryStatus: 'idle', entryError: null }); document.title = BASE_TITLE; return; }
  const hit = entries?.peek(id);
  if (hit) { store.set({ entry: hit, entryStatus: 'ready', entryError: null }); document.title = `${hit.name} · ${BASE_TITLE}`; return; }
  store.set({ entry: null, entryStatus: 'loading', entryError: null });
  try {
    const data = await entries.load(id);
    if (store.get().route.entryId !== id) return;
    store.set({ entry: data, entryStatus: 'ready' });
    document.title = `${data.name} · ${BASE_TITLE}`;
  } catch (err) {
    if (store.get().route.entryId !== id) return;
    store.set({ entryStatus: 'error', entryError: err });
  }
}

/* ------------------------------------------------------------------ 검색 결과 계산 */
let lastResult = { key: '', value: null };
function currentResults(s = store.get()) {
  if (!engine) return { total: 0, items: [], hasCriteria: false };
  const r = s.route;
  const grammar = r.mode === 'grammar';
  // 문법 모드는 질의가 비어 있어도 "문법 사전" 목록을 보여 주므로 항상 조건이 있는 셈이다
  const hasCriteria = grammar || Boolean(r.q || r.lang || r.type || r.category || r.fav);
  const key = JSON.stringify([s.indexVersion, r.mode, grammar ? s.syntaxStatus : '', r.q, r.lang, r.type, r.category, r.fav, s.limit, r.fav ? [...s.favorites] : 0]);
  if (lastResult.key === key) return lastResult.value;
  let value = { total: 0, items: [], hasCriteria };
  const common = { lang: r.lang || undefined, category: r.category || undefined, ids: r.fav ? [...s.favorites] : undefined, limit: s.limit };
  if (grammar) {
    if (syntaxEngine) {
      const out = syntaxEngine.search(r.q, { ...common, type: r.type || (r.q ? undefined : 'grammar') });
      value = { total: out.total, items: out.results, hasCriteria };
    }
  } else if (hasCriteria) {
    const out = engine.search(r.q, { ...common, type: r.type || undefined });
    value = { total: out.total, items: out.results, hasCriteria };
  }
  lastResult = { key, value };
  return value;
}

/* ------------------------------------------------------------------ 렌더링 */
const sig = {};
const changed = (name, ...parts) => { const k = parts.join('|'); if (sig[name] === k) return false; sig[name] = k; return true; };
const langNameOf = () => {
  const map = new Map((store.get().index?.languages || []).map((l) => [l.id, l.id === 'common' ? l.nativeName : l.name]));
  return (id) => map.get(id) || id;
};

function render() {
  const s = store.get();
  const r = s.route;
  document.body.classList.toggle('has-detail', Boolean(r.entryId));
  document.body.dataset.mode = r.mode;

  if (changed('tabs', r.mode)) {
    const grammarMode = r.mode === 'grammar';
    els.tabWord.setAttribute('aria-selected', String(!grammarMode)); els.tabWord.tabIndex = grammarMode ? -1 : 0;
    els.tabGrammar.setAttribute('aria-selected', String(grammarMode)); els.tabGrammar.tabIndex = grammarMode ? 0 : -1;
    els.q.placeholder = grammarMode ? '문법 검색  예) for (   def    =>   try {' : '단어 검색  예) ===   함수   <div>';
    els.q.setAttribute('aria-label', grammarMode ? '문법(코드 모양) 검색' : '단어 검색');
  }

  if (s.status === 'ready' && changed('side', s.indexVersion, r.lang, r.type, r.category, r.fav, s.favorites.size)) {
    renderSidebar(els.sidebar, { index: s.index, engine, route: r, favCount: s.favorites.size }, { onChange: (patch) => go(patch) });
  } else if (s.status !== 'ready' && changed('side', s.status)) {
    els.sidebar.replaceChildren();
  }

  const res = currentResults(s);
  const syntaxPending = r.mode === 'grammar' && s.status === 'ready' && s.syntaxStatus !== 'ready';
  if (changed('results', s.status, s.slow, s.error?.message, s.indexVersion, r.mode, s.syntaxStatus, s.syntaxError?.message, r.q, r.lang, r.type, r.category, r.fav, s.limit, r.entryId, r.fav ? [...s.favorites].join(',') : '')) {
    const chips = [];
    if (r.lang) chips.push({ label: langNameOf()(r.lang), onRemove: () => go({ lang: '', type: '', category: '' }) });
    if (r.type) chips.push({ label: typeLabel(r.type), onRemove: () => go({ type: '', category: '' }) });
    if (r.category) chips.push({ label: categoryLabel(r.category), onRemove: () => go({ category: '' }) });
    if (r.fav) chips.push({ label: '★ 즐겨찾기', onRemove: () => go({ fav: false }) });
    renderResults(els.results, {
      status: syntaxPending ? (s.syntaxStatus === 'error' ? 'error' : 'loading') : s.status, slow: s.slow, error: s.syntaxStatus === 'error' && r.mode === 'grammar' ? s.syntaxError : s.error, route: r, mode: r.mode, ...res, chips, pageSize: PAGE, selectedId: r.entryId,
      langName: langNameOf(),
      stats: { entries: s.index?.records.length ?? 0, languages: s.index?.languages.filter((l) => l.id !== 'common').length ?? 0, concepts: s.index?.concepts.length ?? 0 },
    }, {
      onOpen: (i) => { paintActive(i); openEntry(res.items[i].record.id); },
      onMore: () => store.set({ limit: store.get().limit + PAGE }),
      onRetry: () => { if (store.get().status === 'ready') { store.set({ syntaxStatus: 'idle', syntaxError: null }); maybeLoadSyntax(); } else boot(); },
      onExample: (q) => { go({ q }); search.focus(); },
      onClearFilters: () => go({ lang: '', type: '', category: '', fav: false }),
    });
    paintActive(s.activeIndex, false);
  }

  const isFav = Boolean(s.entry && s.favorites.has(s.entry.id));
  if (changed('detail', r.entryId, s.entryStatus, s.entry?.id, isFav, s.indexVersion)) {
    const mode = !r.entryId ? 'none' : s.entryStatus === 'ready' && s.entry ? 'entry' : s.entryStatus === 'error' ? 'error' : 'loading';
    renderDetail(els.detail, {
      mode, entry: s.entry, error: s.entryError, isFav, langName: langNameOf(), dataVersion: s.indexVersion,
      concepts: conceptCards(s),
    }, {
      onClose: closeEntry, onToggleFav: toggleFav, onCopy: copyText, onRetry: () => loadEntry(store.get().route.entryId),
      onOpen: (id) => openEntry(id), onSearch: (q) => go({ q, lang: '', type: '', category: '', fav: false, entryId: null }),
    });
    if (r.entryId && !desktop.matches) els.detail.scrollTop = 0;
    else if (r.entryId && s.entryStatus === 'ready') els.detail.scrollTop = 0;
  }

  if (changed('account', auth.enabled, s.user?.uid, s.authBusy)) {
    renderAccount(els.account, { enabled: auth.enabled, user: s.user, busy: s.authBusy }, {
      onSignIn: async () => {
        store.set({ authBusy: true });
        try { await auth.signIn(); } catch (e) { if (e?.code !== 'auth/popup-closed-by-user') toast('로그인하지 못했어요. 잠시 후 다시 시도해 주세요'); }
        store.set({ authBusy: false });
      },
      onSignOut: () => auth.signOut(),
    });
  }
}

function conceptCards(s) {
  if (!s.index) return [];
  const langsByConcept = new Map();
  for (const rec of s.index.records) for (const c of rec.c) {
    if (!langsByConcept.has(c)) langsByConcept.set(c, new Set());
    langsByConcept.get(c).add(rec.l);
  }
  return s.index.concepts.map((c) => ({ ...c, langs: [...(langsByConcept.get(c.id) || [])] }));
}

/* 키보드로 이동하는 "활성" 행 표시 (전체를 다시 그리지 않고 클래스만 바꾼다) */
function paintActive(i, scroll = true) {
  const rows = els.results.querySelectorAll('.result');
  const idx = rows.length ? Math.max(0, Math.min(i, rows.length - 1)) : 0;
  if (store.get().activeIndex !== idx) store.set({ activeIndex: idx });
  rows.forEach((row, n) => row.classList.toggle('kbd-active', n === idx && document.activeElement === els.q));
  const active = rows[idx];
  search.setActiveDescendant(active ? active.id : null);
  if (active && scroll) active.scrollIntoView({ block: 'nearest' });
}

/* ------------------------------------------------------------------ 동작 */
let previewTimer = 0;
function schedulePreview() {
  clearTimeout(previewTimer);
  if (!desktop.matches) return; // 모바일은 Enter/탭으로만 상세를 연다
  previewTimer = setTimeout(() => {
    const s = store.get();
    const item = currentResults(s).items[s.activeIndex];
    if (item && s.route.entryId !== item.record.id) router.go({ ...s.route, entryId: item.record.id }, { replace: true });
  }, 200);
}

function openEntry(id, opts) { go({ entryId: id }, opts); if (!desktop.matches) setTimeout(() => $('detail-back')?.focus(), 60); }
function closeEntry() { go({ entryId: null }, { replace: true }); }

let toastTimer = 0;
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'sr-only';
    document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch { toast('복사하지 못했어요'); ta.remove(); return; }
    ta.remove();
  }
  toast('복사했어요');
}

/* ------------------------------------------------------------------ 즐겨찾기 (브라우저 + 로그인 시 서버 동기화) */
let pushTimer = 0;
function toggleFav(id) {
  const next = new Set(store.get().favorites);
  const added = !next.delete(id);
  if (added) next.add(id);
  cache.set('favorites', [...next]);
  store.set({ favorites: next });
  toast(added ? '즐겨찾기에 추가했어요' : '즐겨찾기에서 뺐어요');
  schedulePush();
}

function schedulePush() {
  if (!store.get().user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try { await api.putFavorites(await auth.getToken(), [...store.get().favorites]); }
    catch { toast('즐겨찾기를 서버에 저장하지 못했어요. 이 브라우저에는 저장되어 있어요'); }
  }, 600);
}

async function syncAfterLogin() {
  try {
    const token = await auth.getToken();
    const { data } = await api.getFavorites(token);
    const known = new Set(store.get().index.records.map((r) => r.id));
    const local = [...store.get().favorites];
    const merged = [...new Set([...data.ids, ...local])].filter((id) => known.has(id));
    cache.set('favorites', merged);
    store.set({ favorites: new Set(merged) });
    if (merged.length !== data.ids.length) await api.putFavorites(token, merged);
  } catch {
    toast('서버의 즐겨찾기를 불러오지 못했어요');
  }
}

function setupAuth() {
  if (auth.enabled || !cfg.firebase) return;
  auth = createAuth({
    config: cfg.firebase, sdkVersion: cfg.firebaseSdkVersion,
    onUser: (user) => { store.set({ user }); if (user) syncAfterLogin(); },
  });
  render();
  const start = () => auth.init().catch(() => toast('로그인 기능을 불러오지 못했어요'));
  (window.requestIdleCallback || ((f) => setTimeout(f, 800)))(start);
}

/* ------------------------------------------------------------------ 시작 */
const search = setupSearch({
  input: els.q, clearBtn: els.clear,
  onInput: (value) => {
    const q = value.trim() ? value.slice(0, 100) : '';
    if (q !== store.get().route.q) { go({ q }, { replace: true }); schedulePreview(); }
  },
  onArrow: (d) => {
    const n = currentResults().items.length;
    if (!n) return;
    paintActive(store.get().activeIndex + d);
    schedulePreview();
  },
  onEnter: () => {
    clearTimeout(previewTimer);
    const s = store.get();
    const item = currentResults(s).items[s.activeIndex];
    if (item) openEntry(item.record.id);
  },
  onEscape: () => {
    const s = store.get();
    if (els.q.value) { els.q.value = ''; go({ q: '' }, { replace: true }); search.setValue(''); }
    else if (s.route.entryId) closeEntry();
  },
});

for (const [btn, mode] of [[els.tabWord, 'word'], [els.tabGrammar, 'grammar']]) {
  btn.addEventListener('click', () => { if (store.get().route.mode !== mode) { go({ mode }); } search.focus(); });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const next = mode === 'word' ? els.tabGrammar : els.tabWord; next.click(); next.focus(); }
  });
}
els.q.addEventListener('focus', () => paintActive(store.get().activeIndex, false));
els.q.addEventListener('blur', () => paintActive(store.get().activeIndex, false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !desktop.matches && store.get().route.entryId && document.activeElement !== els.q) closeEntry(); });

store.subscribe(render);
search.setValue(store.get().route.q);
render();
boot();

// 테스트/디버깅용 (읽기 전용 진단)
window.__ieum = { store, router };

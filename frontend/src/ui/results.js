import { h, replace, tileSize } from './dom.js';
import { typeLabel, WHY_LABELS } from '../labels.js';

export const EXAMPLES = ['===', '함수', '<div>', 'async', 'grid', 'try catch'];
export const SYNTAX_EXAMPLES = ['for (', 'def ', '=>', 'try {', 'SELECT', 'match', 'impl ', 'go func', 'interface'];

/** 코드 조각을 일치 부분만 <mark>로 강조해서 보여 준다 (innerHTML 없이) */
function codeSnippet(snippet) {
  const { text, start, end } = snippet;
  const body = end > start ? [text.slice(0, start), h('mark', null, text.slice(start, end)), text.slice(end)] : [text];
  return h('pre', { class: 'snippet', 'aria-label': '코드 예시' }, snippet.truncatedTop ? h('span', { class: 'ellipsis' }, '…\n') : null, h('code', null, body), snippet.truncatedBottom ? h('span', { class: 'ellipsis' }, '\n…') : null);
}

function row(item, i, v, handlers) {
  const r = item.record;
  const lang = v.langName(r.l);
  const selected = v.selectedId === r.id;
  const grammar = v.mode === 'grammar';
  const why = !grammar ? WHY_LABELS[item.why] : '';
  return h('div', {
    class: `result${grammar ? ' result-grammar' : ''}${r.t === 'grammar' ? ' is-grammar-entry' : ''}`, id: `r-${i}`, role: 'option', tabindex: '-1', dataset: { id: r.id, index: i },
    'aria-selected': String(selected), 'aria-current': selected ? 'true' : null,
    onclick: () => handlers.onOpen(i),
  },
  h('div', { class: 'result-head' },
    h('b', { class: 'headword' }, r.n),
    h('span', { class: 'pron', 'aria-hidden': 'true' }, `[ ${r.s} ]`),
    h('span', { class: 'pos' }, typeLabel(r.t)),
    h('span', { class: 'badge' }, h('span', { class: `dot lang-${r.l}`, 'aria-hidden': 'true' }), lang)),
  grammar && item.snippet
    ? codeSnippet(item.snippet)
    : [h('p', { class: 'result-desc' }, r.d), h('code', { class: 'result-syntax' }, r.x.split('\n')[0])],
  why ? h('span', { class: 'result-why' }, why) : null);
}

function skeleton(v, message) {
  return h('div', null,
    h('div', { class: 'skeleton', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i')),
    h('p', { class: 'sr-only', role: 'status' }, message || '불러오는 중'),
    v.slow ? h('div', { class: 'state' }, h('p', null, '서버를 깨우는 중이에요. 무료 호스팅은 첫 요청에 최대 1분 정도 걸릴 수 있어요.')) : null);
}

function errorState(v, handlers) {
  return h('div', { class: 'state error', role: 'alert' },
    h('h2', null, v.mode === 'grammar' && v.status !== 'error' ? '문법 사전을 불러오지 못했어요' : '사전을 불러오지 못했어요'),
    h('p', null, v.error?.message || '알 수 없는 오류가 발생했습니다.'),
    h('p', null, '인터넷 연결과 서버 주소 설정(config.js)을 확인한 뒤 다시 시도해 주세요.'),
    h('button', { class: 'btn primary', type: 'button', onclick: handlers.onRetry }, '다시 시도'));
}

function startState(v, handlers) {
  return h('div', { class: 'state start' },
    h('p', { class: 'eyebrow' }, 'IEUM CodingDictionary'),
    h('h2', { class: 'headword big' }, '무엇을 찾고 있나요?'),
    h('p', null, '기호, 태그, 키워드, 연산자, 문법을 이름이나 한글 별칭으로 찾아보세요. 같은 개념은 언어가 달라도 함께 보여 줘요.'),
    h('div', { class: 'chips', role: 'group', 'aria-label': '검색 예시' },
      EXAMPLES.map((q) => h('button', { type: 'button', class: 'chip', onclick: () => handlers.onExample(q) }, q))),
    h('p', { class: 'hint-line' }, '코드 모양으로 찾고 싶다면 위의 「문법」 탭을 눌러 보세요.'),
    h('div', { class: 'stats' },
      h('div', null, h('b', null, String(v.stats.entries)), h('span', null, '표제어')),
      h('div', null, h('b', null, String(v.stats.languages)), h('span', null, '언어')),
      h('div', null, h('b', null, String(v.stats.concepts)), h('span', null, '공통 개념'))));
}

function emptyState(v, handlers) {
  const grammar = v.mode === 'grammar';
  const text = v.route.fav && !v.route.q ? '아직 즐겨찾기한 항목이 없어요'
    : v.route.q ? (grammar ? `‘${v.route.q}’ 모양의 코드를 찾지 못했어요` : `‘${v.route.q}’에 맞는 항목이 없어요`)
      : '조건에 맞는 항목이 없어요';
  const tip = v.route.fav && !v.route.q ? '상세 화면의 별 버튼을 누르면 여기에 모여요.'
    : grammar ? '키워드나 기호 일부만 입력해 보세요(예: for, =>, def). 공백은 있어도 없어도 같게 찾아요. 필터가 켜져 있다면 해제해 보세요.'
      : '철자를 확인하거나, 한글 이름·영문 이름·기호 자체로 다시 검색해 보세요. 필터가 켜져 있다면 해제해 보세요.';
  return h('div', { class: 'state' },
    h('h2', { class: 'headword' }, text), h('p', null, tip),
    v.chips.length ? h('button', { class: 'btn', type: 'button', onclick: handlers.onClearFilters }, '필터 모두 해제') : null);
}

function header(v, handlers) {
  const grammar = v.mode === 'grammar';
  const title = v.route.q
    ? h('span', null, `‘${v.route.q}’ ${grammar ? '문법 검색 결과 ' : '검색 결과 '}`, h('strong', null, String(v.total)), '개')
    : v.route.fav ? h('span', null, '즐겨찾기 ', h('strong', null, String(v.total)), '개')
      : grammar ? h('span', null, '문법 사전 ', h('strong', null, String(v.total)), '개 · 코드 모양으로 찾아보세요')
        : h('span', null, h('strong', null, String(v.total)), '개 표제어');
  return h('div', { class: 'results-head' },
    h('div', { class: 'results-count', role: 'status' }, title),
    grammar && !v.route.q ? h('div', { class: 'chips', role: 'group', 'aria-label': '문법 검색 예시' }, SYNTAX_EXAMPLES.map((q) => h('button', { type: 'button', class: 'chip code-chip', onclick: () => handlers.onExample(q) }, q))) : null,
    v.chips.length ? h('div', { class: 'chips' }, v.chips.map((c) => h('button', { type: 'button', class: 'chip removable', 'aria-label': `${c.label} 필터 해제`, onclick: c.onRemove }, c.label))) : null);
}

export function renderResults(el, v, handlers) {
  if (v.status === 'loading') return replace(el, skeleton(v, v.mode === 'grammar' ? '문법 사전을 불러오는 중' : '불러오는 중'));
  if (v.status === 'error') return replace(el, errorState(v, handlers));
  if (!v.hasCriteria) return replace(el, startState(v, handlers));
  if (v.total === 0) return replace(el, h('div', null, header(v, handlers), emptyState(v, handlers)));

  const rows = v.items.map((item, i) => row(item, i, v, handlers));
  const remaining = v.total - v.items.length;
  replace(el, h('div', null, header(v, handlers),
    h('div', { class: 'result-list', id: 'result-list', role: 'listbox', 'aria-label': '검색 결과' }, rows),
    remaining > 0 ? h('button', { class: 'btn more', type: 'button', onclick: handlers.onMore }, `${Math.min(remaining, v.pageSize)}개 더 보기 (남은 ${remaining}개)`) : null));
}

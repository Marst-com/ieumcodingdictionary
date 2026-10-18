import { h, replace, tileSize } from './dom.js';
import { typeLabel, categoryLabel } from '../labels.js';

const topBar = (handlers) => h('div', { class: 'detail-top' },
  h('button', { class: 'btn', type: 'button', id: 'detail-back', onclick: handlers.onClose }, '← 목록으로'));

function codeBlock(text, handlers, extra = '') {
  return h('div', { class: `code ${extra}`.trim() },
    h('pre', { tabindex: '0' }, h('code', null, text)),
    h('button', { type: 'button', class: 'btn small copy', 'aria-label': '코드 복사', onclick: () => handlers.onCopy(text) }, '복사'));
}

function section(title, ...body) {
  return h('section', { class: 'section' }, h('h2', null, title), body);
}

function linkRow(e, v, handlers, withLang = false) {
  const meta = withLang ? `${v.langName(e.language)} · ${typeLabel(e.type)}` : typeLabel(e.type);
  return h('button', { type: 'button', class: 'link-row', onclick: () => handlers.onOpen(e.id) },
    h('span', { class: 'mini', title: e.symbol }, e.symbol),
    h('span', { class: 'nm' }, e.name),
    h('span', { class: 'badge' }, meta));
}

function tree(node) {
  return h('li', null,
    h('span', { class: 'node' }, node.node),
    node.text ? h('span', { class: 'text' }, node.text) : null,
    node.children ? h('ul', null, node.children.map(tree)) : null);
}

function entryBody(e, v, handlers) {
  const out = [];
  out.push(h('header', { class: 'entry-head' },
    h('div', { class: 'entry-title' },
      h('p', { class: 'eyebrow' }, `${v.langName(e.language)} · ${typeLabel(e.type)}`),
      h('div', { class: 'headword-line' },
        h('h1', { class: 'headword' }, e.name),
        h('span', { class: 'pron', title: e.symbol }, `[ ${e.symbol} ]`)),
      h('div', { class: 'hero-meta' },
        h('span', { class: 'pos' }, typeLabel(e.type)),
        h('span', { class: 'badge' }, h('span', { class: `dot lang-${e.language}`, 'aria-hidden': 'true' }), v.langName(e.language)),
        h('span', { class: 'badge' }, categoryLabel(e.category)))),
    h('button', {
      type: 'button', class: 'fav-btn', 'aria-pressed': String(v.isFav), 'aria-label': v.isFav ? '즐겨찾기 해제' : '즐겨찾기에 추가',
      title: v.isFav ? '즐겨찾기 해제' : '즐겨찾기에 추가', onclick: () => handlers.onToggleFav(e.id),
    }, v.isFav ? '★' : '☆')));

  out.push(section('뜻풀이', h('ol', { class: 'senses' }, h('li', null, e.description))));
  out.push(section('문형', codeBlock(e.syntax, handlers, 'syntax')));
  out.push(section('용례', e.examples.map((x) => codeBlock(x, handlers))));

  if (e.tree) {
    out.push(section('문법 구조', h('div', { class: 'tree-wrap' }, h('ul', { class: 'tree', role: 'tree' }, tree(e.tree)))));
  }

  if (e.contexts) {
    out.push(section('언어별 뜻', h('dl', { class: 'ctx' },
      Object.entries(e.contexts).map(([lang, text]) => h('div', null,
        h('dt', null, h('span', { class: `dot lang-${lang}`, 'aria-hidden': 'true' }), v.langName(lang)),
        h('dd', null, text))))));
  }
  if (e.appliesTo?.length) {
    out.push(section('적용 요소', h('div', { class: 'alias-list' },
      e.appliesTo[0] === '*' ? h('span', { class: 'chip' }, '모든 요소') : e.appliesTo.map((t) => h('code', { class: 'chip' }, `<${t}>`)))));
  }
  if (e.roles?.length) {
    out.push(section('역할', h('div', { class: 'alias-list' }, e.roles.map((r) => h('span', { class: 'chip' }, r)))));
  }

  if (e.aliases?.length) {
    out.push(section('비슷한 말', h('div', { class: 'alias-list' },
      e.aliases.map((a) => h('button', { type: 'button', class: 'chip', title: `‘${a}’ 검색`, onclick: () => handlers.onSearch(a) }, a)))));
  }

  if (e.relatedEntries?.length) {
    out.push(section('관련 낱말', h('div', { class: 'link-list' }, e.relatedEntries.map((r) => linkRow(r, v, handlers, r.language !== e.language)))));
  }

  for (const link of e.conceptLinks || []) {
    const langs = Object.entries(link.implementations);
    out.push(section('다른 언어로는',
      h('div', { class: 'concept-block' },
        h('h3', null, `${link.concept.aliases[0] || link.concept.name} · ${link.concept.name}`),
        h('p', null, link.concept.description),
        langs.length
          ? langs.map(([lang, list]) => h('div', { class: 'impl-group' },
            h('span', { class: 'badge' }, h('span', { class: `dot lang-${lang}`, 'aria-hidden': 'true' }), v.langName(lang)),
            h('div', { class: 'link-list' }, list.map((x) => linkRow(x, v, handlers)))))
          : h('p', null, '아직 다른 항목이 연결되지 않았어요.'),
        h('button', { type: 'button', class: 'btn small', onclick: () => handlers.onSearch(link.concept.aliases[0] || link.concept.name) }, `‘${link.concept.aliases[0] || link.concept.name}’ 모두 보기`))));
  }

  out.push(h('footer', { class: 'entry-foot' },
    h('span', null, 'ID ', h('code', null, e.id), ' ', h('button', { type: 'button', class: 'btn small', 'aria-label': 'ID 복사', onclick: () => handlers.onCopy(e.id) }, '복사')),
    h('span', null, `항목 v${e.version}`),
    h('span', null, `데이터 ${v.dataVersion}`)));
  return out;
}

function explore(v, handlers) {
  return h('div', { class: 'explore' },
    h('p', { class: 'eyebrow' }, 'IEUM CodingDictionary'),
    h('h2', { class: 'headword big' }, '개념으로 둘러보기'),
    h('p', null, '같은 개념이 언어마다 어떻게 쓰이는지 비교해 보세요. 왼쪽 목록에서 항목을 고르면 이 자리에 상세가 열려요.'),
    h('div', { class: 'concept-grid' }, v.concepts.map((c) => h('button', { type: 'button', class: 'concept-card', onclick: () => handlers.onSearch(c.aliases[0] || c.name) },
      h('b', null, c.aliases[0] || c.name),
      h('span', null, c.name),
      h('span', { class: 'dots' }, c.langs.map((l) => h('span', { class: `dot lang-${l}`, title: v.langName(l) }))))))
  );
}

export function renderDetail(el, v, handlers) {
  if (v.mode === 'none') return replace(el, explore(v, handlers));
  if (v.mode === 'loading') return replace(el, topBar(handlers), h('div', { class: 'detail-inner' }, h('div', { class: 'skeleton', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('p', { class: 'sr-only', role: 'status' }, '상세 정보를 불러오는 중')));
  if (v.mode === 'error') {
    const missing = v.error?.code === 'NOT_FOUND';
    return replace(el, topBar(handlers), h('div', { class: 'detail-inner' },
      h('div', { class: 'inline-error', role: 'alert' },
        missing ? '이 항목은 사전에 없어요. 링크가 오래되었거나 데이터가 바뀌었을 수 있어요.' : (v.error?.message || '상세 정보를 불러오지 못했어요.'),
        missing ? null : h('button', { class: 'btn small', type: 'button', onclick: handlers.onRetry }, '다시 시도'))));
  }
  return replace(el, topBar(handlers), h('article', { class: 'detail-inner' }, entryBody(v.entry, v, handlers)));
}

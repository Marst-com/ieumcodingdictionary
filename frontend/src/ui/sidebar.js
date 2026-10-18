import { h, replace } from './dom.js';
import { TYPE_ORDER, typeLabel, categoryLabel } from '../labels.js';

const langLabel = (l) => (l.id === 'common' ? l.nativeName : l.name);

/** 언어 → 종류 → 분류 순으로 좁혀 가는 필터 + 즐겨찾기 */
export function renderSidebar(el, { index, engine, route, favCount }, { onChange }) {
  const item = ({ label, count, pressed, onClick, dot, star }) =>
    h('button', { type: 'button', class: 'side-item', 'aria-pressed': String(pressed), onclick: onClick },
      dot ? h('span', { class: `dot lang-${dot}`, 'aria-hidden': 'true' }) : null,
      star ? h('span', { class: 'star', 'aria-hidden': 'true' }, '★') : null,
      h('span', null, label),
      h('span', { class: 'count' }, String(count)));
  const group = (title, items) => h('div', { class: 'side-group' }, h('div', { class: 'side-title' }, title), h('div', { class: 'side-list', role: 'group', 'aria-label': title }, items));

  const langItems = [
    item({ label: '전체', count: engine.count({}), pressed: !route.lang, onClick: () => onChange({ lang: '', type: '', category: '' }) }),
    ...index.languages.map((l) => item({
      label: langLabel(l), count: engine.count({ lang: l.id }), pressed: route.lang === l.id, dot: l.id,
      onClick: () => onChange({ lang: route.lang === l.id ? '' : l.id, type: '', category: '' }),
    })),
  ];

  const scope = index.records.filter((r) => !route.lang || r.l === route.lang);
  const types = TYPE_ORDER.filter((t) => scope.some((r) => r.t === t));
  const typeItems = types.map((t) => item({
    label: typeLabel(t), count: engine.count({ lang: route.lang || undefined, type: t }), pressed: route.type === t,
    onClick: () => onChange({ type: route.type === t ? '' : t, category: '' }),
  }));

  const groups = [group('언어', langItems), group('종류', typeItems)];

  if (route.lang || route.type) {
    const cats = [...new Set(scope.filter((r) => !route.type || r.t === route.type).map((r) => r.g))].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), 'ko'));
    groups.push(group('분류', cats.map((c) => item({
      label: categoryLabel(c), count: engine.count({ lang: route.lang || undefined, type: route.type || undefined, category: c }), pressed: route.category === c,
      onClick: () => onChange({ category: route.category === c ? '' : c }),
    }))));
  }

  groups.push(group('내 목록', [item({ label: '즐겨찾기', count: favCount, pressed: route.fav, star: true, onClick: () => onChange({ fav: !route.fav }) })]));
  replace(el, groups);
}

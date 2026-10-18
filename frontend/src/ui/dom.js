// innerHTML 을 쓰지 않는 작은 DOM 헬퍼. 모든 텍스트는 text node 로만 들어가므로 XSS 위험이 없다.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function replace(container, ...nodes) {
  container.replaceChildren(...nodes.flat().filter(Boolean));
}

export const tileSize = (text) => (text.length <= 3 ? 's' : text.length <= 8 ? 'm' : 'l');

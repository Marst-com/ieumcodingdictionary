// 검색 입력: 디바운스, 한글 IME 조합 처리, 키보드 이동(↑↓ Enter Esc), "/" 단축키
const isTypingTarget = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

export function setupSearch({ input, clearBtn, debounceMs = 150, onInput, onArrow, onEnter, onEscape }) {
  let timer = 0;

  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value;
    clearTimeout(timer);
    timer = setTimeout(() => onInput(input.value), debounceMs);
  });

  input.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중 Enter/방향키 무시
    if (e.key === 'ArrowDown') { e.preventDefault(); onArrow(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); onArrow(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); onInput(input.value); onEnter(); }
    else if (e.key === 'Escape') { e.preventDefault(); onEscape(); }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    clearTimeout(timer);
    onInput('');
    input.focus();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  return {
    setValue(v) { if (input.value !== v) input.value = v; clearBtn.hidden = !v; },
    focus: () => input.focus(),
    enable() { input.disabled = false; },
    setActiveDescendant(id) { if (id) input.setAttribute('aria-activedescendant', id); else input.removeAttribute('aria-activedescendant'); },
  };
}

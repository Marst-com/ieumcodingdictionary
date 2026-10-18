// 아주 작은 상태 저장소. UI 모듈은 상태를 직접 바꾸지 않고 app.js 를 통해서만 바꾼다.
export function createStore(initial) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      const changed = Object.keys(patch).filter((k) => !Object.is(state[k], patch[k]));
      if (!changed.length) return;
      state = { ...state, ...patch };
      for (const fn of [...listeners]) fn(state, changed);
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

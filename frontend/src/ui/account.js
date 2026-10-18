import { h, replace } from './dom.js';

export function renderAccount(el, { enabled, user, busy }, { onSignIn, onSignOut }) {
  if (!enabled) return replace(el);
  if (!user) return replace(el, h('button', { class: 'btn primary', type: 'button', disabled: busy, onclick: onSignIn }, busy ? '로그인 중…' : 'Google로 로그인'));
  const initial = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();
  replace(el,
    h('span', { class: 'avatar', 'aria-hidden': 'true' }, user.photoURL ? h('img', { src: user.photoURL, alt: '', referrerpolicy: 'no-referrer', width: 32, height: 32 }) : initial),
    h('span', { class: 'account-name' }, user.displayName || user.email || ''),
    h('button', { class: 'btn small', type: 'button', onclick: onSignOut }, '로그아웃'));
}

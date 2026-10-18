// Firebase Authentication (선택 기능). config.firebase 가 비어 있으면 아무것도 불러오지 않는다.
// SDK 는 필요한 순간에만 CDN 에서 동적으로 불러와 초기 로딩을 가볍게 유지한다.
export function createAuth({ config, sdkVersion, onUser }) {
  if (!config) return { enabled: false };
  let sdk = null;
  let auth = null;

  async function init() {
    if (auth) return;
    const base = `https://www.gstatic.com/firebasejs/${sdkVersion}`;
    const [appMod, authMod] = await Promise.all([import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`)]);
    sdk = authMod;
    auth = authMod.getAuth(appMod.initializeApp(config));
    authMod.onAuthStateChanged(auth, (u) => onUser(u ? { uid: u.uid, displayName: u.displayName, email: u.email, photoURL: u.photoURL } : null));
  }

  return {
    enabled: true,
    init,
    async signIn() {
      await init();
      await sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider());
    },
    async signOut() { if (auth) await sdk.signOut(auth); },
    /** 매 요청 직전에 호출 — Firebase 가 만료된 토큰을 자동 갱신한다 */
    async getToken() { return auth?.currentUser ? auth.currentUser.getIdToken() : null; },
  };
}

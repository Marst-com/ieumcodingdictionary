// Firebase Admin 초기화 (선택). 환경 변수가 없으면 비활성화되고 인증이 필요한 API만 503을 돌려준다.
// firebase-admin 은 필요할 때만 동적으로 불러와서 시작 시간을 줄인다.

/** @returns {Promise<{enabled: boolean, verifyToken?: Function, favorites?: object}>} */
export async function createFirebase(firebaseEnv) {
  if (!firebaseEnv) return { enabled: false };
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

  const app = getApps()[0] || initializeApp({
    credential: cert({ projectId: firebaseEnv.projectId, clientEmail: firebaseEnv.clientEmail, privateKey: firebaseEnv.privateKey }),
  });
  const auth = getAuth(app);
  const db = getFirestore(app);

  return {
    enabled: true,
    /** Firebase ID 토큰 검증 → { uid } */
    async verifyToken(idToken) {
      const decoded = await auth.verifyIdToken(idToken);
      return { uid: decoded.uid, admin: decoded.admin === true };
    },
    /** users/{uid}.favorites (문자열 id 배열) */
    favorites: {
      async get(uid) {
        const snap = await db.collection('users').doc(uid).get();
        const ids = snap.exists ? snap.get('favorites') : [];
        return Array.isArray(ids) ? ids : [];
      },
      async set(uid, ids) {
        await db.collection('users').doc(uid).set({ favorites: ids, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      },
    },
  };
}

/** 테스트/로컬용 메모리 저장소 (Firebase 대체) */
export function createMemoryFavorites() {
  const map = new Map();
  return { get: async (uid) => [...(map.get(uid) || [])], set: async (uid, ids) => { map.set(uid, [...ids]); } };
}

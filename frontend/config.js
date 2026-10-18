// 배포 환경 설정
window.IEUM_CONFIG = {
  apiBase: import.meta.env.VITE_API_BASE || 'http://localhost:8787',

  firebase: import.meta.env.VITE_FIREBASE_API_KEY
    ? {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
        messagingSenderId:
          import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
      }
    : null,

  firebaseSdkVersion: '10.14.1',
};

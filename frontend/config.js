// 배포 환경에 맞게 이 파일만 바꿉니다. (공개되어도 되는 값만 넣을 것 — 비밀 키 금지)
window.IEUM_CONFIG = {
  // Render 백엔드 주소. 예) "https://ieum-codingdictionary-api.onrender.com"
  apiBase: 'http://localhost:8787',

  // 로그인/즐겨찾기 동기화를 쓰려면 Firebase "웹 앱" 설정을 넣습니다 (apiKey 는 공개 값입니다).
  // 비워 두면(null) 로그인 버튼이 숨겨지고 즐겨찾기는 이 브라우저에만 저장됩니다.
  firebase: null,
  // firebase: { apiKey: '...', authDomain: '...firebaseapp.com', projectId: '...', appId: '...' },
  firebaseSdkVersion: '10.14.1',
};

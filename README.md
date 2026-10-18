# IEUM CodingDictionary

코딩 문자 · 기호 · 태그 · 키워드 · 연산자 · 함수 · 문법을 구조화한 **공용 Coding Knowledge System** 입니다.
웹 사전은 이 시스템의 한 소비자일 뿐이고, 다른 IEUM 서비스도 같은 데이터를 JSON 또는 API 로 쓸 수 있습니다.
흰 바탕 + 보라색 포인트의 사전 디자인이며, 상단 탭으로 **단어 검색 / 문법(코드 모양) 검색**을 고릅니다.

```
backend/data (JSON 원본) ─▶ Backend (Render, Node.js) ─▶ /api/v1 ─▶ Frontend (Vercel) ─▶ UI
                                  └─ Firebase (로그인 · 즐겨찾기, 선택)
```

```
.
├─ frontend/      Vercel — 프레임워크 없는 HTML/CSS/JS (ES 모듈)
├─ backend/       Render — Node.js + Express, 지식 데이터(JSON), Firebase 연동
├─ .env.example   백엔드 환경 변수 예시
├─ .gitignore
└─ README.md
```

## 로컬 실행
```bash
# 1) 백엔드  http://localhost:8787
cd backend && npm install && npm run validate && npm start
#    (환경 변수가 필요하면: 루트의 .env.example 을 backend/.env 로 복사 → npm run dev)

# 2) 프론트엔드  http://localhost:5173  — 새 터미널
cd frontend && python3 -m http.server 5173      # ES 모듈은 file:// 로는 안 열립니다
```
백엔드 주소는 `frontend/config.js` 의 `apiBase` 하나만 바꿉니다. Firebase 설정이 없어도 사전(검색·상세)은 모두 동작하고, 로그인·서버 동기화 즐겨찾기만 꺼집니다.

## 테스트
```bash
cd backend  && npm test     # 47개: 데이터 검증기 · 검색(단어/문법) · API · CORS · 인증 · 레이트리밋
cd frontend && npm test     # 15개: API 클라이언트 · 캐시 · 로더 · 라우터 · 문법 검색
cd backend  && npm run validate   # 지식 데이터 구조 검증 (서버도 시작할 때 같은 검증을 하고, 실패하면 뜨지 않습니다)
```

## 배포
**Render (백엔드)** — Root Directory `backend` · Build `npm install` · Start `npm start` · Health Check `/health`
환경 변수는 `.env.example` 참고 (`CORS_ORIGINS` 는 프론트 주소, Firebase 3종은 서비스 계정 값).
Firestore 보안 규칙은 전부 막아 두세요(백엔드 Admin SDK 만 읽고 씁니다): `match /{doc=**} { allow read, write: if false; }`

**Vercel (프론트엔드)** — Root Directory `frontend` · Framework `Other` · Build Command 없음
- 배포 전 `frontend/config.js` 의 `apiBase` 를 Render 주소로 바꿉니다.
- 로그인을 쓰려면 같은 파일의 `firebase` 에 웹 앱 설정(공개 값)을 넣습니다. 비워 두면 로그인 버튼이 숨겨집니다.
- `frontend/vercel.json` 의 CSP `connect-src` 는 `*.onrender.com` 기준입니다. 커스텀 도메인이면 추가하세요.

## 검색: 단어 / 문법
| 모드 | 무엇을 찾나 | 예 |
|---|---|---|
| **단어** | 이름·기호·한글 별칭·개념·설명 (우선순위: id → 기호 → 이름 → 별칭 → 개념 → 언어 → 설명) | `===`, `함수`, `<div>`, `try catch` |
| **문법** | syntax 와 용례(예제 코드)의 **글자 모양**. 공백·대소문자 무시(`for(` = `for (`), 일치한 줄을 강조. 질의가 비면 문법 항목 목록 | `for (`, `def `, `=>`, `SELECT`, `impl ` |

URL: `#/?q=함수&lang=python` · `#/?m=g&q=for%20(` (`m=g` 가 문법 모드) · `#/entry/<id>`.
단어 인덱스는 `dataVersion` 별로 브라우저에 캐시되고, 문법 인덱스는 문법 탭을 처음 열 때만 내려받습니다.
키보드: `/` 검색창, ↑↓ 이동, Enter 열기, Esc 지우기/닫기.

> 검색 엔진(`backend/src/lib/search-engine.js`)은 `frontend/src/core/search-engine.js` 와 **내용이 완전히 같은 복사본**입니다. 고칠 때는 두 파일을 함께 수정하세요.

## API (`/api/v1`)
응답은 항상 `{ success, data, error, meta: { version, schemaVersion, dataVersion } }`.
```
GET /manifest   /languages   /languages/:lang?type=&category=   /entries/:id
GET /search?q=&lang=&type=&category=&limit=&offset=&mode=word|syntax
GET /search/index?lang=              단어 검색용 compact 인덱스
GET /search/syntax-index?lang=       문법 검색용 인덱스 (syntax + 예제, lazy)
GET /concepts   /concepts/:id   /tags/:lang/:name   /grammar/:lang/:name
GET|PUT /me/favorites                (Authorization: Bearer <Firebase ID token>)
```
특정 데이터 버전이 필요하면 `X-Data-Version` 헤더(또는 `?dataVersion=`). 다르면 `409 DATA_VERSION_UNAVAILABLE`.

## 지식 데이터 (`backend/data`)
10개 언어(HTML, CSS, JavaScript, TypeScript, Python, C, Java, Go, Rust, SQL) + 공통 기호, 항목 709개, 공통 개념 21개.
- `manifest.json`(버전·언어·파일 목록) · `languages/<lang>/<type>.json` · `symbols/symbols.json` · `concepts/concepts.json`
- 항목 id 는 `<language>.<type>.<slug>` (예: `javascript.operator.strict-equality`). 한 번 정하면 바꾸지 않습니다 — 다른 서비스가 참조합니다.
- 필수 필드: `id symbol name aliases category description syntax examples related concepts`. 기호는 `roles`·`contexts`, 문법은 `tree`, HTML 속성은 `appliesTo` 추가.
- 개념 연결은 항목의 `concepts` 한 곳에만 적습니다(언어별 대응 목록은 서버가 만듭니다).
- 항목 추가: `cd backend && node scripts/add-entries.mjs <파일> < entries.jsonl` (새 언어/타입은 `--new <language> <type>` + `manifest.json` 등록). 추가 후 `npm run validate` 통과 필수.
- 내용을 바꾸면 `manifest.json` 의 `dataVersion` 을 올립니다(브라우저 캐시 갱신 기준). 구조가 깨지는 변경은 `schemaVersion` major 와 `/api/v2` 로.

## 다른 IEUM 서비스에서 쓰기
- **JSON 직접**: `backend/data/` 를 그대로 읽습니다 (`manifest.json` 부터).
- **API**: 위 엔드포인트 사용. `GET /search/index` 로 인덱스를 받아 `createSearchEngine()` 에 넣으면 서버 호출 없이 로컬에서 검색됩니다.

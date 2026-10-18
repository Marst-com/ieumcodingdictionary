// 화면에 보이는 한글 라벨. 데이터(JSON)의 id/category 는 영문 그대로 두고 표시만 바꾼다.
export const TYPE_ORDER = ['symbol', 'tag', 'attribute', 'selector', 'property', 'at-rule', 'preprocessor', 'keyword', 'builtin', 'operator', 'type', 'macro', 'constraint', 'annotation', 'function', 'method', 'grammar'];

export const TYPE_LABELS = {
  symbol: '기호', tag: '태그', attribute: '속성', selector: '선택자', property: '프로퍼티',
  'at-rule': '@규칙', preprocessor: '전처리기', keyword: '키워드', builtin: '내장 함수', operator: '연산자', type: '자료형', macro: '매크로',
  constraint: '제약조건', annotation: '애노테이션', function: '함수', method: '메서드', grammar: '문법',
};

export const CATEGORY_LABELS = {
  document: '문서', structure: '구조', text: '텍스트', link: '링크', media: '미디어', list: '목록', table: '표', form: '폼', semantic: '시맨틱', global: '전역 속성',
  layout: '레이아웃', 'box-model': '박스 모델', typography: '타이포그래피', visual: '시각 효과', flexbox: '플렉스박스', grid: '그리드', animation: '애니메이션',
  basic: '기본', combinator: '결합자', 'pseudo-class': '의사 클래스', 'pseudo-element': '의사 요소', conditional: '조건', module: '모듈', value: '값',
  declaration: '선언', 'control-flow': '제어 흐름', function: '함수', async: '비동기', object: '객체', error: '오류 처리', operator: '연산자', comparison: '비교', logical: '논리',
  access: '접근', collection: '컬렉션', arithmetic: '산술', debug: '디버그', array: '배열', json: 'JSON', network: '네트워크', timer: '타이머', number: '숫자',
  expression: '표현식', statement: '문장', resource: '자원', literal: '리터럴', membership: '포함 여부', assignment: '대입', io: '입출력', builtin: '내장 함수',
  bracket: '괄호', separator: '구분자', quote: '따옴표', special: '특수',
  aggregate: '집계 함수', bitwise: '비트 연산', boolean: '불리언', clause: '절', color: '색상', comment: '주석', compiler: '컴파일러', condition: '조건 검사',
  conversion: '변환', core: '핵심 클래스', datetime: '날짜·시간', ddl: '정의(DDL)', dict: '딕셔너리', directive: '지시문', dml: '조작(DML)', embedded: '임베드',
  file: '파일', image: '이미지', integer: '정수', interactive: '상호작용', join: '조인', key: '키', limits: '한계값', math: '수학', memory: '메모리', modifier: '수정자',
  numeric: '숫자', organization: '구조화', pointer: '포인터', qualifier: '한정자', query: '조회', scalar: '스칼라 함수', scope: '범위', scripting: '스크립트',
  set: '집합', string: '문자열', transform: '변형', type: '타입', wrapper: '래퍼 클래스',
  concurrency: '동시성', interface: '인터페이스', primitive: '기본형', range: '범위', testing: '테스트', 'type-operator': '타입 연산', utility: '유틸리티 타입', zero: '제로값',
};

export const WHY_LABELS = { alias: '별칭 일치', concept: '개념 일치', syntax: '문법 일치', description: '설명 일치', facet: '' };

export const typeLabel = (t) => TYPE_LABELS[t] || t;
export const categoryLabel = (c) => CATEGORY_LABELS[c] || c;

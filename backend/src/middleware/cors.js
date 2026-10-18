import cors from 'cors';

// "https://*.vercel.app" 같은 와일드카드를 지원한다.
function toMatcher(pattern) {
  if (pattern === '*') return () => true;
  if (!pattern.includes('*')) return (origin) => origin === pattern;
  const re = new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]+')}$`, 'i');
  return (origin) => re.test(origin);
}

export function corsMiddleware(origins) {
  const matchers = origins.map(toMatcher);
  return cors({
    origin(origin, cb) {
      // Origin 헤더가 없는 요청(서버 간 호출, curl)은 CORS 대상이 아니다.
      if (!origin || matchers.some((m) => m(origin))) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Data-Version'],
    exposedHeaders: ['X-Data-Version', 'ETag'],
    maxAge: 600,
  });
}

import { ApiError } from '../lib/http.js';

/** 현재 데이터 버전을 meta/헤더에 싣고, 다른 버전을 요구하면 409 로 알려준다. */
export function dataVersion(store) {
  return (req, res, next) => {
    res.locals.meta = { schemaVersion: store.schemaVersion, dataVersion: store.dataVersion };
    res.set('X-Data-Version', store.dataVersion);
    const wanted = req.get('x-data-version') || (typeof req.query.dataVersion === 'string' ? req.query.dataVersion : undefined);
    if (wanted && wanted !== store.dataVersion) {
      return next(new ApiError(409, 'DATA_VERSION_UNAVAILABLE', `요청한 데이터 버전(${wanted})은 제공되지 않습니다. 현재 버전: ${store.dataVersion}`));
    }
    return next();
  };
}

/** 지식 데이터 GET 응답은 공용 캐시 가능 (데이터는 배포 시에만 바뀜) */
export function cacheable(seconds = 300) {
  return (req, res, next) => {
    res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 2}`);
    next();
  };
}

// npm run validate — Coding Knowledge JSON 검증 (CI/배포 전 실행 권장)
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { validateDataDir } from '../src/services/data-validator.js';

const dataDir = process.argv[2] ? resolve(process.argv[2]) : resolve(dirname(fileURLToPath(import.meta.url)), '../data');
const { errors, warnings } = validateDataDir(dataDir);
for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(errors.length ? `\n검증 실패: 오류 ${errors.length}건, 경고 ${warnings.length}건` : `\n검증 통과: 오류 0건, 경고 ${warnings.length}건`);
process.exit(errors.length ? 1 : 0);

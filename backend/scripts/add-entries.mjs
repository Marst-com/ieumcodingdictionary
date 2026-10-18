// 데이터 작성 도구: 한 줄에 항목 하나씩(JSON) 표준 입력으로 받아 data 파일에 추가한다. 저장 형식은 기존 파일과 같다.
//   node scripts/add-entries.mjs languages/html/tag.json < entries.jsonl
//   node scripts/add-entries.mjs --new <language> <type> languages/c/keyword.json < entries.jsonl
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../data');
const args = process.argv.slice(2);
let language; let type;
if (args[0] === '--new') { [, language, type] = args; args.splice(0, 3); }
const rel = args[0];
if (!rel) { console.error('usage: add-entries.mjs [--new <language> <type>] <relative file>'); process.exit(2); }
const file = resolve(dataDir, rel);

const lines = readFileSync(0, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
const added = lines.map((l, i) => { try { return JSON.parse(l); } catch (e) { console.error(`줄 ${i + 1}: JSON 오류 — ${e.message}\n  ${l.slice(0, 120)}`); process.exit(1); } });

let doc;
if (language) {
  if (existsSync(file)) { console.error(`이미 있는 파일: ${rel}`); process.exit(1); }
  doc = { schemaVersion: '1.0.0', language, type, entryVersion: '1.0.0', entries: [] };
  mkdirSync(dirname(file), { recursive: true });
} else doc = JSON.parse(readFileSync(file, 'utf8'));

const have = new Set(doc.entries.map((e) => e.id));
for (const e of added) { if (have.has(e.id)) { console.error(`중복 id: ${e.id}`); process.exit(1); } have.add(e.id); }
doc.entries.push(...added);

const head = `{\n  "schemaVersion": "${doc.schemaVersion}", "language": "${doc.language}", "type": "${doc.type}", "entryVersion": "${doc.entryVersion}",\n  "entries": [\n`;
writeFileSync(file, `${head}${doc.entries.map((e) => `    ${JSON.stringify(e)}`).join(',\n')}\n  ]\n}\n`);
console.log(`${rel}: +${added.length} → ${doc.entries.length}`);

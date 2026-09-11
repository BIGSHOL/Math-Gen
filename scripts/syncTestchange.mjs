// node scripts/syncTestchange.mjs <engine-dir> <anon-key-file>
// 키 값은 출력하지 않는다. .env.local(ignored)만 갱신한다.
import fs from 'node:fs';
import path from 'node:path';
const [engineDir, publicKeyFile] = process.argv.slice(2);
if (!engineDir || !publicKeyFile) throw new Error('엔진 폴더와 공개 키 파일을 지정하세요.');
const config = JSON.parse(fs.readFileSync(path.join(engineDir, 'config.json'), 'utf8').replace(/^\uFEFF/, ''));
const anon = fs.readFileSync(publicKeyFile, 'utf8').trim();
const url = config.SUPABASE_URL;
const serviceKey = config.SUPABASE_SERVICE_KEY || config.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || !anon) throw new Error('Supabase 설정이 비어 있습니다.');
if (anon.startsWith('eyJ')) {
  const claims = JSON.parse(Buffer.from(anon.split('.')[1], 'base64url').toString());
  if (claims.role !== 'anon' || claims.ref !== new URL(url).hostname.split('.')[0]) {
    throw new Error('같은 프로젝트의 anon 공개 키가 필요합니다.');
  }
} else if (!anon.startsWith('sb_publishable_')) throw new Error('공개 키 형식이 올바르지 않습니다.');
const check = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon } });
if (!check.ok) throw new Error(`공개 키 검증 실패 (${check.status})`);
const entries = {
  VITE_SUPABASE_URL: url, SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anon,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey, VITE_SUPABASE_ENABLED: 'true', VITE_TESTCHANGE_ENABLED: 'true',
};
let contents = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
for (const [key, value] of Object.entries(entries)) {
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  if (re.test(contents)) contents = contents.replace(re, () => `${key}=${value}`);
  else contents += `\n${key}=${value}\n`;
}
fs.writeFileSync('.env.local', contents);
console.log('testchange Supabase 연결 설정 완료. 공개 키 검증 통과.');

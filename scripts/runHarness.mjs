// 프로젝트에 이미 설치된 esbuild로 TS 회귀 하네스 실행(추가 의존성 없음).
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import path from 'node:path';
const files = process.argv.slice(2);
if (!files.length) throw new Error('실행할 .mts 하네스를 지정하세요.');
for (const file of files) {
  const outfile = path.join(path.dirname(file), `.harness-${process.pid}.local.mjs`);
  try {
    await build({ entryPoints: [file], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      define: { 'import.meta.env': JSON.stringify({ DEV: false }) }, logLevel: 'silent' });
    const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
    if (result.status !== 0) { process.exitCode = result.status || 1; break; }
  } finally { try { unlinkSync(outfile); } catch {} }
}

// node --env-file=.env.local scripts/testchangeFigureAssets.mjs <testchange/db/pages> [--upload]
// Crops go to a private bucket. Existing exams/questions and original PDFs are read-only.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const pages = process.argv[2];
if (!pages) throw new Error('testchange db/pages 경로가 필요합니다.');
const out = '.checks.local/testchange-figures';
await fs.mkdir(out, { recursive: true });
const client = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const rows = [];
for (let offset = 0; ; offset += 500) {
  const { data, error } = await client.from('questions').select('id,exam_id,number,body')
    .order('id').range(offset, offset + 499);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 500) break;
}
const input = '.checks.local/figure-source-rows.json';
await fs.writeFile(input, JSON.stringify(rows));
const result = spawnSync('py', ['-3.11', 'scripts/testchangeFigureAssets.py', '--rows', input,
  '--pages', pages, '--out', out], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
if (process.argv.includes('--upload')) {
  const bucket = 'mathgen-figures';
  const { data: existing } = await client.storage.getBucket(bucket);
  if (!existing) {
    const { error } = await client.storage.createBucket(bucket, { public: false,
      fileSizeLimit: 10 * 1024 * 1024, allowedMimeTypes: ['application/json'] });
    if (error) throw error;
  } else if (existing.public) throw new Error('도형 저장소가 공개로 설정되어 있습니다.');
  let count = 0;
  for (const file of await fs.readdir(out)) {
    if (!/^\d+\.json$/.test(file)) continue;
    const { error } = await client.storage.from(bucket).upload(`exams/${file}`,
      await fs.readFile(`${out}/${file}`), { contentType: 'application/json', upsert: true });
    if (error) throw error;
    count++;
  }
  console.log(`Uploaded ${count} exam figure manifests to private storage.`);
}

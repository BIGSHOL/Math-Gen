import type { SupabaseClient } from '@supabase/supabase-js';
import type { EngineBlock, EngineQuestion, TestchangeExamData } from '../src/types/testchange.js';
import { figureAssetKey, visitEngineFigures } from '../src/lib/testchangeFigures.js';

/** Only the authenticated API reads this private bucket; never expose source filesystem paths. */
export async function restoreStoredFigures(client: SupabaseClient, data: TestchangeExamData): Promise<void> {
  const { data: asset } = await client.storage.from('mathgen-figures').download(`exams/${data.exam.id}.json`);
  if (!asset) return;
  let manifest: { schema?: number; crops?: Record<string, string>; moves?: Record<string, number> };
  try { manifest = JSON.parse(await asset.text()); } catch { return; }
  if (manifest.schema !== 1 || !manifest.crops) return;
  for (const q of data.questions) visitEngineFigures(q.body, b => {
    if (b.crop || b.svg || b.spec) return;
    const crop = manifest.crops?.[figureAssetKey(q.id, b)];
    if (typeof crop === 'string' && crop.startsWith('data:image/png;base64,')) b.crop = crop;
  });
  // Legacy text-layer extraction appended left-column pictures to right-column questions.
  // Move only when a source-PDF question anchor establishes the owner, and a crop exists.
  const relocated: Array<{ target: number; block: EngineBlock }> = [];
  const walk = (q: EngineQuestion, id: number) => {
    q.contents = q.contents?.filter(b => {
      if (b.type !== 'figure' || !b.crop) return true;
      const target = manifest.moves?.[figureAssetKey(id, b)];
      if (!target || target === id || !data.questions.some(row => row.id === target)) return true;
      relocated.push({ target, block: b }); return false;
    });
    for (const c of q.choices ?? []) walk(c, id);
    for (const sub of q.sub_questions ?? []) walk(sub, id);
  };
  for (const q of data.questions) walk(q.body, q.id);
  for (const { target, block } of relocated) {
    const q = data.questions.find(row => row.id === target)!;
    (q.body.contents ??= []).push(block);
  }
}

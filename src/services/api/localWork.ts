import { openDB } from 'idb';
import { authClient } from './supabase';
import type { TestPaper } from '../../types';
import type { WizardHydrateSnapshot, WizardState } from '../../stores/wizardStore';

// testchange 원본 DB는 그대로 유지하고 사용자의 편집본은 이 브라우저에 저장한다.
const db = () => openDB('mathgen-testchange-work', 1, {
  upgrade(database) { database.createObjectStore('work', { keyPath: 'key' }); },
});
type Work = { key: string; owner: string; test: TestPaper; snapshot?: WizardHydrateSnapshot };
const owner = async () => (await authClient?.auth.getSession())?.data.session?.user.id ?? 'local';
let writes: Promise<unknown> = Promise.resolve();

async function update(id: string, apply: (previous?: Work) => Work | undefined) {
  const user = owner();
  const operation = writes.then(async () => {
    const userId = await user;
    const key = `${userId}:${id}`;
    const database = await db();
    try {
      const previous = await database.get('work', key) as Work | undefined;
      const work = apply(previous);
      if (work) await database.put('work', { ...work, key, owner: userId });
      else await database.delete('work', key);
    } finally { database.close(); }
  });
  writes = operation.catch(() => {});
  return operation;
}

export async function loadLocalWorks(): Promise<Work[]> {
  await writes;
  const userId = await owner();
  const database = await db();
  try { return ((await database.getAll('work')) as Work[]).filter(w => w.owner === userId); }
  finally { database.close(); }
}
export const loadLocalWork = async (id: string) => (await loadLocalWorks()).find(w => w.test.id === id);
export const saveLocalTest = (test: TestPaper) => update(test.id, previous => ({ ...previous, key: '', owner: '', test }));
export const removeLocalWork = (id: string) => update(id, () => undefined);
export const renameLocalWork = (id: string, title: string) => update(id, previous => previous ? { ...previous, test: { ...previous.test, title } } : undefined);
export const saveLocalSnapshot = (snapshot: WizardHydrateSnapshot) => update(snapshot.testId,
  previous => previous ? { ...previous, snapshot } : undefined);

export function saveLocalWizard(state: WizardState) {
  if (!state.testId || state.testId.startsWith('testchange:')) return Promise.resolve();
  const snapshot: WizardHydrateSnapshot = {
    testId: state.testId, step: state.step, selectedGrade: state.selectedGrade,
    examCategory: state.examCategory, uploadedFileName: state.uploadedFileName,
    goal: state.goal, printOptions: state.printOptions,
    printMeta: state.printMeta, filename: state.filename, format: state.format,
    exportSource: state.exportSource, bundle: state.bundle, difficulty: state.difficulty,
    extras: state.extras, skipSolutions: state.skipSolutions, furthestStep: state.furthestStep,
    pages: state.pages.map(p => ({ ...p, ocrInflightModel: undefined, ocrStartedAt: undefined,
      upgrading: false, cropDetectInflight: false, ocrTextLayerWarning: undefined,
      ocrResult: p.ocrResult.map(item => ({ ...item, solutionGenerating: false, solutionStartedAt: undefined })) })),
    problems: state.problems.map(p => ({ ...p, generating: false, generatingStartedAt: undefined })),
  };
  return update(state.testId, previous => ({ key: '', owner: '', snapshot,
    test: { ...(previous?.test ?? {
      id: state.testId!, title: state.uploadedFileName?.replace(/\.pdf$/i, '') || '변환 작업',
      subject: '수학', grade: state.selectedGrade ?? '', tags: ['내 작업'],
      createdAt: new Date().toISOString(), topicDistribution: [], variants: [], problems: [],
    }), problemCount: snapshot.pages.reduce((n, p) => n + p.ocrResult.length, 0),
    status: state.step >= 5 ? 'ok' : 'draft', statusText: '이 브라우저에 저장', time: '오늘',
    furthestStep: state.furthestStep },
  }));
}

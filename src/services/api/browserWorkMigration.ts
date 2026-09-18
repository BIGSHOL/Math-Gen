import { deleteDB, openDB } from 'idb';
import type { TestPaper } from '../../types';
import type { WizardHydrateSnapshot } from '../../stores/wizardStore';
import { useWizardStore } from '../../stores/wizardStore';
import { getPageImage, getPdfBlob, getThumbnail } from '../../lib/imageStore';
import { authClient, workDb } from './supabase';
import { testPaperToTestInsert, wizardSettingsOf } from './mappers';
import { upsertTest } from './tests';
import { uploadPdf } from './storage';
import { isUuid, testStatusOf, withUuidIds, writeWorkSnapshot } from './workPersist';
import { suspendWizardSync } from './wizardSync';

/**
 * 예전 testchange 모드는 사용자 편집본을 이 브라우저의 IndexedDB 에만 저장했다
 * ("이 브라우저에 저장"). 이제 모든 작업은 DB 에 저장하므로, 남아 있는 편집본을
 * 로그인한 사용자 계정으로 한 번 옮기고 브라우저 사본을 지운다. 옮기지 못한
 * 편집본은 브라우저에 그대로 두고 다음 접속 때 다시 시도한다.
 */
const LEGACY_DB = 'mathgen-testchange-work';

interface LegacyWork {
  key: string;
  owner: string;
  test: TestPaper;
  snapshot?: WizardHydrateSnapshot;
}

export interface MigrationResult {
  moved: number;
  failed: number;
  /** DB 스키마(patch-testchange-work.sql)가 아직이라 보류한 편집본 수. */
  waiting: number;
}

let running: Promise<MigrationResult> | null = null;

/** 브라우저에 남은 편집본을 DB 로 옮긴다. 동시 호출은 한 번의 실행을 공유한다. */
export const migrateBrowserWorks = (): Promise<MigrationResult> => {
  running ??= run().finally(() => { running = null; });
  return running;
};

const legacyDbExists = async (): Promise<boolean> => {
  if (typeof indexedDB === 'undefined') return false;
  if (typeof indexedDB.databases !== 'function') return true; // 확인 불가 — 열어서 본다
  try {
    return (await indexedDB.databases()).some((db) => db.name === LEGACY_DB);
  } catch {
    return true;
  }
};

/**
 * 소수 배점(printed_score)·위자드 설정(settings) 컬럼이 있어야 옮긴 뒤 브라우저
 * 사본을 지워도 손실이 없다. 없으면 이전을 보류한다.
 */
const workSchemaReady = async (): Promise<boolean> => {
  if (!workDb) return false;
  const [problems, tests] = await Promise.all([
    workDb.from('ocr_problems').select('printed_score').limit(1),
    workDb.from('tests').select('settings').limit(1),
  ]);
  return !problems.error && !tests.error;
};

async function run(): Promise<MigrationResult> {
  const result: MigrationResult = { moved: 0, failed: 0, waiting: 0 };
  if (!workDb || !(await legacyDbExists())) return result;
  const userId = (await authClient?.auth.getSession())?.data.session?.user.id;
  if (!userId) return result;
  const db = await openDB(LEGACY_DB, 1, {
    upgrade(database) { database.createObjectStore('work', { keyPath: 'key' }); },
  });
  let remaining = 1;
  try {
    const works = ((await db.getAll('work')) as LegacyWork[]).filter((w) => w.owner === userId);
    if (works.length > 0 && !(await workSchemaReady())) {
      result.waiting = works.length;
      return result;
    }
    for (const work of works) {
      const ok = await moveWork(work).catch((err) => {
        console.warn('[browserWorkMigration] 이전 실패:', work.test?.title, err);
        return false;
      });
      if (ok) {
        await db.delete('work', work.key);
        result.moved++;
      } else {
        result.failed++;
      }
    }
    remaining = await db.count('work');
  } finally {
    db.close();
  }
  // 다른 계정의 편집본이 남아 있으면 그 계정이 로그인할 때 옮긴다.
  if (remaining === 0) void deleteDB(LEGACY_DB).catch(() => {});
  return result;
}

async function moveWork(work: LegacyWork): Promise<boolean> {
  const testId = isUuid(work.test.id) ? work.test.id : crypto.randomUUID();
  const legacy = work.test.statusText === '이 브라우저에 저장';
  if (!work.snapshot) {
    return Boolean(await upsertTest({
      ...testPaperToTestInsert({ ...work.test, statusText: legacy ? '' : work.test.statusText }),
      id: testId,
      ...(work.test.createdAt ? { created_at: work.test.createdAt } : {}),
    }));
  }
  const { snapshot, ids } = withUuidIds({ ...work.snapshot, testId });
  const status = testStatusOf(snapshot.pages);
  const saved = await writeWorkSnapshot(
    {
      ...testPaperToTestInsert(work.test, {
        exam_category: snapshot.examCategory,
        uploaded_file_name: snapshot.uploadedFileName,
      }),
      id: testId,
      ...(work.test.createdAt ? { created_at: work.test.createdAt } : {}),
      problem_count: status.problem_count,
      status: status.status,
      status_text: legacy ? status.status_text : work.test.statusText,
      furthest_step: snapshot.furthestStep ?? work.test.furthestStep ?? snapshot.step,
      settings: wizardSettingsOf(snapshot),
    },
    snapshot,
    async (page) => ({
      image: page.imageRef ? (await getPageImage(page.imageRef))?.dataUrl ?? null : null,
      thumb: page.thumbRef ? (await getThumbnail(page.thumbRef))?.dataUrl ?? null : null,
    }),
  );
  if (!saved) return false;
  // 업로드 원본 PDF 도 있으면 함께 보관 (없거나 실패해도 작업 자체는 이미 저장됨).
  const pdf = await getPdfBlob(work.test.id).catch(() => undefined);
  if (pdf) await uploadPdf(testId, pdf);
  remapOpenWizard(work.test.id, testId, ids);
  return true;
}

/** 열려 있는 위자드가 이 편집본이면 새 id 로 맞춘다 — 이후 변경이 DB 행에 동기화되도록. */
function remapOpenWizard(oldTestId: string, testId: string, ids: Map<string, string>): void {
  const state = useWizardStore.getState();
  if (state.testId !== oldTestId || (oldTestId === testId && ids.size === 0)) return;
  const map = (id: string) => ids.get(id) ?? id;
  suspendWizardSync(() => useWizardStore.setState({
    testId,
    pages: state.pages.map((page) => ({
      ...page,
      id: map(page.id),
      ocrResult: page.ocrResult.map((item) => ({ ...item, id: map(item.id) })),
    })),
    problems: state.problems.map((review) => ({ ...review, id: map(review.id) })),
  }));
}

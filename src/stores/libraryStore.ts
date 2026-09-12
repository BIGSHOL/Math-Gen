import { create } from "zustand";
import type { TestPaper } from "@app/types";
import type { Collection, GradeKey, SortKey } from "@app/lib/libraryFilter";
import {
  deleteTest as dbDeleteTest,
  loadTests,
  updateTest as dbUpdateTest,
  upsertTest as dbUpsertTest,
} from "@app/services/api/tests";
import { removeTestFolder } from "@app/services/api/storage";
import { testPaperToTestInsert } from "@app/services/api/mappers";
import { TESTCHANGE_ENABLED, loadTestchangeExams } from '../services/api/testchange';
import { testchangeExamToTest } from '../lib/testchangeAdapter';
import { isTestchangeId } from '../types/testchange';
import { loadLocalWorks, saveLocalTest, removeLocalWork, renameLocalWork } from '../services/api/localWork';

/**
 * Library screen data source.
 *
 * Phase A (완료):   in-memory MOCK_TESTS
 * Phase B (이번):   Supabase `tests` 테이블 hydrate + dual-write
 * Phase E (후속):   Auth → 사용자별 격리
 *
 * **Feature flag** — `SUPABASE_ENABLED=false` 면 `loadTests` / `dbUpsertTest` /
 * `dbDeleteTest` 모두 null/false 반환 → 메모리 + MOCK fallback.
 */

export interface LibraryState {
  tests: TestPaper[];
  hydrated: boolean;
  error: string | null;
  viewState: { collection: Collection; grade?: GradeKey; selectedTags: ReadonlySet<string>; sort: SortKey; view: "grid" | "list"; searchQuery: string };
  setViewState: (patch: Partial<LibraryState["viewState"]>) => void;

  hydrate: () => Promise<void>;
  upsertTest: (test: TestPaper) => void;
  removeTest: (id: string) => void;
  renameTest: (id: string, title: string) => void;
  getTest: (id: string) => TestPaper | undefined;
  /** 신원 변경(로그인/로그아웃) 시 호출 — 다음 hydrate 가 새 사용자 데이터로 재실행. */
  reset: () => void;
}

let hydrateVersion = 0;
let hydrating: Promise<void> | null = null;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  tests: [],
  hydrated: false,
  error: null,
  viewState: { collection: "전체", selectedTags: new Set(), sort: "recent", view: "grid", searchQuery: "" },
  setViewState: patch => set(state => ({ viewState: { ...state.viewState, ...patch } })),

  hydrate: async () => {
    if (get().hydrated) return;
    if (hydrating) return hydrating;
    const version = hydrateVersion;
    const commit = (patch: Partial<LibraryState>) => {
      if (version === hydrateVersion) set(patch);
    };
    const operation = (async () => {
      if (TESTCHANGE_ENABLED) {
        try {
          const [exams, local] = await Promise.all([loadTestchangeExams(), loadLocalWorks()]);
          commit({ tests: [...local.map(w => w.test), ...exams.map(testchangeExamToTest)], hydrated: true, error: null });
        } catch (error) {
          commit({ hydrated: true, error: (error as Error).message });
        }
        return;
      }
      // 기존 MathGen 데이터베이스 모드.
      const dbTests = await loadTests();
      if (dbTests) {
        commit({ tests: dbTests, hydrated: true });
        return;
      }
      const { MOCK_TESTS } = await import("@app/constants/mockTests");
      commit({ tests: MOCK_TESTS, hydrated: true });
    })();
    hydrating = operation;
    try { await operation; }
    finally { if (hydrating === operation) hydrating = null; }
  },

  upsertTest: (test) => {
    if (isTestchangeId(test.id)) return;
    // 메모리 즉시 반영 (UI 빠른 응답)
    set((state) => {
      const idx = state.tests.findIndex((t) => t.id === test.id);
      if (idx === -1) return { tests: [test, ...state.tests] };
      const next = [...state.tests];
      next[idx] = test;
      return { tests: next };
    });
    // Supabase background sync — 실패해도 메모리는 유지
    if (TESTCHANGE_ENABLED) { void saveLocalTest(test).catch(console.error); return; }
    void dbUpsertTest(testPaperToTestInsert(test)).catch((err) => {
      console.warn("[libraryStore] upsertTest sync failed:", err);
    });
  },

  removeTest: (id) => {
    if (isTestchangeId(id)) return;
    set((state) => ({ tests: state.tests.filter((t) => t.id !== id) }));
    if (TESTCHANGE_ENABLED) { void removeLocalWork(id).catch(console.error); return; }
    // DB + Storage 병렬 cleanup (cascade 는 DB 가 알아서 처리)
    void Promise.all([dbDeleteTest(id), removeTestFolder(id)]).catch((err) => {
      console.warn("[libraryStore] removeTest sync failed:", err);
    });
  },

  // 제목 변경 (사용자 보고 2026-06-02): 로컬 즉시 반영 + DB persist (updateTest).
  renameTest: (id, title) => {
    if (isTestchangeId(id)) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    set((state) => ({
      tests: state.tests.map((t) => (t.id === id ? { ...t, title: trimmed } : t)),
    }));
    if (TESTCHANGE_ENABLED) { void renameLocalWork(id, trimmed).catch(console.error); return; }
    void dbUpdateTest(id, { title: trimmed }).catch((err) => {
      console.warn("[libraryStore] renameTest sync failed:", err);
    });
  },

  getTest: (id) => get().tests.find((t) => t.id === id),

  reset: () => {
    hydrateVersion++;
    hydrating = null;
    set({ tests: [], hydrated: false, error: null, viewState: { collection: "전체", selectedTags: new Set(), sort: "recent", view: "grid", searchQuery: "" } });
  },
}));

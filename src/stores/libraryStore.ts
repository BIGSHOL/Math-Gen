import { create } from "zustand";
import type { TestPaper } from "@app/types";
import {
  deleteTest as dbDeleteTest,
  loadTests,
  upsertTest as dbUpsertTest,
} from "@app/services/api/tests";
import { removeTestFolder } from "@app/services/api/storage";
import { testPaperToTestInsert } from "@app/services/api/mappers";

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

  hydrate: () => Promise<void>;
  upsertTest: (test: TestPaper) => void;
  removeTest: (id: string) => void;
  getTest: (id: string) => TestPaper | undefined;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  tests: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    // 1. Supabase 시도
    const dbTests = await loadTests();
    if (dbTests) {
      set({ tests: dbTests, hydrated: true });
      return;
    }
    // 2. Fallback — SUPABASE_ENABLED=false 또는 호출 실패. MOCK 으로.
    const { MOCK_TESTS } = await import("@app/constants/mockTests");
    set({ tests: MOCK_TESTS, hydrated: true });
  },

  upsertTest: (test) => {
    // 메모리 즉시 반영 (UI 빠른 응답)
    set((state) => {
      const idx = state.tests.findIndex((t) => t.id === test.id);
      if (idx === -1) return { tests: [test, ...state.tests] };
      const next = [...state.tests];
      next[idx] = test;
      return { tests: next };
    });
    // Supabase background sync — 실패해도 메모리는 유지
    void dbUpsertTest(testPaperToTestInsert(test)).catch((err) => {
      console.warn("[libraryStore] upsertTest sync failed:", err);
    });
  },

  removeTest: (id) => {
    set((state) => ({ tests: state.tests.filter((t) => t.id !== id) }));
    // DB + Storage 병렬 cleanup (cascade 는 DB 가 알아서 처리)
    void Promise.all([dbDeleteTest(id), removeTestFolder(id)]).catch((err) => {
      console.warn("[libraryStore] removeTest sync failed:", err);
    });
  },

  getTest: (id) => get().tests.find((t) => t.id === id),
}));

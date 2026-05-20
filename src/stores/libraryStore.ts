import { create } from "zustand";
import type { TestPaper } from "@app/types";

/**
 * Library screen data source.
 *
 * Phase 2 (initial): seeded from `MOCK_TESTS` in-memory.
 * Phase 2 (late):    swapped for IndexedDB-backed persistence via `idb`.
 * Phase 6+:          swapped again for a backend DB.
 *
 * The store API stays stable across all three transitions — only the
 * `hydrate()` implementation changes.
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
    // Phase 2 initial: in-memory mock. Replace with IndexedDB load later.
    if (get().hydrated) return;
    const { MOCK_TESTS } = await import("@app/constants/mockTests");
    set({ tests: MOCK_TESTS, hydrated: true });
  },

  upsertTest: (test) =>
    set((state) => {
      const idx = state.tests.findIndex((t) => t.id === test.id);
      if (idx === -1) return { tests: [test, ...state.tests] };
      const next = [...state.tests];
      next[idx] = test;
      return { tests: next };
    }),

  removeTest: (id) =>
    set((state) => ({ tests: state.tests.filter((t) => t.id !== id) })),

  getTest: (id) => get().tests.find((t) => t.id === id),
}));

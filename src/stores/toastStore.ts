// toastStore.ts (Phase I-9)
//
// 글로벌 toast 알림 — zustand store. `showToast(...)` 한 줄 호출로 화면 우상단
// 에 알림 표시 + 자동 dismiss (기본 3초).
//
// 사용:
//   import { showToast } from "@app/stores/toastStore";
//   showToast({ kind: "success", message: "검수 완료" });
//
// **렌더**: App.tsx 마운트 시 `<ToastContainer />` 한 번. 모든 페이지에서
// 공통 노출.
//
// **kind** (4 종):
//   - info    — 기본 안내 (accent)
//   - success — 성공 (녹색)
//   - warn    — 경고 (주황)
//   - error   — 에러 (빨강)

import { create } from "zustand";

export type ToastKind = "info" | "success" | "warn" | "error";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  /** 자동 dismiss 까지 ms. 기본 3000. 0 이면 manual only (dismiss 버튼). */
  durationMs?: number;
  /** 생성 timestamp — animation 시작 시점 추적. */
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  show: (input: Omit<Toast, "id" | "createdAt">) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (input) => {
    const id = crypto.randomUUID();
    const toast: Toast = {
      id,
      kind: input.kind,
      message: input.message,
      durationMs: input.durationMs ?? 3000,
      createdAt: Date.now(),
    };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    // 자동 dismiss (durationMs > 0 일 때만)
    if (toast.durationMs && toast.durationMs > 0) {
      setTimeout(() => {
        get().dismiss(id);
      }, toast.durationMs);
    }
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Convenience helper — store 의 show action 그대로 노출. 컴포넌트 밖에서도 호출 가능. */
export const showToast = (input: Omit<Toast, "id" | "createdAt">): string =>
  useToastStore.getState().show(input);

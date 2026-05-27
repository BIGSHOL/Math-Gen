// Toast.tsx (Phase I-9)
//
// 글로벌 toast 알림 UI — ToastContainer (fixed 우상단) + 개별 Toast.
// App.tsx 마운트 시 한 번 렌더하면 어디서든 `showToast(...)` 호출로 표시.
//
// 디자인:
//   - 우상단 fixed (top: 16px, right: 16px)
//   - 다중 toast 시 세로 stack (gap: 8px)
//   - kind 별 색상 + icon + message + dismiss(✕) 버튼
//   - max-width 360px — 긴 메시지 자동 줄바꿈

import { Icon } from "./Icon";
import { useToastStore, type ToastKind } from "@app/stores/toastStore";

const KIND_STYLE: Record<
  ToastKind,
  { bg: string; border: string; fg: string; icon: string; iconColor: string }
> = {
  info: {
    bg: "#EFF6FF",
    border: "#BFDBFE",
    fg: "#1E40AF",
    icon: "info",
    iconColor: "#3B82F6",
  },
  success: {
    bg: "#ECFDF5",
    border: "#A7F3D0",
    fg: "#065F46",
    icon: "check-circle",
    iconColor: "#10B981",
  },
  warn: {
    bg: "#FFFBEB",
    border: "#FDE68A",
    fg: "#92400E",
    icon: "warning",
    iconColor: "#F59E0B",
  },
  error: {
    bg: "#FEF2F2",
    border: "#FECACA",
    fg: "#991B1B",
    icon: "x-circle",
    iconColor: "#EF4444",
  },
};

export const ToastContainer = () => {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      role="region"
      aria-label="알림"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const style = KIND_STYLE[t.kind];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-2 px-3 py-2.5 rounded-r2 shadow-lg max-w-[360px] text-small border"
            style={{
              background: style.bg,
              borderColor: style.border,
              color: style.fg,
            }}
            role="alert"
          >
            <Icon
              name={style.icon}
              size={16}
              color={style.iconColor}
              weight="fill"
              className="flex-shrink-0 mt-0.5"
            />
            <span className="flex-1 leading-relaxed">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="닫기"
            >
              <Icon name="x" size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastContainer;

import { type FormEvent, useEffect, useState } from "react";
import { Btn, Icon, Input } from "@app/components/ui";
import { useAuthStore } from "@app/stores/authStore";

/**
 * Phase G — 로그인 상태에서 비밀번호를 변경하는 모달 콘텐츠.
 *
 * UserMenu 가 ModalShell 안에 직접 렌더한다. supabase 의 updateUser 는 현재
 * 비밀번호 재확인 없이 갱신하므로 새 비밀번호 + 확인만 받는다. 모달이 열릴
 * 때마다 새로 mount 되므로 이전 시도의 stale 에러를 mount 시 1회 정리한다.
 */
export const PasswordChangeModal = ({ onClose }: { onClose: () => void }) => {
  const updatePassword = useAuthStore((s) => s.updatePassword);
  const clearError = useAuthStore((s) => s.clearError);
  const actionPending = useAuthStore((s) => s.actionPending);
  const actionError = useAuthStore((s) => s.actionError);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (actionPending) return;
    if (password !== confirm) {
      setLocalError("두 비밀번호가 일치하지 않습니다.");
      return;
    }
    setLocalError(null);
    clearError();
    const ok = await updatePassword(password);
    if (ok) setDone(true);
  };

  const error = localError ?? actionError;

  return (
    <div className="flex flex-col w-[380px] max-w-[92vw]">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-line flex justify-between items-center">
        <div id="password-change-title" className="text-h3 text-text">
          비밀번호 변경
        </div>
        <Btn kind="ghost" size="sm" icon="x" onClick={onClose} aria-label="닫기" />
      </div>

      {done ? (
        <div className="p-6 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-accent-soft grid place-items-center mb-3">
            <Icon name="check" size={24} className="text-accent" weight="bold" />
          </div>
          <div className="text-body text-text">비밀번호가 변경되었습니다.</div>
          <Btn type="button" kind="accent" full className="mt-5" onClick={onClose}>
            확인
          </Btn>
        </div>
      ) : (
        <form onSubmit={submit} className="p-5 flex flex-col gap-3">
          <Input
            label="새 비밀번호"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setLocalError(null);
            }}
            placeholder="6자 이상"
            autoComplete="new-password"
            minLength={6}
            autoFocus
            required
            disabled={actionPending}
          />
          <Input
            label="새 비밀번호 확인"
            type="password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setLocalError(null);
            }}
            placeholder="다시 입력"
            autoComplete="new-password"
            minLength={6}
            required
            disabled={actionPending}
          />

          {error && (
            <div className="flex items-start gap-1.5 rounded-r2 bg-danger-soft border border-[#FEE2E2] text-danger text-caption px-3 py-2">
              <Icon name="warning-circle" size={14} weight="fill" className="flex-shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-1">
            <Btn type="button" kind="ghost" onClick={onClose} disabled={actionPending}>
              취소
            </Btn>
            <Btn type="submit" kind="accent" disabled={actionPending}>
              {actionPending ? "처리 중…" : "변경"}
            </Btn>
          </div>
        </form>
      )}
    </div>
  );
};

export default PasswordChangeModal;

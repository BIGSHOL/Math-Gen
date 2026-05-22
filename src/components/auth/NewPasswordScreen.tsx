import { type FormEvent, useState } from "react";
import { Btn, Card, Icon, Input, Logo } from "@app/components/ui";
import { useAuthStore } from "@app/stores/authStore";

/**
 * Phase G — 새 비밀번호 설정 화면 (비밀번호 재설정 복구 흐름).
 *
 * 사용자가 재설정 메일의 링크를 클릭해 돌아오면 supabase 가 PASSWORD_RECOVERY
 * 이벤트를 발생시키고 authStore.recoveryMode 가 켜진다. AuthGate 는 그때 이
 * 화면을 렌더한다 (children 의 h-screen 래퍼 밖이라 자체 전체화면 래퍼 보유).
 *
 * updatePassword 성공 시 recoveryMode 가 해제되며 AuthGate 가 앱으로 전환한다
 * (복구 세션이 곧 정식 로그인 세션). 취소 시 signOut → 로그인 화면.
 */
export const NewPasswordScreen = () => {
  const user = useAuthStore((s) => s.user);
  const updatePassword = useAuthStore((s) => s.updatePassword);
  const signOut = useAuthStore((s) => s.signOut);
  const clearError = useAuthStore((s) => s.clearError);
  const actionPending = useAuthStore((s) => s.actionPending);
  const actionError = useAuthStore((s) => s.actionError);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (actionPending) return;
    if (password !== confirm) {
      setLocalError("두 비밀번호가 일치하지 않습니다.");
      return;
    }
    setLocalError(null);
    clearError();
    await updatePassword(password);
    // 성공 시 recoveryMode 해제 → AuthGate 가 앱으로 전환, 이 컴포넌트 언마운트.
    // 실패 시 actionError 가 표시된다.
  };

  const error = localError ?? actionError;

  return (
    <div className="w-full h-screen overflow-hidden bg-bg text-text font-sans flex items-center justify-center p-6">
      <Card pad={28} className="w-[380px] max-w-full">
        <div className="flex justify-center mb-5">
          <Logo size={26} />
        </div>
        <div className="text-h3 text-text text-center">새 비밀번호 설정</div>
        <p className="text-small text-muted text-center mt-1">
          {user?.email ? (
            <>
              <span className="text-text2 font-medium">{user.email}</span> 계정의 새
              비밀번호를 입력하세요.
            </>
          ) : (
            "재설정 링크로 접속하셨습니다. 새 비밀번호를 입력하세요."
          )}
        </p>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
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

          <Btn type="submit" kind="accent" size="lg" full className="mt-1" disabled={actionPending}>
            {actionPending ? "처리 중…" : "비밀번호 변경"}
          </Btn>
        </form>

        <div className="mt-4 text-center text-small text-muted">
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={actionPending}
            className="text-accent font-medium hover:underline disabled:opacity-50"
          >
            취소하고 로그인 화면으로
          </button>
        </div>
      </Card>
    </div>
  );
};

export default NewPasswordScreen;

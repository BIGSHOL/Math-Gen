import { type FormEvent, useState } from "react";
import { Btn, Card, Icon, Input, Logo } from "@app/components/ui";
import { useAuthStore } from "@app/stores/authStore";

type Mode = "login" | "signup" | "reset";

/** 회원가입·재설정 메일 발송 후 확인 화면 정보. */
type Sent = { kind: "signup" | "reset"; email: string };

const MODE_TEXT: Record<Mode, { title: string; sub: string; button: string }> = {
  login: { title: "로그인", sub: "시험지 변환을 계속하려면 로그인하세요.", button: "로그인" },
  signup: { title: "회원가입", sub: "이메일로 새 계정을 만듭니다.", button: "회원가입" },
  reset: {
    title: "비밀번호 재설정",
    sub: "가입한 이메일로 재설정 링크를 보내드립니다.",
    button: "재설정 메일 보내기",
  },
};

/**
 * Phase G — 로그인 / 회원가입 / 비밀번호 재설정 요청 화면.
 *
 * AuthGate 가 (Supabase 활성 + 비로그인 + 비복구) 일 때 children 대신 렌더한다.
 * children 의 `h-screen` 래퍼를 거치지 않으므로 자체 전체 화면 래퍼를 갖는다.
 *
 * 화면:
 *   - login / signup / reset — 이메일·비밀번호 폼
 *   - sent — 회원가입 확인 메일 또는 재설정 메일 발송 완료 안내
 *
 * 재설정 메일 링크를 클릭해 돌아오면 NewPasswordScreen 이 따로 처리한다
 * (authStore.recoveryMode + AuthGate).
 */
export const AuthScreen = () => {
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);
  const clearError = useAuthStore((s) => s.clearError);
  const actionPending = useAuthStore((s) => s.actionPending);
  const actionError = useAuthStore((s) => s.actionError);

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState<Sent | null>(null);

  const goMode = (next: Mode) => {
    setMode(next);
    clearError();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (actionPending) return;
    const mail = email.trim();
    if (mode === "login") {
      await signIn(mail, password);
    } else if (mode === "signup") {
      const { needsConfirm } = await signUp(mail, password);
      if (needsConfirm) setSent({ kind: "signup", email: mail });
      // 즉시 로그인된 경우 onAuthStateChange 가 AuthGate 를 children 으로 전환.
    } else {
      const ok = await requestPasswordReset(mail);
      if (ok) setSent({ kind: "reset", email: mail });
    }
  };

  const screenWrap =
    "w-full h-screen overflow-hidden bg-bg text-text font-sans flex items-center justify-center p-6";

  // ── 메일 발송 완료 안내 ──────────────────────────────────────────────
  if (sent) {
    const isSignup = sent.kind === "signup";
    return (
      <div className={screenWrap}>
        <Card pad={28} className="w-[380px] max-w-full text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-accent-soft grid place-items-center">
              <Icon name="envelope-simple" size={24} className="text-accent" weight="bold" />
            </div>
          </div>
          <div className="text-h3 text-text">
            {isSignup ? "확인 메일을 보냈습니다" : "재설정 메일을 보냈습니다"}
          </div>
          <p className="text-small text-muted mt-2 leading-relaxed">
            <span className="text-text2 font-medium">{sent.email}</span> 으로 보낸 메일의
            링크를 클릭하면 {isSignup ? "가입이 완료됩니다" : "새 비밀번호를 설정할 수 있습니다"}.
          </p>
          <Btn
            kind="secondary"
            full
            className="mt-5"
            onClick={() => {
              setSent(null);
              goMode("login");
              setPassword("");
            }}
          >
            로그인으로 돌아가기
          </Btn>
        </Card>
      </div>
    );
  }

  // ── 로그인 / 회원가입 / 재설정 요청 폼 ───────────────────────────────
  const t = MODE_TEXT[mode];
  const showPassword = mode !== "reset";

  return (
    <div className={screenWrap}>
      <Card pad={28} className="w-[380px] max-w-full">
        <div className="flex justify-center mb-5">
          <Logo size={26} />
        </div>
        <div className="text-h3 text-text text-center">{t.title}</div>
        <p className="text-small text-muted text-center mt-1">{t.sub}</p>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
          <Input
            label="이메일"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teacher@example.com"
            autoComplete="email"
            autoFocus
            required
            disabled={actionPending}
          />
          {showPassword && (
            <Input
              label="비밀번호"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              required
              disabled={actionPending}
            />
          )}

          {mode === "login" && (
            <div className="text-right -mt-1">
              <button
                type="button"
                onClick={() => goMode("reset")}
                disabled={actionPending}
                className="text-caption text-muted hover:text-accent hover:underline disabled:opacity-50"
              >
                비밀번호를 잊으셨나요?
              </button>
            </div>
          )}

          {actionError && (
            <div className="flex items-start gap-1.5 rounded-r2 bg-danger-soft border border-[#FEE2E2] text-danger text-caption px-3 py-2">
              <Icon name="warning-circle" size={14} weight="fill" className="flex-shrink-0 mt-px" />
              <span>{actionError}</span>
            </div>
          )}

          <Btn type="submit" kind="accent" size="lg" full className="mt-1" disabled={actionPending}>
            {actionPending ? "처리 중…" : t.button}
          </Btn>
        </form>

        <div className="mt-4 text-center text-small text-muted">
          {mode === "login" && (
            <>
              계정이 없으신가요?{" "}
              <button
                type="button"
                onClick={() => goMode("signup")}
                disabled={actionPending}
                className="text-accent font-medium hover:underline disabled:opacity-50"
              >
                회원가입
              </button>
            </>
          )}
          {mode === "signup" && (
            <>
              이미 계정이 있으신가요?{" "}
              <button
                type="button"
                onClick={() => goMode("login")}
                disabled={actionPending}
                className="text-accent font-medium hover:underline disabled:opacity-50"
              >
                로그인
              </button>
            </>
          )}
          {mode === "reset" && (
            <button
              type="button"
              onClick={() => goMode("login")}
              disabled={actionPending}
              className="text-accent font-medium hover:underline disabled:opacity-50"
            >
              로그인으로 돌아가기
            </button>
          )}
        </div>
      </Card>
    </div>
  );
};

export default AuthScreen;

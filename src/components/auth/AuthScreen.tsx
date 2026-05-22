import { type FormEvent, useState } from "react";
import { Btn, Card, Icon, Input, Logo } from "@app/components/ui";
import { useAuthStore } from "@app/stores/authStore";

type Mode = "login" | "signup";

/**
 * Phase G — 로그인 / 회원가입 화면.
 *
 * AuthGate 가 (Supabase 활성 + 비로그인) 일 때 children 대신 렌더한다. children
 * 의 `h-screen` 래퍼를 거치지 않으므로 자체 전체 화면 래퍼를 갖는다.
 *
 * 3 화면:
 *   - login / signup — 이메일·비밀번호 폼
 *   - check-email — 회원가입 후 이메일 확인이 필요할 때 (`sentTo` 가 set)
 *
 * `user` 갱신은 authStore 의 onAuthStateChange 가 담당 — 로그인 성공 시 이
 * 컴포넌트는 AuthGate 에 의해 자연스럽게 언마운트된다.
 */
export const AuthScreen = () => {
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const clearError = useAuthStore((s) => s.clearError);
  const actionPending = useAuthStore((s) => s.actionPending);
  const actionError = useAuthStore((s) => s.actionError);

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /** 회원가입 후 이메일 확인 대기 — 값이 있으면 check-email 화면. */
  const [sentTo, setSentTo] = useState<string | null>(null);

  const toggleMode = () => {
    setMode((m) => (m === "login" ? "signup" : "login"));
    clearError();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (actionPending) return;
    const mail = email.trim();
    if (mode === "login") {
      await signIn(mail, password);
    } else {
      const { needsConfirm } = await signUp(mail, password);
      if (needsConfirm) setSentTo(mail);
      // 즉시 로그인된 경우 onAuthStateChange 가 AuthGate 를 children 으로 전환.
    }
  };

  const screenWrap =
    "w-full h-screen overflow-hidden bg-bg text-text font-sans flex items-center justify-center p-6";

  // ── 이메일 확인 대기 화면 ────────────────────────────────────────────
  if (sentTo) {
    return (
      <div className={screenWrap}>
        <Card pad={28} className="w-[380px] max-w-full text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-accent-soft grid place-items-center">
              <Icon name="envelope-simple" size={24} className="text-accent" weight="bold" />
            </div>
          </div>
          <div className="text-h3 text-text">확인 메일을 보냈습니다</div>
          <p className="text-small text-muted mt-2 leading-relaxed">
            <span className="text-text2 font-medium">{sentTo}</span> 으로 보낸 메일의
            링크를 클릭하면 가입이 완료됩니다.
          </p>
          <Btn
            kind="secondary"
            full
            className="mt-5"
            onClick={() => {
              setSentTo(null);
              setMode("login");
              setPassword("");
            }}
          >
            로그인으로 돌아가기
          </Btn>
        </Card>
      </div>
    );
  }

  // ── 로그인 / 회원가입 폼 ─────────────────────────────────────────────
  const isLogin = mode === "login";
  return (
    <div className={screenWrap}>
      <Card pad={28} className="w-[380px] max-w-full">
        <div className="flex justify-center mb-5">
          <Logo size={26} />
        </div>
        <div className="text-h3 text-text text-center">{isLogin ? "로그인" : "회원가입"}</div>
        <p className="text-small text-muted text-center mt-1">
          {isLogin
            ? "시험지 변환을 계속하려면 로그인하세요."
            : "이메일로 새 계정을 만듭니다."}
        </p>

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
          <Input
            label="비밀번호"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6자 이상"
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={6}
            required
            disabled={actionPending}
          />

          {actionError && (
            <div className="flex items-start gap-1.5 rounded-r2 bg-danger-soft border border-[#FEE2E2] text-danger text-caption px-3 py-2">
              <Icon name="warning-circle" size={14} weight="fill" className="flex-shrink-0 mt-px" />
              <span>{actionError}</span>
            </div>
          )}

          <Btn type="submit" kind="accent" size="lg" full className="mt-1" disabled={actionPending}>
            {actionPending ? "처리 중…" : isLogin ? "로그인" : "회원가입"}
          </Btn>
        </form>

        <div className="mt-4 text-center text-small text-muted">
          {isLogin ? "계정이 없으신가요? " : "이미 계정이 있으신가요? "}
          <button
            type="button"
            onClick={toggleMode}
            disabled={actionPending}
            className="text-accent font-medium hover:underline disabled:opacity-50"
          >
            {isLogin ? "회원가입" : "로그인"}
          </button>
        </div>
      </Card>
    </div>
  );
};

export default AuthScreen;

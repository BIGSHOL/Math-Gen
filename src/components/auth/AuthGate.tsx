import { type ReactNode, useEffect } from "react";
import { Icon, Logo } from "@app/components/ui";
import { supabase } from "@app/services/api/supabase";
import { useAuthStore } from "@app/stores/authStore";
import { AuthScreen } from "./AuthScreen";
import { NewPasswordScreen } from "./NewPasswordScreen";

/**
 * Phase G — 인증 게이트.
 *
 * App.tsx 의 `route === "app"` 분기를 감싼다. 디버그 라우트(?ui/?bench/?katex/
 * ?legacy)는 게이트 밖이라 로그인 없이 계속 접근 가능.
 *
 * 분기:
 *   - `!supabase` (SUPABASE_ENABLED=false) → children passthrough. 기존
 *     IndexedDB/sessionStorage dev 경로 100% 보존.
 *   - status "loading" → AuthSplash (초기 세션 확인 중)
 *   - recoveryMode → NewPasswordScreen (재설정 메일 링크로 복귀)
 *   - 비로그인 → AuthScreen
 *   - 로그인 → children
 *
 * `initialize()` 는 mount 1회 — onAuthStateChange 구독을 설치하고 cleanup
 * (unsubscribe) 을 반환한다. React 19 StrictMode 의 mount→unmount→mount 에서도
 * 구독은 정확히 1개만 살아남는다 (cleanup 이 매번 unsubscribe).
 */
const AuthSplash = () => (
  <div className="w-full h-screen overflow-hidden bg-bg text-text font-sans flex flex-col items-center justify-center gap-4">
    <Logo size={28} />
    <Icon name="circle-notch" size={20} weight="bold" className="animate-spin text-muted" />
  </div>
);

export const AuthGate = ({ children }: { children: ReactNode }) => {
  const initialize = useAuthStore((s) => s.initialize);
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const recoveryMode = useAuthStore((s) => s.recoveryMode);

  useEffect(() => initialize(), [initialize]);

  // flag off — 인증 비활성. children 을 그대로 통과.
  if (!supabase) return <>{children}</>;
  if (status === "loading") return <AuthSplash />;
  // 재설정 메일 링크로 복귀 — 임시 세션이 있어 user 는 set 되지만, 새 비번을
  // 설정하기 전까지 앱 진입을 막는다 (!user 체크보다 먼저).
  if (recoveryMode) return <NewPasswordScreen />;
  if (!user) return <AuthScreen />;
  return <>{children}</>;
};

export default AuthGate;

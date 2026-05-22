import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@app/services/api/supabase";
import { useAppStore } from "./appStore";
import { useLibraryStore } from "./libraryStore";
import { useWizardStore } from "./wizardStore";

/**
 * Phase G — Supabase Auth (이메일/비밀번호).
 *
 * **단일 진실 소스**: `user` 상태는 오직 `onAuthStateChange` 콜백이 갱신한다.
 * signIn/signUp/signOut 액션은 폼의 로딩(`actionPending`)·에러(`actionError`)만
 * 책임지고, 성공 후 user 반영은 구독 콜백에 맡긴다.
 *
 * **Feature flag**: `supabase` 가 null(`SUPABASE_ENABLED=false`)이면 `initialize`
 * 가 즉시 `status: "ready"` 로 두고 no-op cleanup 을 반환 — AuthGate 가 passthrough.
 *
 * persist 미사용 — 세션 자체는 supabase-js 가 localStorage 에 보관한다
 * (`persistSession: true`, supabase.ts 참고).
 */

export type AuthStatus = "loading" | "ready";

export interface AuthState {
  /** 로그인 사용자. 비로그인 / flag off 면 null. */
  user: User | null;
  /** "loading" = 초기 세션 확인 중 (AuthGate 가 splash). "ready" = 확정. */
  status: AuthStatus;
  /** signIn/signUp/signOut 진행 중 — 폼 버튼 disable 용. */
  actionPending: boolean;
  /** 마지막 액션 실패 메시지 (한국어). 성공 시 null. */
  actionError: string | null;
  /** 비밀번호 재설정 메일 링크로 복귀한 상태 — AuthGate 가 NewPasswordScreen 표시. */
  recoveryMode: boolean;

  /** AuthGate 가 mount 에서 1회 호출. 구독을 설치하고 cleanup 함수를 반환. */
  initialize: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  /** 반환 `needsConfirm` = true 면 이메일 확인 대기 (세션 미발급). */
  signUp: (email: string, password: string) => Promise<{ needsConfirm: boolean }>;
  signOut: () => Promise<void>;
  /** 비밀번호 재설정 메일 발송. 성공 시 true. */
  requestPasswordReset: (email: string) => Promise<boolean>;
  /** 새 비밀번호로 변경. 성공 시 true + recoveryMode 해제. 재설정·로그인 양쪽에서 사용. */
  updatePassword: (newPassword: string) => Promise<boolean>;
  clearError: () => void;
}

/** Supabase 의 영문 auth 에러 → 한국어 메시지. code 우선, message 보조. */
const authErrorToKorean = (error: { code?: string; message?: string }): string => {
  const code = error.code ?? "";
  const msg = error.message ?? "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg))
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (code === "user_already_exists" || /already registered|already.*exists/i.test(msg))
    return "이미 가입된 이메일입니다. 로그인해 주세요.";
  if (code === "weak_password" || /password should be at least|weak.?password/i.test(msg))
    return "비밀번호는 6자 이상이어야 합니다.";
  if (code === "same_password" || /different from the old/i.test(msg))
    return "새 비밀번호가 기존 비밀번호와 같습니다.";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg))
    return "이메일 확인이 완료되지 않았습니다. 받은 메일의 링크를 클릭해 주세요.";
  if (code === "validation_failed" || /unable to validate email|invalid.?email/i.test(msg))
    return "이메일 형식이 올바르지 않습니다.";
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    /rate limit/i.test(msg)
  )
    return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  if (/network|failed to fetch/i.test(msg))
    return "네트워크 오류입니다. 연결 상태를 확인해 주세요.";
  return msg || "인증 중 오류가 발생했습니다.";
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "loading",
  actionPending: false,
  actionError: null,
  recoveryMode: false,

  initialize: () => {
    if (!supabase) {
      // flag off — 인증 비활성. AuthGate 는 children 을 그대로 통과시킨다.
      set({ status: "ready" });
      return () => {};
    }
    const sb = supabase;

    // 신원(user id) 변경 추적. 첫 적용에서는 prevUserId 만 세팅하고 리셋하지
    // 않는다 (앱 로드 시점의 store 는 이미 비어 있음). 이후 id 가 실제로 바뀔
    // 때만 — 로그인 / 로그아웃 / 계정 전환 — downstream store 를 재범위화한다.
    // TOKEN_REFRESHED 처럼 같은 id 가 다시 와도 리셋이 일어나지 않게 한다.
    let prevUserId: string | null | undefined = undefined;

    const applyUser = (user: User | null) => {
      const nextId = user?.id ?? null;
      const isChange = prevUserId !== undefined && prevUserId !== nextId;
      if (isChange) {
        useLibraryStore.getState().reset();
        useWizardStore.getState().reset();
        useAppStore.getState().backToLibrary();
      }
      // 초기 1회 + 실제 신원 변경 시에만 로그 — getSession / INITIAL_SESSION /
      // StrictMode 재실행이 같은 id 로 여러 번 들어와도 noise 없게.
      if (import.meta.env.DEV && (prevUserId === undefined || isChange)) {
        // eslint-disable-next-line no-console
        console.debug(`[authStore] user=${nextId ?? "(anon)"}`);
      }
      prevUserId = nextId;
      set({ user, status: "ready" });
    };

    // 초기 세션 (localStorage). onAuthStateChange 도 INITIAL_SESSION 으로 같은
    // 값을 한 번 더 전달하지만 applyUser 가 멱등이라 안전.
    void sb.auth.getSession().then(({ data }) => {
      applyUser(data.session?.user ?? null);
    });

    const { data } = sb.auth.onAuthStateChange((event, session) => {
      // 재설정 메일 링크로 복귀 — supabase 가 임시 세션을 발급하지만 곧장
      // 앱으로 보내지 않고 NewPasswordScreen 으로 라우팅하려 recoveryMode 를 켠다.
      if (event === "PASSWORD_RECOVERY") set({ recoveryMode: true });
      applyUser(session?.user ?? null);
    });

    return () => data.subscription.unsubscribe();
  },

  signIn: async (email, password) => {
    if (!supabase) return;
    set({ actionPending: true, actionError: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ actionPending: false, actionError: error ? authErrorToKorean(error) : null });
    // 성공 시 user 반영은 onAuthStateChange 가 처리.
  },

  signUp: async (email, password) => {
    if (!supabase) return { needsConfirm: false };
    set({ actionPending: true, actionError: null });
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      set({ actionPending: false, actionError: authErrorToKorean(error) });
      return { needsConfirm: false };
    }
    set({ actionPending: false });
    // session 이 있으면 즉시 로그인 (onAuthStateChange 처리), 없으면 이메일 확인 대기.
    return { needsConfirm: !data.session };
  },

  signOut: async () => {
    if (!supabase) return;
    set({ actionPending: true });
    await supabase.auth.signOut();
    set({ actionPending: false, recoveryMode: false });
    // user=null + downstream store 리셋은 onAuthStateChange(SIGNED_OUT) 가 처리.
  },

  requestPasswordReset: async (email) => {
    if (!supabase) return false;
    set({ actionPending: true, actionError: null });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    set({ actionPending: false, actionError: error ? authErrorToKorean(error) : null });
    // 보안상 가입 안 된 이메일이어도 supabase 는 성공(error=null)으로 응답한다.
    return !error;
  },

  updatePassword: async (newPassword) => {
    if (!supabase) return false;
    set({ actionPending: true, actionError: null });
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      set({ actionPending: false, actionError: authErrorToKorean(error) });
      return false;
    }
    set({ actionPending: false, recoveryMode: false });
    return true;
  },

  clearError: () => set({ actionError: null }),
}));

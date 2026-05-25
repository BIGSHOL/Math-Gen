import type { ReactNode } from "react";
import { useAuthStore } from "@app/stores/authStore";
import { Heading, Icon } from "@app/components/ui";

/**
 * Admin 화면 접근 권한 검증. 다음 4 상태로 분기:
 *   1. **비로그인** (user null) → 로그인 안내 (AuthGate 가 외곽에서 이미 처리하지만
 *      *Admin 우회 접근* 안전망)
 *   2. **profile 로딩 중** (user 있고 profile null) → splash
 *   3. **권한 부족** (role === 'teacher' 또는 status !== 'active') → 권한 없음 화면
 *   4. **승인** (system_admin 또는 tenant_admin + active) → children 통과
 *
 * RLS 가 최종 진실 — 우회 fetch 도 막힘. 이 Gate 는 UX 차원의 *조기 차단*.
 */

interface AdminGateProps {
  children: ReactNode;
}

export const AdminGate = ({ children }: AdminGateProps) => {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const status = useAuthStore((s) => s.status);

  // 인증 로딩 중
  if (status === "loading") {
    return (
      <ForbiddenShell heading="로그인 확인 중…" message="잠시만 기다려주세요." icon="hourglass-medium" />
    );
  }

  // 비로그인 — 우회 접근 차단
  if (!user) {
    return (
      <ForbiddenShell
        heading="로그인이 필요합니다"
        message="관리자 화면은 로그인 후 사용 가능합니다. 메인 페이지에서 로그인하세요."
        icon="sign-in"
      />
    );
  }

  // profile 로딩 중 (DB fetch async)
  if (!profile) {
    return (
      <ForbiddenShell heading="권한 확인 중…" message="잠시만 기다려주세요." icon="hourglass-medium" />
    );
  }

  // pending / suspended — 활성 admin 만 허용
  if (profile.status !== "active") {
    const label = profile.status === "pending" ? "승인 대기 중" : "정지된 계정";
    return (
      <ForbiddenShell
        heading={label}
        message={
          profile.status === "pending"
            ? "관리자 승인 후 사용 가능합니다."
            : "관리자에게 문의하세요."
        }
        icon="warning-circle"
      />
    );
  }

  // teacher — admin 화면 접근 불가
  if (profile.role === "teacher") {
    return (
      <ForbiddenShell
        heading="관리자 권한이 필요합니다"
        message="이 화면은 학원 관리자 또는 시스템 관리자만 접근 가능합니다."
        icon="lock-key"
      />
    );
  }

  // system_admin 또는 tenant_admin + active → 통과
  return <>{children}</>;
};

interface ForbiddenShellProps {
  heading: string;
  message: string;
  icon: string;
}

const ForbiddenShell = ({ heading, message, icon }: ForbiddenShellProps) => (
  <div className="w-full h-screen flex items-center justify-center bg-bg text-text px-4">
    <div className="flex flex-col items-center text-center max-w-md w-full">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-warn-soft mb-4 mx-auto">
        <Icon name={icon} size={28} color="#F59E0B" weight="duotone" />
      </div>
      <Heading level="h2" className="mb-2 text-center">
        {heading}
      </Heading>
      <p className="text-small text-muted text-center leading-relaxed">{message}</p>
      <a
        href="/"
        className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-r2 bg-surface2 text-text hover:bg-hover transition text-small"
      >
        <Icon name="arrow-left" size={14} />
        메인으로 돌아가기
      </a>
    </div>
  </div>
);

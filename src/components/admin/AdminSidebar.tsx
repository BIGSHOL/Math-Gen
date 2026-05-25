import { useMemo } from "react";
import { Eyebrow, NavList, type NavListItem, Heading, Icon } from "@app/components/ui";
import { useAuthStore } from "@app/stores/authStore";
import { useAdminStore, type AdminSection } from "@app/stores/adminStore";

/**
 * Admin 화면 좌측 sidebar. 7 섹션 메뉴 — role 별 가시성 분기.
 *
 * LibrarySidebar 패턴 복제 (width 232px, surface bg, border-r).
 */

interface SectionSpec {
  id: AdminSection;
  label: string;
  icon: string;
  /** system_admin 만 보이는 메뉴 (학원 관리). */
  systemAdminOnly?: boolean;
}

const SECTIONS: SectionSpec[] = [
  { id: "usage", label: "사용량 / 비용", icon: "chart-line" },
  { id: "users", label: "사용자 관리", icon: "users" },
  { id: "tenants", label: "학원 관리", icon: "buildings", systemAdminOnly: true },
  { id: "tests", label: "시험지 통계", icon: "books" },
  { id: "errors", label: "에러 로그", icon: "warning-octagon" },
  { id: "monitoring", label: "이상 감지", icon: "radar" },
  { id: "feedback", label: "콘텐츠 분석", icon: "thumbs-up" },
];

export const AdminSidebar = () => {
  const role = useAuthStore((s) => s.profile?.role ?? "teacher");
  const section = useAdminStore((s) => s.section);
  const setSection = useAdminStore((s) => s.setSection);

  const anomalyCount = useAdminStore((s) => s.anomalyCount);

  const items = useMemo<NavListItem<AdminSection>[]>(
    () =>
      SECTIONS.filter((s) => !s.systemAdminOnly || role === "system_admin").map((s) => ({
        id: s.id,
        label: s.label,
        icon: s.icon,
        count: s.id === "monitoring" && anomalyCount > 0 ? anomalyCount : undefined,
      })),
    [role, anomalyCount],
  );

  return (
    <aside className="w-[232px] flex-shrink-0 px-3.5 py-[18px] border-r border-line bg-surface flex flex-col gap-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-2 pb-2 border-b border-line">
        <Icon name="shield-star" size={20} weight="duotone" color="#F59E0B" />
        <Heading level="h3" className="text-body">
          관리자
        </Heading>
      </div>

      {/* role badge */}
      <div className="px-2">
        <Eyebrow>현재 역할</Eyebrow>
        <div className="mt-1 text-small font-semibold text-text">
          {role === "system_admin" ? "시스템 관리자" : role === "tenant_admin" ? "학원 관리자" : "교사"}
        </div>
      </div>

      {/* 섹션 nav */}
      <NavList<AdminSection> items={items} current={section} onChange={setSection} />

      {/* 메인 복귀 */}
      <div className="mt-auto pt-3 border-t border-line">
        <a
          href="/"
          className="flex items-center gap-2 px-2 py-1.5 text-small text-muted hover:text-text transition"
        >
          <Icon name="arrow-left" size={14} />
          메인으로 돌아가기
        </a>
      </div>
    </aside>
  );
};

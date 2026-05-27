import { useEffect } from "react";
import { AdminGate } from "@app/components/admin/AdminGate";
import { AdminSidebar } from "@app/components/admin/AdminSidebar";
import { UsageDashboard } from "@app/components/admin/sections/UsageDashboard";
import { UserManagement } from "@app/components/admin/sections/UserManagement";
import { TenantManagement } from "@app/components/admin/sections/TenantManagement";
import { TestStats } from "@app/components/admin/sections/TestStats";
import { ErrorLogs } from "@app/components/admin/sections/ErrorLogs";
import { Monitoring } from "@app/components/admin/sections/Monitoring";
import { ContentInsights } from "@app/components/admin/sections/ContentInsights";
import { OcrScrapsManagement } from "@app/components/admin/sections/OcrScrapsManagement";
import { useAdminStore } from "@app/stores/adminStore";
import { loadAnomalies } from "@app/services/api/admin";

/**
 * Top-level shell. `?admin` 라우트에서 진입.
 *
 * 좌측 232px Sidebar + 우측 main panel — section state 기반 분기.
 * AdminGate 가 role / status 검증 (tenant_admin 또는 system_admin + active).
 */
export const AdminScreen = () => {
  // Phase D — anomaly count 전역 polling. Sidebar 의 monitoring badge 갱신.
  const setAnomalyCount = useAdminStore((s) => s.setAnomalyCount);
  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      const data = await loadAnomalies();
      if (!cancelled) setAnomalyCount(data.length);
    };
    void fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setAnomalyCount]);

  return (
    <AdminGate>
      <div className="w-full h-screen flex overflow-hidden bg-bg text-text font-sans">
        <AdminSidebar />
        <main className="flex-1 overflow-hidden">
          <SectionRouter />
        </main>
      </div>
    </AdminGate>
  );
};

const SectionRouter = () => {
  const section = useAdminStore((s) => s.section);
  switch (section) {
    case "usage":
      return <UsageDashboard />;
    case "users":
      return <UserManagement />;
    case "tenants":
      return <TenantManagement />;
    case "tests":
      return <TestStats />;
    case "errors":
      return <ErrorLogs />;
    case "monitoring":
      return <Monitoring />;
    case "feedback":
      return <ContentInsights />;
    case "ocr_scraps":
      return <OcrScrapsManagement />;
    default:
      return <UsageDashboard />;
  }
};

export default AdminScreen;

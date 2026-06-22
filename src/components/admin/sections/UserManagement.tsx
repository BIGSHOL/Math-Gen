import { useEffect, useState } from "react";
import { Btn, Card, Chip, Heading, Eyebrow } from "@app/components/ui";
import { useAuthStore, type UserProfile } from "@app/stores/authStore";
import {
  loadProfiles,
  updateProfileStatus,
  updateProfileRole,
} from "@app/services/api/admin";

/**
 * Admin §2 — 사용자 관리. profiles 표 + role / status 변경.
 *
 * RLS:
 *   - tenant_admin 은 *자기 tenant 의 profiles* 만 조회 / 수정
 *   - system_admin 은 전체
 */
export const UserManagement = () => {
  const myRole = useAuthStore((s) => s.profile?.role ?? "teacher");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    const data = await loadProfiles();
    setUsers(data);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  const handleApprove = async (id: string) => {
    setActionPending(id);
    const ok = await updateProfileStatus(id, "active");
    if (ok) await reload();
    setActionPending(null);
  };

  const handleSuspend = async (id: string) => {
    if (!confirm("이 사용자를 차단합니다. 계속하시겠습니까?")) return;
    setActionPending(id);
    const ok = await updateProfileStatus(id, "suspended");
    if (ok) await reload();
    setActionPending(null);
  };

  const handleRoleChange = async (id: string, role: UserProfile["role"]) => {
    const label =
      role === "system_admin" ? "시스템 관리자" : role === "tenant_admin" ? "학원 관리자" : "교사";
    if (!confirm(`이 사용자의 권한을 "${label}" (으)로 변경합니다. 계속하시겠습니까?`)) return;
    setActionPending(id);
    const ok = await updateProfileRole(id, role);
    if (ok) await reload();
    setActionPending(null);
  };

  return (
    <div className="p-6 space-y-4 overflow-y-auto">
      <Heading level="h2">사용자 관리</Heading>
      <Eyebrow>총 {users.length} 명</Eyebrow>

      <Card pad={0}>
        {loading ? (
          <div className="p-8 text-center text-muted">불러오는 중…</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-muted">사용자가 없습니다.</div>
        ) : (
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-line text-muted bg-surface2">
                <th className="text-left p-3 font-medium">이메일</th>
                <th className="text-left p-3 font-medium">역할</th>
                <th className="text-left p-3 font-medium">상태</th>
                <th className="text-left p-3 font-medium">학원</th>
                <th className="text-right p-3 font-medium">액션</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line/50 hover:bg-surface2">
                  <td className="p-3 font-mono text-caption">{u.email ?? "-"}</td>
                  <td className="p-3">
                    <Chip
                      tone={u.role === "system_admin" ? "warn" : u.role === "tenant_admin" ? "accent" : "soft"}
                      size="sm"
                    >
                      {u.role === "system_admin" ? "시스템" : u.role === "tenant_admin" ? "학원" : "교사"}
                    </Chip>
                  </td>
                  <td className="p-3">
                    <Chip
                      tone={u.status === "active" ? "ok" : u.status === "pending" ? "warn" : "soft"}
                      size="sm"
                      dot
                    >
                      {u.status === "active" ? "활성" : u.status === "pending" ? "대기" : "정지"}
                    </Chip>
                  </td>
                  <td className="p-3 font-mono text-caption">
                    {u.tenant_id ? u.tenant_id.slice(0, 8) : "-"}
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex gap-1">
                      {u.status === "pending" && (
                        <Btn
                          kind="accent"
                          size="sm"
                          icon="check"
                          onClick={() => handleApprove(u.id)}
                          disabled={actionPending === u.id}
                        >
                          승인
                        </Btn>
                      )}
                      {u.status === "active" && (
                        <Btn
                          kind="ghost"
                          size="sm"
                          icon="prohibit"
                          onClick={() => handleSuspend(u.id)}
                          disabled={actionPending === u.id}
                        >
                          차단
                        </Btn>
                      )}
                      {myRole === "system_admin" && u.role !== "system_admin" && (
                        <Btn
                          kind="ghost"
                          size="sm"
                          icon="arrow-up"
                          onClick={() => handleRoleChange(u.id, u.role === "teacher" ? "tenant_admin" : "system_admin")}
                          disabled={actionPending === u.id}
                        >
                          승급
                        </Btn>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

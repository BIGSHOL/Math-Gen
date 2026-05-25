import { useEffect, useState } from "react";
import { Btn, Card, Chip, Heading, Eyebrow, Input } from "@app/components/ui";
import {
  loadTenants,
  createTenant,
  deleteTenant,
  type Tenant,
} from "@app/services/api/admin";

/**
 * Admin §3 — 학원(tenant) 관리. system_admin 전용. AdminSidebar 가 메뉴 가시성
 * 통제 — tenant_admin / teacher 는 이 섹션 자체에 접근 못 함.
 */

const generateInviteCode = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "MATHGEN-";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

export const TenantManagement = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    setLoading(true);
    setTenants(await loadTenants());
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const result = await createTenant(newName.trim(), generateInviteCode());
    setCreating(false);
    if (result) {
      setNewName("");
      await reload();
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`학원 "${name}" 을 삭제합니다. 해당 학원의 사용자는 tenant_id 가 null 이 됩니다. 계속?`)) return;
    const ok = await deleteTenant(id);
    if (ok) await reload();
  };

  return (
    <div className="p-6 space-y-4 overflow-y-auto">
      <Heading level="h2">학원 관리</Heading>
      <Eyebrow>총 {tenants.length} 개 학원</Eyebrow>

      {/* 신규 생성 */}
      <Card pad={14}>
        <Eyebrow className="mb-2">신규 학원 생성</Eyebrow>
        <div className="flex gap-2">
          <Input
            size="sm"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="학원 이름 (예: 강북수학학원)"
            className="flex-1"
          />
          <Btn
            kind="accent"
            size="sm"
            icon="plus"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
          >
            생성 (코드 자동 발급)
          </Btn>
        </div>
      </Card>

      {/* 목록 */}
      <Card pad={0}>
        {loading ? (
          <div className="p-8 text-center text-muted">불러오는 중…</div>
        ) : tenants.length === 0 ? (
          <div className="p-8 text-center text-muted">등록된 학원이 없습니다.</div>
        ) : (
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-line text-muted bg-surface2">
                <th className="text-left p-3 font-medium">이름</th>
                <th className="text-left p-3 font-medium">초대 코드</th>
                <th className="text-left p-3 font-medium">요금제</th>
                <th className="text-left p-3 font-medium">생성일</th>
                <th className="text-right p-3 font-medium">액션</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b border-line/50 hover:bg-surface2">
                  <td className="p-3 font-semibold">{t.name}</td>
                  <td className="p-3 font-mono text-caption">{t.invite_code}</td>
                  <td className="p-3">
                    <Chip
                      tone={t.plan_tier === "enterprise" ? "warn" : t.plan_tier === "pro" ? "accent" : "soft"}
                      size="sm"
                    >
                      {t.plan_tier}
                    </Chip>
                  </td>
                  <td className="p-3 text-muted">{new Date(t.created_at).toLocaleDateString("ko-KR")}</td>
                  <td className="p-3 text-right">
                    <Btn
                      kind="ghost"
                      size="sm"
                      icon="trash"
                      onClick={() => handleDelete(t.id, t.name)}
                    >
                      삭제
                    </Btn>
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

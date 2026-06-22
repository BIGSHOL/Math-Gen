import { useEffect, useState } from "react";
import { Btn, Card, Chip, Heading, Eyebrow, Icon, Input } from "@app/components/ui";
import {
  loadTenants,
  createTenant,
  deleteTenant,
  regenerateInviteCode,
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
  /** 방금 복사된 invite_code — 2초간 체크 아이콘 표시. */
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((prev) => (prev === code ? null : prev)), 2000);
    } catch {
      // clipboard API 미지원 환경 — 조용히 무시 (HTTP 컨텍스트 등).
    }
  };

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
    if (!confirm(`학원 "${name}" 을(를) 삭제합니다. 소속 사용자는 학원 미지정 상태가 됩니다. 계속하시겠습니까?`)) return;
    const ok = await deleteTenant(id);
    if (ok) await reload();
  };

  const handleRegenerate = async (id: string, name: string, oldCode: string) => {
    if (
      !confirm(
        `학원 "${name}" 의 초대 코드를 재발급합니다.\n\n` +
          `기존 코드 (${oldCode}) 는 즉시 무효화됩니다. ` +
          `이미 가입한 사용자는 영향 없으나, 새 가입 시도는 새 코드가 필요합니다. 계속?`,
      )
    )
      return;
    const newCode = generateInviteCode();
    const ok = await regenerateInviteCode(id, newCode);
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
                  <td className="p-3 font-mono text-caption">
                    <button
                      type="button"
                      onClick={() => void handleCopyCode(t.invite_code)}
                      className="inline-flex items-center gap-1.5 hover:text-accent transition-colors"
                      title="초대 코드 복사"
                    >
                      <span>{t.invite_code}</span>
                      <Icon
                        name={copiedCode === t.invite_code ? "check" : "copy"}
                        size={12}
                        className={
                          copiedCode === t.invite_code ? "text-ok" : "text-muted"
                        }
                      />
                    </button>
                  </td>
                  <td className="p-3">
                    <Chip
                      tone={t.plan_tier === "enterprise" ? "warn" : t.plan_tier === "pro" ? "accent" : "soft"}
                      size="sm"
                    >
                      {t.plan_tier === "enterprise"
                        ? "기업"
                        : t.plan_tier === "pro"
                          ? "프로"
                          : t.plan_tier === "free"
                            ? "무료"
                            : t.plan_tier}
                    </Chip>
                  </td>
                  <td className="p-3 text-muted">{new Date(t.created_at).toLocaleDateString("ko-KR")}</td>
                  <td className="p-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Btn
                        kind="ghost"
                        size="sm"
                        icon="arrow-clockwise"
                        onClick={() => void handleRegenerate(t.id, t.name, t.invite_code)}
                        title="초대 코드 재발급"
                      >
                        재발급
                      </Btn>
                      <Btn
                        kind="ghost"
                        size="sm"
                        icon="trash"
                        onClick={() => handleDelete(t.id, t.name)}
                      >
                        삭제
                      </Btn>
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

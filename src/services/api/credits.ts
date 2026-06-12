import { supabase, currentAccessToken } from "./supabase";

/**
 * para-x 결제 허브 연동 — 이용권 크레딧 조회 + 구매 진입.
 *
 * **흐름**:
 *   1. 구매: `startParaxCheckout(productId)` → /api/parax-checkout 가 서명
 *      핸드오프 토큰을 발급해 para-x checkout URL 반환 → window.location 이동.
 *   2. 결제 승인: para-x 가 /api/webhooks-parax 로 grant 웹훅 → credit_lots 적립.
 *   3. 잔액: `getCreditBalance()` — lot 기준 SUM(qty-used), 만료 lot 제외.
 *
 * 차감(시험지 처리 1회 = 1크레딧 소비)은 후속 phase — 게이팅 도입 시
 * 서버(service role)에서 FIFO 차감.
 */

/** para-x 상품 id (para-x lib/products.js 와 일치 — 금액은 para-x 가 결정) */
export const PARAX_PRODUCTS = [
  { id: "mathgen-exam-10", name: "시험지 처리 10회", qty: 10 },
  { id: "mathgen-exam-20", name: "시험지 처리 20회", qty: 20 },
  { id: "mathgen-exam-30", name: "시험지 처리 30회", qty: 30 },
] as const;

const TABLE_MISSING_RE = /(PGRST20[45]|schema cache|relation .* does not exist)/i;
let warnedMissingTable = false;
const warnSchemaMigration = (): void => {
  if (warnedMissingTable) return;
  warnedMissingTable = true;
  // eslint-disable-next-line no-console
  console.warn(
    "[api/credits] credit_lots 테이블이 Supabase 에 없습니다 — supabase/schema-credits.sql 실행 필요. 마이그레이션 전까지 잔액 표시 비활성.",
  );
};

export interface CreditBalance {
  /** 유효 잔액 (만료 lot 제외, qty - used 합) */
  remaining: number;
  /** 가장 임박한 만료일 (잔액 있는 lot 기준, 없으면 null) */
  nearestExpiry: string | null;
}

/**
 * 현재 tenant 의 크레딧 잔액. RLS 가 같은 tenant 멤버에게만 SELECT 허용.
 * 테이블 미생성 / Supabase 비활성 / 미로그인 → null (잔액 UI 숨김).
 */
export const getCreditBalance = async (
  feature = "EXAM_PROCESS",
): Promise<CreditBalance | null> => {
  if (!supabase) return null;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("credit_lots")
    .select("qty, used, expires_at")
    .eq("feature", feature)
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: true });
  if (error) {
    if (TABLE_MISSING_RE.test(error.message)) warnSchemaMigration();
    return null;
  }
  let remaining = 0;
  let nearestExpiry: string | null = null;
  for (const lot of data ?? []) {
    const left = (lot.qty as number) - (lot.used as number);
    if (left <= 0) continue;
    remaining += left;
    if (!nearestExpiry) nearestExpiry = lot.expires_at as string;
  }
  return { remaining, nearestExpiry };
};

/**
 * para-x 결제 진입 — 핸드오프 토큰이 포함된 checkout URL 을 받아 반환.
 * 호출측은 `window.location.assign(url)` 로 이동. throw 시 메시지를 그대로 표시.
 */
export const startParaxCheckout = async (productId: string): Promise<string> => {
  const token = await currentAccessToken();
  if (!token) throw new Error("로그인이 필요합니다.");
  const res = await fetch(`/api/parax-checkout?product=${encodeURIComponent(productId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error || "결제 페이지로 이동할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }
  return data.url;
};

// printTemplateMigration.ts
// legacy template 값을 신규 6 union 으로 매핑.
//
// 사용처:
//   - wizardStore 의 onRehydrateStorage — sessionStorage 의 옛 값 복원 시
//   - services/api/mappers — Supabase row 의 printOptions JSONB hydrate 시
//
// 이미 신규 6 값이면 그대로 통과. 옛 4 / mathlab 9 / 그 외 알 수 없는 값은
// fallback "jeongtong".

import type { PrintTemplate } from "@app/components/print/types";

const VALID: ReadonlySet<PrintTemplate> = new Set([
  "pyeongga",
  "jeongtong",
  "modern",
  "workbook",
  "jaseup",
  "yuhyung",
]);

const LEGACY_MAP: Record<string, PrintTemplate> = {
  // 기존 4 template
  exam: "pyeongga", // 수능 형식 → 평가원
  default: "jeongtong", // 기본형 → 정통
  minimal: "yuhyung", // 미니멀 → 컴팩트 유형
  classic: "modern", // 클래식 → 모던
  // mathlab 의 9 templates 잠복 — 안전망
  large: "pyeongga",
  csat: "pyeongga",
  notebook: "workbook",
  formal: "jeongtong",
  bubble: "modern",
};

/**
 * 어떤 raw 값이 와도 *항상* 신규 6 union 중 하나 반환.
 * - 신규 값 → 통과
 * - 옛 값 → 매핑 (`exam → pyeongga` 등)
 * - 알 수 없는 값 / null / undefined / non-string → fallback "jeongtong"
 */
export function matchLegacyTemplate(raw: unknown): PrintTemplate {
  if (typeof raw !== "string") return "jeongtong";
  if (VALID.has(raw as PrintTemplate)) return raw as PrintTemplate;
  return LEGACY_MAP[raw] ?? "jeongtong";
}

/**
 * 로컬 HWP 커넥터 클라이언트 — Math-Gen 웹 → 127.0.0.1 커넥터 → .hwp/.hwpx 다운로드.
 *
 * 커넥터 = 시험지변환기(testchange) repo 의 `server/connector.py` (stdlib http.server).
 * 브라우저가 *직접* loopback 을 호출한다 (Vercel 경유 X — 서버는 사용자 PC localhost 에
 * 못 닿음). dev(localhost http)에선 mixed-content 없음. prod(https)는 PNA 헤더로 통과.
 *
 * 스펙: docs/mathgen-hwp-ocr-integration-handoff.md §12-1 (wire 계약).
 */

import type { ProblemReview } from "@app/stores/wizardStore";
import type { PrintMeta } from "@app/components/print/types";

/** 커넥터 base URL. dev override 가능 (VITE_HWP_CONNECTOR_URL). */
const BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta.env?.VITE_HWP_CONNECTOR_URL as string | undefined)) ||
  "http://127.0.0.1:8765";

const TOKEN_KEY = "mathgen_hwp_token";

/** 객관식 보기 마커 ①..⑩. */
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";

export interface HwpHealth {
  status: string;
  version: string;
  engine: string; // "hwpx" | "hwp"
  hwp_com: boolean;
  capabilities: string[];
}

export interface HwpPayloadProblem {
  number: number;
  text: string;
  topic?: string;
}

export interface HwpPayload {
  schema: "v2";
  meta: { title: string; subject: string; grade: string };
  problems: HwpPayloadProblem[];
}

/** GET /health — 커넥터 실행·엔진 감지. 미실행/타임아웃이면 null. */
export const detectConnector = async (
  timeoutMs = 2500,
): Promise<HwpHealth | null> => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${BASE}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as HwpHealth;
  } catch {
    return null;
  }
};

/**
 * 내보내기 problems(ProblemReview[]) → 커넥터 wire payload(§12-1).
 * markdown 본문 + 객관식 보기 ①…⑤ 한 줄을 text 에 합친다 (커넥터 어댑터가 분리).
 */
export const buildHwpPayload = (
  problems: ProblemReview[],
  meta: PrintMeta,
  exportSource: string,
): HwpPayload => ({
  schema: "v2",
  meta: {
    title: meta.title || "시험지",
    subject: meta.subject || "수학",
    grade: meta.grade || "",
  },
  problems: problems.map((r, i) => {
    // §33: exportSource 는 현재 항상 "original". digitize 면 original===variant.
    const p = exportSource === "original" ? r.original : r.variant;
    let text = (p.question || "").trim();
    if (Array.isArray(p.choices) && p.choices.length > 0) {
      const line = p.choices
        .map((c, ci) => `${CIRCLED[ci] ?? `(${ci + 1})`} ${c}`)
        .join(" ");
      text = text ? `${text}\n${line}` : line;
    }
    return {
      number: i + 1,
      text,
      ...(p.topic ? { topic: p.topic } : {}),
    };
  }),
});

export const getStoredToken = (): string => {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
};

export const setStoredToken = (t: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {
    /* localStorage 불가 — 무시 (이 세션만 토큰 미저장) */
  }
};

/** 커넥터 호출 에러 — status 코드 노출(401 페어링 토큰 분기용). */
export class HwpConnectorError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "HwpConnectorError";
    this.status = status;
  }
}

/** POST /convert-json → .hwp/.hwpx Blob. 실패 시 HwpConnectorError. */
export const convertToHwp = async (
  payload: HwpPayload,
  token: string,
): Promise<Blob> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Pairing-Token"] = token;
  const res = await fetch(`${BASE}/convert-json`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new HwpConnectorError(err.error || `HTTP ${res.status}`, res.status);
  }
  return res.blob();
};

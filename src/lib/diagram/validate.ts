import type { DiagramParams } from "./types";

/**
 * Phase F 검증 — `diagramParams` 배열의 정합성 점검.
 *
 * AI 가 emit 한 spec 이 *최소한의 형식* 을 갖추는지만 검사. normalize 가 이후
 * fallback 으로 메우지만, *fallback 발동 자체* 가 *모델 부정확* 시그널 →
 * DEV 로그로 노출해 사용자 (개발자) 가 prompt 보강 결정 가능.
 *
 * 검사 항목:
 *   - 각 element 의 `type` 필드 valid (7 종 중 하나)
 *   - shape 별 필수 필드 (polygon 의 vertices 등) 존재
 *   - vertices array 의 *최소 길이* (triangle 3, quad 4, polygon 3+)
 *   - coordinatePlane 의 functions[].expr 가 *문자열*
 *   - solid 의 shape 가 6 종 중 하나
 *   - composite 의 elements 가 *재귀적으로 valid*
 *
 * Renderer 가 *모두 throw 없이 처리* 하므로 검증은 *informational* — 사용자
 * UI 차단 X.
 */

export type DiagramIssueSeverity = "error" | "warn";

export interface DiagramIssue {
  /** 배열 안 element index. composite 안에선 "0.1" 같은 dot 표기. */
  index: string;
  severity: DiagramIssueSeverity;
  /** 원인 한국어 (DEV 로그용). */
  message: string;
}

const VALID_TYPES = new Set([
  "triangle",
  "circle",
  "quadrilateral",
  "polygon",
  "coordinatePlane",
  "solid",
  "composite",
]);

const VALID_SOLID_SHAPES = new Set([
  "cube",
  "cylinder",
  "cone",
  "sphere",
  "prism",
  "pyramid",
]);

const isFiniteNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isPoint = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && isFiniteNum(v[0]) && isFiniteNum(v[1]);

/** 단일 spec element 검증 (composite 재귀 포함). */
const validateOne = (
  spec: unknown,
  pathPrefix: string,
  out: DiagramIssue[],
): void => {
  if (!spec || typeof spec !== "object") {
    out.push({
      index: pathPrefix,
      severity: "error",
      message: "spec 이 object 가 아님 (null / primitive)",
    });
    return;
  }
  const obj = spec as { type?: unknown; [k: string]: unknown };
  if (typeof obj.type !== "string") {
    out.push({
      index: pathPrefix,
      severity: "error",
      message: "`type` 필드 누락 또는 string 아님",
    });
    return;
  }
  if (!VALID_TYPES.has(obj.type)) {
    out.push({
      index: pathPrefix,
      severity: "error",
      message: `알 수 없는 type "${obj.type}" — 허용: ${[...VALID_TYPES].join(", ")}`,
    });
    return;
  }

  switch (obj.type) {
    case "triangle": {
      // preset 있으면 OK, 없으면 vertices 필수 (3개).
      const hasPreset = typeof obj.preset === "string";
      const vertices = obj.vertices as unknown[] | undefined;
      if (!hasPreset) {
        if (!Array.isArray(vertices) || vertices.length !== 3) {
          out.push({
            index: pathPrefix,
            severity: "warn",
            message: "triangle: preset 없고 vertices 도 3개 아님 — normalize fallback (기본 직각삼각형)",
          });
        } else if (!vertices.every(isPoint)) {
          out.push({
            index: pathPrefix,
            severity: "warn",
            message: "triangle.vertices 의 일부 항목이 [x, y] 형식 아님",
          });
        }
      }
      break;
    }
    case "quadrilateral": {
      const hasPreset = typeof obj.preset === "string";
      const vertices = obj.vertices as unknown[] | undefined;
      if (!hasPreset) {
        if (!Array.isArray(vertices) || vertices.length !== 4) {
          out.push({
            index: pathPrefix,
            severity: "warn",
            message:
              "quadrilateral: preset 없고 vertices 도 4개 아님 — normalize fallback (기본 정사각형)",
          });
        } else if (!vertices.every(isPoint)) {
          out.push({
            index: pathPrefix,
            severity: "warn",
            message: "quadrilateral.vertices 의 일부 항목이 [x, y] 형식 아님",
          });
        }
      }
      break;
    }
    case "polygon": {
      const vertices = obj.vertices as unknown[] | undefined;
      if (!Array.isArray(vertices) || vertices.length < 3) {
        out.push({
          index: pathPrefix,
          severity: "warn",
          message: "polygon.vertices 가 3개 미만 — normalize fallback (집 모양 5각형)",
        });
      } else if (!vertices.every(isPoint)) {
        out.push({
          index: pathPrefix,
          severity: "warn",
          message: "polygon.vertices 의 일부 항목이 [x, y] 형식 아님",
        });
      }
      break;
    }
    case "circle": {
      // center / radius 모두 optional (normalize 가 default 채움). 별도 검증 X.
      break;
    }
    case "coordinatePlane": {
      const functions = obj.functions as Array<{ expr?: unknown }> | undefined;
      if (Array.isArray(functions)) {
        functions.forEach((fn, i) => {
          if (fn && typeof fn === "object" && typeof fn.expr !== "string") {
            out.push({
              index: `${pathPrefix}.functions[${i}]`,
              severity: "error",
              message: "function.expr 가 string 아님",
            });
          }
        });
      }
      break;
    }
    case "solid": {
      if (typeof obj.shape !== "string") {
        out.push({
          index: pathPrefix,
          severity: "error",
          message: "solid.shape 필드 누락 또는 string 아님",
        });
      } else if (!VALID_SOLID_SHAPES.has(obj.shape)) {
        out.push({
          index: pathPrefix,
          severity: "warn",
          message: `solid.shape "${obj.shape}" 알 수 없음 — renderer 가 빈 출력 반환`,
        });
      }
      break;
    }
    case "composite": {
      const elements = obj.elements as unknown[] | undefined;
      if (!Array.isArray(elements) || elements.length === 0) {
        out.push({
          index: pathPrefix,
          severity: "warn",
          message: "composite.elements 가 비어있음",
        });
      } else {
        elements.forEach((el, i) => {
          validateOne(el, `${pathPrefix}.${i}`, out);
        });
      }
      break;
    }
  }
};

/**
 * 배열 검증. error 가 하나라도 있으면 renderer 가 깨질 위험 — 사용자에게
 * banner 권장. warn 만 있으면 normalize fallback 으로 *보기 좋게는* 그려짐.
 */
export const validateDiagramParams = (
  params: DiagramParams[] | null | undefined,
): DiagramIssue[] => {
  if (!params || params.length === 0) return [];
  const issues: DiagramIssue[] = [];
  params.forEach((p, i) => validateOne(p, String(i), issues));
  return issues;
};

/** DEV 콘솔에 prefix 로 로그. issues 가 비어 있으면 no-op. */
export const logDiagramIssues = (
  prefix: string,
  issues: DiagramIssue[],
): void => {
  if (issues.length === 0) return;
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console
  console.warn(
    `[diagram] ${prefix} — ${issues.length}건 검증 이슈:\n` +
      issues
        .map((iss) => `  · [${iss.severity}] params[${iss.index}]: ${iss.message}`)
        .join("\n"),
  );
};

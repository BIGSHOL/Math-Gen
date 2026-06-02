/**
 * Library 화면의 필터링 / 정렬 / 카운트 helper.
 *
 * LibraryScreen 의 collection / grade / tag 필터 state 와 sort segment 가
 * 실제 tests 배열에 적용되도록 derived 함수 묶음. Sidebar 의 카운트도
 * 여기서 실시간 계산 (이전 hardcoded 47/12/8 같은 mock 제거).
 *
 * **컬렉션 매핑 규칙** (사용자 결정 — mock 데이터 tag 분포 기반):
 *   - 전체            — 모든 tests
 *   - 모의평가        — tags.includes("모의평가")
 *   - 수능 기출       — tags.includes("수능")
 *   - 학교 시험       — tags.includes("내신")
 *   - 내가 만든 변형  — variants.length > 0
 *
 * 추후 TestPaper 에 `collection` 필드 직접 추가 시 이 매핑 단순화 가능.
 */

import type { TestPaper, TestStatus } from "@app/types";
import { GRADE_LABELS as MATH_GRADE_LABELS, type GradeKey } from "@app/services/ai/mathDefense";

export type Collection =
  | "전체"
  | "모의평가"
  | "수능 기출"
  | "학교 시험"
  | "내가 만든 변형";

/** 사이드바 학년 — *실 데이터의 grade 값 그대로*. mock 의 고정 union 폐기. */
export type GradeKey = string;

export type SortKey = "recent" | "name" | "status";

/** 한 test 가 특정 컬렉션에 속하는지. */
export const matchesCollection = (
  test: TestPaper,
  collection: Collection,
): boolean => {
  switch (collection) {
    case "전체":
      return true;
    case "모의평가":
      return test.tags.includes("모의평가");
    case "수능 기출":
      return test.tags.includes("수능");
    case "학교 시험":
      return test.tags.includes("내신");
    case "내가 만든 변형":
      return test.variants.length > 0;
    default:
      return true;
  }
};

/**
 * 사이드바 학년 ↔ test.grade 매칭. 학년 키는 *실 데이터의 grade 값 그대로*
 * (예: "중1", "중3", "고2", "재수"). 사이드바 chip 자체가 데이터 기반 동적
 * 생성이라 hard-coded 매핑 없음.
 */
export const matchesGrade = (
  test: TestPaper,
  grade: GradeKey | undefined,
): boolean => {
  if (!grade) return true;
  return test.grade === grade;
};

/** 선택된 태그가 *모두* 포함된 test 만 통과 (AND 필터). */
export const matchesTags = (
  test: TestPaper,
  selectedTags: ReadonlySet<string>,
): boolean => {
  if (selectedTags.size === 0) return true;
  for (const tag of selectedTags) {
    if (!test.tags.includes(tag)) return false;
  }
  return true;
};

/**
 * 검색어 부분 매칭 — title / subject / tags 중 하나라도 substring 포함.
 * 빈 query 통과. 한글·영문 모두 대소문자 무시.
 */
export const matchesQuery = (test: TestPaper, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (test.title.toLowerCase().includes(q)) return true;
  if (test.subject && test.subject.toLowerCase().includes(q)) return true;
  for (const tag of test.tags) {
    if (tag.toLowerCase().includes(q)) return true;
  }
  return false;
};

/** 정렬 우선순위 — 상태별 정렬 시 검토 필요 (warn) 가 먼저. */
const STATUS_ORDER: Record<TestStatus, number> = {
  warn: 0,
  draft: 1,
  ok: 2,
};

/**
 * tests 배열 정렬. *원본 mutate X* — 새 배열 반환.
 *
 * - `recent` — createdAt (ISO) 기준 내림차순 (최신이 먼저). createdAt 없는
 *   row 는 맨 뒤. 동률이면 원본 순서 (stable sort).
 * - `name`   — title 의 한국어 사전순.
 * - `status` — warn → draft → ok.
 */
export const sortTests = (
  tests: TestPaper[],
  by: SortKey,
): TestPaper[] => {
  const arr = [...tests];
  switch (by) {
    case "name":
      arr.sort((a, b) => a.title.localeCompare(b.title, "ko"));
      break;
    case "status":
      arr.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
      break;
    case "recent":
    default:
      arr.sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta; // 최신 먼저
      });
      break;
  }
  return arr;
};

/** 컬렉션별 카운트 — 사이드바 카운트 표시용. */
export const countByCollection = (
  tests: TestPaper[],
): Record<Collection, number> => {
  const counts: Record<Collection, number> = {
    "전체": tests.length,
    "모의평가": 0,
    "수능 기출": 0,
    "학교 시험": 0,
    "내가 만든 변형": 0,
  };
  for (const t of tests) {
    if (t.tags.includes("모의평가")) counts["모의평가"]++;
    if (t.tags.includes("수능")) counts["수능 기출"]++;
    if (t.tags.includes("내신")) counts["학교 시험"]++;
    if (t.variants.length > 0) counts["내가 만든 변형"]++;
  }
  return counts;
};

/**
 * tests 에 실제 존재하는 grade 값 + 한국어 display label + 카운트.
 *
 * 중1/2/3, 고1/2/3, 재수, 그 외 (예: 초등 / 영재) 모두 자동 노출. 빈 데이터
 * 학년은 노출 X — UX 의 "카운트 0 chip 군집" 회피.
 *
 * **filter key 와 display label 분리**: DB 의 grade 컬럼이 "middle1"/"high2"
 * 같은 영어 enum 일 수 있어 *필터 매칭은 원본 값* (`grade`), *사이드바 라벨*
 * 은 한국어 (`label`). 새 enum 추가 시 GRADE_LABELS 에만 매핑 추가.
 */
const GRADE_LABELS: Record<string, { label: string; order: number; icon: string }> = {
  // 한국어 직접 입력 (mock / 새 데이터)
  "중1": { label: "중1", order: 0, icon: "circle-dashed" },
  "중2": { label: "중2", order: 1, icon: "circle-dashed" },
  "중3": { label: "중3", order: 2, icon: "circle-dashed" },
  "고1": { label: "고1", order: 3, icon: "circle" },
  "고2": { label: "고2", order: 4, icon: "circle" },
  "고3": { label: "고3", order: 5, icon: "circle" },
  "재수": { label: "재수", order: 6, icon: "circle-half" },
  // 영어 enum (현행 DB 일부 row)
  "middle1": { label: "중1", order: 0, icon: "circle-dashed" },
  "middle2": { label: "중2", order: 1, icon: "circle-dashed" },
  "middle3": { label: "중3", order: 2, icon: "circle-dashed" },
  "high1": { label: "고1", order: 3, icon: "circle" },
  "high2": { label: "고2", order: 4, icon: "circle" },
  "high3": { label: "고3", order: 5, icon: "circle" },
  "retake": { label: "재수", order: 6, icon: "circle-half" },
};

/**
 * grade 키 → {label, order, icon}. local 맵(짧은 enum)에 없으면 canonical
 * GRADE_LABELS(mathDefense, high1_common1 등 교육과정 suffix 포함)로 한글화하고
 * prefix 로 order/icon 추정. 사용자 보고 2026-06-02: 좌측 사이드바 학년이
 * "high1_common1" 영문 그대로 노출.
 */
const gradeMeta = (grade: string): { label: string; order: number; icon: string } => {
  const local = GRADE_LABELS[grade];
  if (local) return local;
  const label = MATH_GRADE_LABELS[grade as GradeKey] ?? grade;
  const mid = grade.match(/(?:middle|중)\s*([1-3])/);
  if (mid) return { label, order: Number(mid[1]) - 1, icon: "circle-dashed" };
  const high = grade.match(/(?:high|고)\s*([1-3])/);
  if (high) return { label, order: 3 + (Number(high[1]) - 1), icon: "circle" };
  if (/retake|재수/.test(grade)) return { label, order: 6, icon: "circle-half" };
  return { label, order: 999, icon: "circle" };
};

export const gradesPresent = (
  tests: TestPaper[],
): Array<{ grade: string; label: string; count: number; icon: string }> => {
  const counts = new Map<string, number>();
  for (const t of tests) {
    if (!t.grade) continue;
    counts.set(t.grade, (counts.get(t.grade) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([grade, count]) => {
      const meta = gradeMeta(grade);
      return {
        grade,
        label: meta.label,
        count,
        icon: meta.icon,
        _order: meta.order,
      };
    })
    .sort((a, b) => {
      if (a._order !== b._order) return a._order - b._order;
      return a.grade.localeCompare(b.grade, "ko");
    })
    .map(({ _order: _, ...rest }) => rest);
};

/**
 * 카운트 > 0 인 컬렉션만 추출. "전체" 는 항상 포함 — 기본 진입점.
 * 사용자 실 데이터에 매칭 키가 0 인 컬렉션 chip 은 숨겨서 UX 정리.
 */
export const collectionsPresent = (
  counts: Record<Collection, number>,
): Collection[] => {
  const result: Collection[] = ["전체"];
  if (counts["모의평가"] > 0) result.push("모의평가");
  if (counts["수능 기출"] > 0) result.push("수능 기출");
  if (counts["학교 시험"] > 0) result.push("학교 시험");
  if (counts["내가 만든 변형"] > 0) result.push("내가 만든 변형");
  return result;
};

/**
 * 태그 카탈로그 — 사이드바에 노출할 *대표 태그* + 각 카운트.
 *
 * 모든 tests 의 tags 를 flatten + 카운트 — 빈도 높은 상위 N 개 노출.
 * 컬렉션 매핑 키 (모의평가/수능/내신/단원평가) 와 학년 chip (고1~고3,중3)
 * 은 별도 영역이므로 *제외* — 중복 방지.
 */
const COLLECTION_TAG_KEYS = new Set([
  "모의평가",
  "수능",
  "내신",
]);
const GRADE_TAG_KEYS = new Set(["고1", "고2", "고3", "재수", "중1", "중2", "중3"]);

export const topTagsByFrequency = (
  tests: TestPaper[],
  limit = 8,
): Array<{ tag: string; count: number }> => {
  const counts = new Map<string, number>();
  for (const t of tests) {
    for (const tag of t.tags) {
      if (COLLECTION_TAG_KEYS.has(tag)) continue;
      if (GRADE_TAG_KEYS.has(tag)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

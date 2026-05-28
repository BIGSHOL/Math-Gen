/**
 * 학습 대책 탭 derived 헬퍼 (Phase N+4).
 *
 * mathlab `StudyStrategyTab.tsx` 의 useMemo 로직 carry-over.
 * questions → topicSummaries (소단원) + chapterGroups (대단원).
 *
 * student 데이터 (is_correct / error_type / earned_points) 의존 X — blank paper only.
 */

import type { AnalyzedQuestion, DifficultyBand } from "@app/types/examAnalysis";

export interface TopicSummary {
  topic: string; // 전체 path ("중3 수학 > 이차방정식 > 풀이")
  shortTopic: string; // 마지막 소단원
  questionCount: number;
  totalPoints: number;
  percentage: number;
  difficulties: DifficultyBand[];
  types: string[];
  essayCount: number;
  essayNumbers: number[];
  avgDifficulty: number;
  features: string[];
  questionNumbers: number[];
}

export interface ChapterGroup {
  chapterName: string;
  topics: TopicSummary[];
  questionCount: number;
  totalPoints: number;
  percentage: number;
  essayCount: number;
  essayNumbers: number[];
  avgDifficulty: number;
  features: string[];
}

const DIFFICULTY_WEIGHT: Record<string, number> = {
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
};

const parseQuestionNumber = (raw: number | string): number => {
  if (typeof raw === "number") return raw;
  const m = String(raw).match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
};

/**
 * questions → 토픽 요약 + 대단원 그룹.
 *
 * 특징 태그:
 *   - 소단원: "서술형 N번" / "고난도 집중" / "핵심 단원" (>= 20%)
 *   - 대단원: "서술형 N문항" / "고난도 집중" / "핵심 대단원" (>= 15%, 2대단원 이상일 때)
 */
export const deriveStudyStrategy = (
  questions: AnalyzedQuestion[],
): {
  topicSummaries: TopicSummary[];
  chapterGroups: ChapterGroup[];
  totalPoints: number;
} => {
  const totalPts = questions.reduce((sum, q) => sum + (q.points || 0), 0);

  // 1. 소단원별 그룹핑
  const topicMap = new Map<string, TopicSummary>();
  for (const q of questions) {
    const rawTopic = q.topic || "기타";
    const parts = rawTopic.split(" > ");
    const shortTopic = parts[parts.length - 1] || rawTopic;

    if (!topicMap.has(rawTopic)) {
      topicMap.set(rawTopic, {
        topic: rawTopic,
        shortTopic,
        questionCount: 0,
        totalPoints: 0,
        percentage: 0,
        difficulties: [],
        types: [],
        essayCount: 0,
        essayNumbers: [],
        avgDifficulty: 0,
        features: [],
        questionNumbers: [],
      });
    }

    const s = topicMap.get(rawTopic)!;
    s.questionCount++;
    s.totalPoints += q.points || 0;
    if (q.difficulty) s.difficulties.push(q.difficulty);
    if (q.question_type) s.types.push(q.question_type);

    const isEssay =
      q.question_format === "essay" || q.question_format === "short_answer";
    const qNum = parseQuestionNumber(q.question_number);

    if (isEssay) {
      s.essayCount++;
      if (qNum) s.essayNumbers.push(qNum);
    } else {
      if (qNum) s.questionNumbers.push(qNum);
    }
  }

  // 2. 소단원 통계 + 특징 태그
  for (const s of topicMap.values()) {
    s.percentage = totalPts > 0 ? (s.totalPoints / totalPts) * 100 : 0;
    if (s.difficulties.length > 0) {
      s.avgDifficulty =
        s.difficulties.reduce((a, d) => a + (DIFFICULTY_WEIGHT[d] || 2), 0) /
        s.difficulties.length;
    }
    if (s.essayCount > 0) s.features.push(`서술형 ${s.essayCount}번`);
    if (s.avgDifficulty >= 3) s.features.push("고난도 집중");
    if (s.percentage >= 20) s.features.push("핵심 단원");
  }

  const topicSummaries = Array.from(topicMap.values()).sort(
    (a, b) => b.totalPoints - a.totalPoints,
  );

  // 3. 대단원 그룹핑 (parts[1] 기준)
  const chapterMap = new Map<string, ChapterGroup>();
  for (const s of topicSummaries) {
    const parts = s.topic.split(" > ");
    const chName = parts.length >= 2 ? parts[1] : parts[0];
    if (!chapterMap.has(chName)) {
      chapterMap.set(chName, {
        chapterName: chName,
        topics: [],
        questionCount: 0,
        totalPoints: 0,
        percentage: 0,
        essayCount: 0,
        essayNumbers: [],
        avgDifficulty: 0,
        features: [],
      });
    }
    const ch = chapterMap.get(chName)!;
    ch.topics.push(s);
    ch.questionCount += s.questionCount;
    ch.totalPoints += s.totalPoints;
    ch.essayCount += s.essayCount;
    ch.essayNumbers.push(...s.essayNumbers);
  }

  // 4. 대단원 특징 태그
  for (const ch of chapterMap.values()) {
    ch.percentage = totalPts > 0 ? (ch.totalPoints / totalPts) * 100 : 0;
    const allDiffs = ch.topics.flatMap((t) => t.difficulties);
    if (allDiffs.length > 0) {
      ch.avgDifficulty =
        allDiffs.reduce((a, d) => a + (DIFFICULTY_WEIGHT[d] || 2), 0) /
        allDiffs.length;
    }
    if (ch.essayCount > 0) ch.features.push(`서술형 ${ch.essayCount}문항`);
    if (ch.avgDifficulty >= 3) ch.features.push("고난도 집중");
    if (chapterMap.size >= 2 && ch.percentage >= 15)
      ch.features.push("핵심 대단원");
    ch.topics.sort((a, b) => b.totalPoints - a.totalPoints);
  }

  const chapterGroups = Array.from(chapterMap.values()).sort(
    (a, b) => b.totalPoints - a.totalPoints,
  );

  return { topicSummaries, chapterGroups, totalPoints: totalPts };
};

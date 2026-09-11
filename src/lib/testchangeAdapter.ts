import type { TestPaper } from '../types';
import type { ContentBlock, SubQuestion } from '../types/ocrBlocks';
import type { OCRProblem } from '../stores/wizardStore';
import type { DetailData } from '../hooks/useDetailData';
import type { EngineBlock, EngineQuestion, TestchangeExam, TestchangeExamData, TestchangeQuestion } from '../types/testchange';
import { testchangeId, testchangeTitle } from '../types/testchange';
import { blocksToMarkdown } from './blocksToMarkdown';
import { ocrToGenerated } from './problemAdapter';

export const testchangeExamToTest = (exam: TestchangeExam): TestPaper => ({
  id: testchangeId(exam.id), title: testchangeTitle(exam),
  problemCount: exam.question_count ?? 0, status: 'ok', statusText: '기출 자료',
  time: `${exam.year ?? ''}년`, createdAt: exam.created_at,
  subject: exam.subject || '수학',
  tags: ['학교 시험', '기출', exam.school, exam.round ?? ''].filter(Boolean),
  grade: `${exam.level === '중' ? 'middle' : 'high'}${exam.grade ?? 1}`,
  topicDistribution: [], variants: [], problems: [], furthestStep: 6,
});

/** 엔진의 dict 표 셀과 도형 블록을 웹이 읽는 형식으로 변환. 원본 body는 변경하지 않는다. */
export function engineBlocksToWeb(blocks: EngineBlock[] = []): ContentBlock[] {
  return (Array.isArray(blocks) ? blocks : []).flatMap((b): ContentBlock[] => {
    if (!b || typeof b !== 'object') return [];
    if (b.type === 'figure' || b.type === 'image') {
      const description = b.desc || (typeof b.value === 'string' && !/[\\/]/.test(b.value) ? b.value : '');
      return [{ type: 'text', value: `\n\n※ 그림 자리${description ? ` — ${description}` : ''}\n\n`, rows: [] }];
    }
    if (!['text', 'equation', 'equation_block', 'table'].includes(b.type)) return [];
    const rawRows = Array.isArray(b.rows) ? b.rows : Array.isArray(b.value) ? b.value : [];
    const rows = rawRows.filter(Array.isArray).map(row => row.map(cell => {
      if (cell && typeof cell === 'object') return String(cell.value ?? cell.text ?? '');
      return String(cell ?? '');
    }));
    return [{ type: b.type as ContentBlock['type'], value: typeof b.value === 'string' ? b.value : '', rows }];
  });
}

function subToWeb(q: EngineQuestion): SubQuestion {
  return { number: q.number ?? 1, contents: engineBlocksToWeb(q.contents),
    choices: q.choices?.map(c => ({ number: c.number, contents: engineBlocksToWeb(c.contents) })),
    score: Number.isFinite(Number(q.score)) && q.score != null ? Number(q.score) : undefined,
    printedScore: typeof q.score === 'string' && /^\d+(?:\.\d+)?$/.test(q.score.trim()) ? q.score.trim() : undefined,
    labelType: q.label_type };
}

export function testchangeQuestionToOcr(row: TestchangeQuestion): OCRProblem {
  const blocks = engineBlocksToWeb(row.body.contents);
  const choices = row.body.choices?.map(c => ({ number: c.number, contents: engineBlocksToWeb(c.contents) })) ?? [];
  const subs = row.body.sub_questions?.map(subToWeb) ?? [];
  const source = row.answer_source;
  const computed = Boolean(row.answer && source !== 'printed');
  return { id: `testchange:q:${row.id}`, number: row.number,
    text: blocksToMarkdown(blocks, choices, subs) || row.plain || '',
    blocks, choiceGroups: choices, subQuestions: subs,
    score: row.score ?? undefined, labelType: row.body.label_type || row.label || undefined,
    printedScore: typeof row.body.score === 'string' && /^\d+(?:\.\d+)?$/.test(row.body.score.trim()) ? row.body.score.trim() : undefined,
    answer: row.answer ?? undefined, solution: row.solution ?? undefined, topic: row.topic ?? undefined,
    status: computed ? 'warn' : 'ok', reviewed: false,
    solutionWarnings: computed ? [{ rule: 'answer-source', summary: '생성 정답 · 검토 필요',
      detail: `원본에 인쇄된 정답이 아닙니다. 출처: ${source || '미확인'}` }] : undefined,
  };
}

export function testchangeToDetail(data: TestchangeExamData): DetailData {
  const id = testchangeId(data.exam.id);
  const pageId = `${id}:contents`;
  const problems = data.questions.map(testchangeQuestionToOcr);
  return {
    pages: [{ id: pageId, test_id: id, page_num: 1, rotation: 0, text_layer: null,
      is_problem_page: true, force_ocr: false, image_storage_path: null, thumb_storage_path: null,
      ocr_complete: true, ocr_model: null, ocr_error: null, crop_boxes: [], crop_inspected: true,
      created_at: data.exam.created_at }],
    problems, problemsByPage: new Map([[pageId, problems]]),
    reviews: problems.map(p => ({ id: p.id, original: ocrToGenerated(p), variant: ocrToGenerated(p),
      status: p.status === 'warn' ? 'review' : 'confirmed' })),
    history: [], loading: false, error: null,
  };
}

/** 최신 커넥터의 엔진 봉투 경로: 도형 spec/SVG·배점 문자열·소문항을 그대로 전달한다. */
export const testchangeToHwp = (data: TestchangeExamData) => ({
  header: testchangeTitle(data.exam),
  renderFigures: true,
  filename: `[${data.exam.school}][${data.exam.grade ?? ''}][${data.exam.subject ?? '수학'}][${String(data.exam.year ?? '').slice(-2)}-${data.exam.semester ?? ''}-${data.exam.round ?? ''}]${data.exam.publisher ? `[${data.exam.publisher}]` : ''}.pdf`,
  questions: data.questions.map(row => ({ ...row.body, number: row.number,
    answer: row.answer ?? row.body.answer ?? '', solution: row.solution ?? row.body.solution ?? '',
    topic: row.topic ?? row.body.topic ?? '', difficulty: row.difficulty ?? row.body.difficulty ?? '',
    score: row.body.score ?? row.score ?? undefined })),
});

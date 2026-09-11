/** testchange Supabase의 기존 exams/questions 계약. 원본 body는 HWP 전달까지 보존한다. */
export interface TestchangeExam {
  id: number;
  level: string | null;
  school: string;
  grade: number | null;
  subject: string | null;
  year: number | null;
  semester: number | null;
  round: string | null;
  publisher: string | null;
  question_count: number | null;
  created_at: string;
}

export interface EngineBlock {
  type: string;
  value?: unknown;
  rows?: unknown[][];
  desc?: string;
  svg?: string;
  spec?: unknown;
  crop?: string;
  [key: string]: unknown;
}

export interface EngineQuestion {
  number?: number;
  contents?: EngineBlock[];
  choices?: Array<{ number: number; contents: EngineBlock[] }>;
  sub_questions?: EngineQuestion[];
  score?: number | string;
  label_type?: string;
  answer?: string;
  solution?: string;
  [key: string]: unknown;
}

export interface TestchangeQuestion {
  id: number;
  exam_id: number;
  number: number;
  qtype: string | null;
  score: number | null;
  label: string | null;
  body: EngineQuestion;
  plain: string | null;
  answer: string | null;
  solution: string | null;
  topic: string | null;
  difficulty: string | null;
  answer_source: string | null;
  has_figure: boolean;
}

export interface TestchangeExamData {
  exam: TestchangeExam;
  questions: TestchangeQuestion[];
}

export const testchangeId = (id: number): string => `testchange:${id}`;
export const isTestchangeId = (id: string | null | undefined): boolean =>
  /^testchange:\d+$/.test(id ?? '');

export const testchangeTitle = (exam: TestchangeExam): string =>
  [exam.school, exam.grade ? `${exam.level ?? ''}${exam.grade}` : '',
    exam.subject, exam.year ? `${exam.year}년` : '',
    exam.semester ? `${exam.semester}학기` : '', exam.round].filter(Boolean).join(' ');

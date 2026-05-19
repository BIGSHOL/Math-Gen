export enum SchoolLevel {
  ELEMENTARY = '초등학교',
  MIDDLE = '중학교',
  HIGH = '고등학교'
}

export enum Difficulty {
  LOW = '하',
  MEDIUM = '중',
  HIGH = '상',
  EXTREME = '최상'
}

export enum ProblemType {
  CONCEPT = '개념 확인',
  TYPE = '유형 익히기',
  SKILL = '실력 다지기',
  CREATIVE = '창의 융합'
}

export enum AnswerType {
  MULTIPLE_CHOICE = '객관식 (5지선다)',
  SUBJECTIVE = '주관식/서술형'
}

// Hierarchical Curriculum Data Structure
export interface CurriculumUnit {
  name: string;
  subUnits?: CurriculumUnit[];
}

export interface GeneratedProblem {
  question: string;
  choices?: string[]; // Optional for multiple choice
  answer: string;
  solution: string;
  topic: string; // The specific topic derived
  difficulty: string;
  diagramSVG?: string | null; // Optional SVG code for geometry/graphs/tables
}

export type GenerationMode = 'curriculum' | 'image' | 'exact' | 'diagram';

export interface SelectionState {
  mode: GenerationMode;
  sourceImage?: string | null; // Base64 string for image input
  schoolLevel: SchoolLevel;
  grade: string;
  mainUnit: string;
  subUnit: string;
  detailUnit: string;
  difficulty: Difficulty;
  problemType: ProblemType;
  answerType: AnswerType;
  removeScore?: boolean;
}
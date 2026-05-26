// templates/index.ts
// 6 신규 인쇄 template + 공통 유틸 barrel export. Step5Export 의 dispatcher 가
// 이 한 import 로 모든 template 접근.

export { PyeonggaTemplate } from "./PyeonggaTemplate";
export { JeongtongTemplate } from "./JeongtongTemplate";
export { ModernTemplate } from "./ModernTemplate";
export { WorkbookTemplate } from "./WorkbookTemplate";
export { JaseupTemplate } from "./JaseupTemplate";
export { YuhyungTemplate } from "./YuhyungTemplate";

export { ProblemBody, type ProblemBodyProps } from "./ProblemBody";
export { BodyContainer } from "./BodyContainer";
export { QuestionNumber, PointsLabel, TopicLabel } from "./ProblemMeta";

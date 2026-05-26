// index.ts — 6개 신규 인쇄 템플릿 entry point.
// BIGSHOL/Math-Gen 의 PrintActionPanel / Step5Export 에서 dispatch.

import type React from "react";
import type {
  PrintTemplate,
  PrintTemplateProps,
} from "./PrintTemplate.types";
import { PyeonggaTemplate } from "./templates/PyeonggaTemplate";
import { JeongtongTemplate } from "./templates/JeongtongTemplate";
import { ModernTemplate } from "./templates/ModernTemplate";
import { WorkbookTemplate } from "./templates/WorkbookTemplate";
import { JaseupTemplate } from "./templates/JaseupTemplate";
import { YuhyungTemplate } from "./templates/YuhyungTemplate";

export const TEMPLATE_REGISTRY: Record<
  PrintTemplate,
  React.FC<PrintTemplateProps>
> = {
  pyeongga: PyeonggaTemplate,
  jeongtong: JeongtongTemplate,
  modern: ModernTemplate,
  workbook: WorkbookTemplate,
  jaseup: JaseupTemplate,
  yuhyung: YuhyungTemplate,
};

export { PyeonggaTemplate, JeongtongTemplate, ModernTemplate };
export { WorkbookTemplate, JaseupTemplate, YuhyungTemplate };
export { BodyContainer } from "./BodyContainer";
export { QuestionNumber, PointsLabel, TopicLabel } from "./ProblemMeta";
export {
  PAPER_COLORS,
  PAPER_FONTS,
  A4_DIM,
  TEMPLATE_DEFAULT_ACCENT,
} from "./paperTokens";
export type {
  PrintTemplate,
  PrintTemplateProps,
  PrintMeta,
  PrintOptions,
  ProblemReview,
  GeneratedProblem,
  ExportSource,
} from "./PrintTemplate.types";
export { DEFAULT_PRINT_OPTIONS } from "./PrintTemplate.types";

/**
 * 사용 예시:
 *
 *   import { TEMPLATE_REGISTRY } from "./design_handoff_print_templates/src";
 *
 *   const Template = TEMPLATE_REGISTRY[options.template];
 *   return (
 *     <A4PrintPage>
 *       <Template
 *         page={pageIdx + 1}
 *         totalPages={pages.length}
 *         columns={options.columns}
 *         meta={meta}
 *         problems={page.problems}
 *         startingNumber={page.startingNumber}
 *         options={options}
 *       />
 *     </A4PrintPage>
 *   );
 */

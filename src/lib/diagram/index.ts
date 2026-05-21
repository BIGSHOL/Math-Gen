/**
 * Diagram module — public API.
 *
 * 사용:
 *   import { renderDiagram, type DiagramParams } from "@app/lib/diagram";
 *   const svg = renderDiagram({ type: "triangle", preset: "right", sides: {a:3,b:4,c:5} });
 *   // → "<svg ...>...</svg>" (inline SVG, dangerouslySetInnerHTML 로 주입 가능)
 */

export { renderDiagram } from "./renderer";
export { normalizeDiagram } from "./normalize";
export { evaluateExpr } from "./eval-expr";
export {
  validateDiagramParams,
  logDiagramIssues,
  type DiagramIssue,
  type DiagramIssueSeverity,
} from "./validate";

export type {
  DiagramParams,
  Point,
  DiagramLabel,
  EdgeLength,
  OutlineCurveOptions,
  TrianglePreset,
  QuadrilateralPreset,
  TriangleDiagram,
  CircleDiagram,
  QuadrilateralDiagram,
  PolygonDiagram,
  CoordinatePlaneDiagram,
  SolidFigureDiagram,
  CompositeDiagram,
} from "./types";

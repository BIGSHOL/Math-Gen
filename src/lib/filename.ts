// filename.ts
// 내보내기 파일명 sanitize — OS 금지 문자 치환. 한글은 그대로(jsPDF/브라우저 unicode 지원).
//
// pdfExporter.ts(jsPDF+html2canvas, ~1MB chunk)에서 분리한 *순수* 헬퍼. 서버 PDF·HWP·인쇄
// 경로가 파일명만 필요할 때 이 작은 모듈만 import 해 무거운 PDF 청크 로딩을 피한다(§45 Phase 2).
// pdfExporter.ts 는 이 함수를 re-export 하므로 기존 import 경로도 호환.

export function sanitizeFilename(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, "_").trim() || "변형시험지";
}

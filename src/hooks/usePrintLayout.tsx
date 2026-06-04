// usePrintLayout.tsx
// 측정 기반 페이지네이션 하니스. 선택된 인쇄 템플릿을 *화면 밖* 에 measure 모드로
// 렌더해 각 문항 래퍼의 offsetHeight 를 실측하고, 빈 probe 페이지로 헤더/푸터를
// 제외한 가용 컨텐츠 높이를 실측한 뒤 printPack 으로 페이지/컬럼을 정한다.
//
// 추측(글자수) 이 아니라 실측 → 페이지 넘침·잘림 + 2단 개수분할 모순 해소
// (CLAUDE.md §내보내기 R1·R2·R3·R4).
//
// 성능: *측정* 은 content/template/columns/fontPack 변화에만 (measureKey), *패킹*
// 은 spacing 까지 포함해 useMemo 로 즉시 재계산 (측정 없이). spacing 토글이 무거운
// 재렌더를 유발하지 않음. zustand 루프 회피: 결과는 로컬 state, 인자는 호출측이
// 이미 select 한 primitives/refs (inline selector 없음).

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  ExportSource,
  PrintOptions,
  ProblemReview,
} from "@app/stores/wizardStore";
import type {
  PrintMeta,
  PrintTemplate,
  PrintTemplateProps,
} from "@app/components/print/types";
import { columnContentWidth } from "@app/lib/printGeometry";
import { packProblems, type PackedPage } from "@app/lib/printPack";
import { getFontPack } from "@app/lib/printFontPacks";
import {
  PyeonggaTemplate,
  JeongtongTemplate,
  ModernTemplate,
  WorkbookTemplate,
  JaseupTemplate,
  YuhyungTemplate,
} from "@app/components/print/templates";

const TEMPLATE_COMPONENTS: Record<PrintTemplate, ComponentType<PrintTemplateProps>> = {
  pyeongga: PyeonggaTemplate,
  jeongtong: JeongtongTemplate,
  modern: ModernTemplate,
  workbook: WorkbookTemplate,
  jaseup: JaseupTemplate,
  yuhyung: YuhyungTemplate,
};

/** probe 측정 실패 시 보수적 fallback (정상 경로에선 사용 안 됨). */
const FALLBACK_AVAIL = { first: 720, cont: 980 };

const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export interface UsePrintLayoutArgs {
  problems: ProblemReview[];
  options: PrintOptions;
  exportSource: ExportSource;
  /** Step5Export 가 렌더에 쓰는 것과 *동일* meta — probe 헤더 높이 정확도. */
  meta: PrintMeta;
}

export interface UsePrintLayoutResult {
  pages: PackedPage[];
  /** 첫 측정 완료 여부. Step5 가 (!ready && pages.length===0) 일 때 skeleton. */
  ready: boolean;
  /** Step5Export 가 *화면 밖* 에 렌더해야 하는 측정 노드. */
  measureNode: ReactNode;
}

export function usePrintLayout({
  problems,
  options,
  exportSource,
  meta,
}: UsePrintLayoutArgs): UsePrintLayoutResult {
  const {
    template,
    columns,
    spacing,
    fontPack,
    showChapter,
    showDifficulty,
    layoutMode,
    problemsPerColumn,
  } = options;

  // 측정에 영향 주는 입력만 (spacing 제외 — gap 은 item offsetHeight 에 영향 X).
  const measureKey = useMemo(() => {
    const content = problems
      .map((p) => {
        const v = p.variant;
        return [
          p.id,
          v.question,
          (v.choices ?? []).join("¦"),
          v.choicesLayout ?? "",
          v.topic ?? "",
          v.points ?? "",
          v.diagramParams?.length ?? 0,
          v.diagramSVG ? 1 : 0,
          v.images?.length ?? 0,
        ].join("§");
      })
      .join("‖");
    return [
      template,
      columns,
      fontPack,
      showChapter ? 1 : 0,
      showDifficulty ? 1 : 0,
      exportSource,
      layoutMode,
      problemsPerColumn,
      JSON.stringify(meta),
      content,
    ].join("~");
  }, [
    problems,
    template,
    columns,
    fontPack,
    showChapter,
    showDifficulty,
    exportSource,
    layoutMode,
    problemsPerColumn,
    meta,
  ]);

  const hostRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{
    heights: number[];
    avail: { first: number; cont: number };
    key: string;
  } | null>(null);

  // 측정 effect — fonts.ready + rAF×2 후 offsetHeight 수집 (KaTeX 동기 렌더라
  // paint 후 높이 안정, pdfExporter.waitForFonts 와 동일 패턴).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {
          /* 폰트 로드 실패해도 측정 진행 */
        }
      }
      await raf();
      await raf();
      if (cancelled) return;
      const host = hostRef.current;
      if (!host) return;

      const heights: number[] = [];
      const itemsHost = host.querySelector("[data-measure-items]");
      if (itemsHost) {
        itemsHost
          .querySelectorAll<HTMLElement>("[data-measure-idx]")
          .forEach((el) => {
            const idx = Number(el.dataset.measureIdx);
            if (Number.isFinite(idx)) heights[idx] = el.offsetHeight;
          });
      }
      const firstBody = host.querySelector(
        '[data-measure-probe="first"] .measure-body',
      ) as HTMLElement | null;
      const contBody = host.querySelector(
        '[data-measure-probe="cont"] .measure-body',
      ) as HTMLElement | null;
      const avail = {
        first: firstBody?.clientHeight || FALLBACK_AVAIL.first,
        cont: contBody?.clientHeight || FALLBACK_AVAIL.cont,
      };
      if (cancelled) return;
      setMeasured({ heights, avail, key: measureKey });
    })();
    return () => {
      cancelled = true;
    };
  }, [measureKey]);

  // 패킹 — spacing 포함, 측정 없이 즉시 재계산. 측정 키 mismatch 동안엔 이전 결과
  // 유지 (빈 화면/잘못된 높이 패킹 방지).
  const prevPagesRef = useRef<PackedPage[]>([]);
  const pages = useMemo(() => {
    if (!measured || measured.key !== measureKey) return prevPagesRef.current;
    const packed = packProblems({
      problems,
      heights: measured.heights,
      avail: measured.avail,
      options: { template, columns, spacing, layoutMode, problemsPerColumn },
    });
    prevPagesRef.current = packed;
    return packed;
  }, [
    measured,
    measureKey,
    problems,
    template,
    columns,
    spacing,
    layoutMode,
    problemsPerColumn,
  ]);

  const ready = measured !== null && measured.key === measureKey;

  // ── 측정 노드 (화면 밖) ───────────────────────────────────────────────
  // useMemo — zoom(scale) 같은 빈번한 부모 re-render 에 30+ MarkdownRenderer 가
  // 재파싱되지 않도록 높이 영향 입력에만 의존.
  const measureNode = useMemo(() => {
    const TemplateComp = TEMPLATE_COMPONENTS[template] ?? JeongtongTemplate;
    const columnWidthPx = columnContentWidth(template, columns);
    const fontPackResolved = getFontPack(fontPack);
    const fontVars = {
      "--paper-font-serif": fontPackResolved.serif,
      "--paper-font-sans": fontPackResolved.sans,
    } as CSSProperties;
    const baseProps = { totalPages: 2, columns, meta, options, startingNumber: 1 };
    return (
      <div
        ref={hostRef}
        aria-hidden
        style={{
          position: "fixed",
          left: -100000,
          top: 0,
          pointerEvents: "none",
          ...fontVars,
        }}
      >
        {/* 전체 문항 — measure 모드 (본문만 1단 flow, 타겟 컬럼 폭). offsetHeight 실측. */}
        <div data-measure-items>
          <TemplateComp
            {...baseProps}
            page={1}
            problems={problems}
            measure={{ columnWidthPx }}
          />
        </div>
        {/* probe — 빈 문항 첫 페이지(헤더 있음) / 이후 페이지(헤더 없음). 가용 높이 실측. */}
        <div data-measure-probe="first">
          <TemplateComp {...baseProps} page={1} problems={[]} />
        </div>
        <div data-measure-probe="cont">
          <TemplateComp {...baseProps} page={2} problems={[]} />
        </div>
      </div>
    );
  }, [template, columns, fontPack, problems, meta, options]);

  return { pages, ready, measureNode };
}

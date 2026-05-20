import { useState } from "react";
import SelectionPanel from "../../components/SelectionPanel";
import ProblemDisplay from "../../components/ProblemDisplay";
import DiagramEditor from "@app/components/math/DiagramEditor";
import { generateMathProblem } from "@app/services/ai";
import {
  AnswerType,
  Difficulty,
  ProblemType,
  SchoolLevel,
  type GeneratedProblem,
  type SelectionState,
} from "@app/types";

const INITIAL_SELECTION: SelectionState = {
  mode: "curriculum",
  sourceImage: null,
  schoolLevel: SchoolLevel.HIGH,
  grade: "공통수학1",
  mainUnit: "다항식",
  subUnit: "다항식의 연산",
  detailUnit: "다항식의 덧셈과 뺄셈",
  difficulty: Difficulty.MEDIUM,
  problemType: ProblemType.TYPE,
  answerType: AnswerType.MULTIPLE_CHOICE,
  removeScore: false,
};

/**
 * Pre-rebuild single-page UI — kept reachable via `?legacy` so we can still
 * exercise the existing problem-generation flow while the new SaaS screens
 * are being built. Slated for deletion at the end of Phase 4 once the
 * wizard covers the same use cases.
 */
export const LegacyScreen = () => {
  const [selection, setSelection] = useState<SelectionState>(INITIAL_SELECTION);
  const [problem, setProblem] = useState<GeneratedProblem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const generated = await generateMathProblem(selection);
      setProblem(generated);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      setError("문제를 생성하는 도중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-100 font-sans text-slate-900 print:h-auto print:bg-white print:block">
      <div className="flex w-full h-full overflow-hidden print:h-auto print:overflow-visible print:block">
        <SelectionPanel
          selection={selection}
          onChange={setSelection}
          onGenerate={handleGenerate}
          isLoading={isLoading}
        />

        <div className="flex-1 flex flex-col h-full relative print:h-auto print:w-full print:block">
          {error && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-200 text-red-700 px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2 print:hidden">
              <span className="font-bold">오류!</span> {error}
            </div>
          )}

          {selection.mode === "diagram" ? (
            <div className="flex-1 h-full bg-white">
              <DiagramEditor
                initialSvg={problem?.diagramSVG || null}
                onSave={(newSvg) => {
                  if (problem) {
                    setProblem({ ...problem, diagramSVG: newSvg });
                  } else {
                    setProblem({
                      question: "도형 편집기에서 생성된 도형입니다.",
                      answer: "",
                      solution: "",
                      topic: "도형",
                      difficulty: "기본",
                      diagramSVG: newSvg,
                    });
                  }
                }}
                isModal={false}
              />
            </div>
          ) : (
            <ProblemDisplay
              problem={problem}
              isLoading={isLoading}
              mode={selection.mode}
              onUpdateProblem={setProblem}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default LegacyScreen;

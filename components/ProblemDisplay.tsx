import React, { useState } from 'react';
import { GeneratedProblem, GenerationMode } from '../types';
import MarkdownRenderer from './MarkdownRenderer';
import DiagramEditor from './DiagramEditor';
import { Eye, EyeOff, CheckCircle, HelpCircle, FileText, Image as ImageIcon, Printer, Code, PenTool } from 'lucide-react';

interface ProblemDisplayProps {
  problem: GeneratedProblem | null;
  isLoading: boolean;
  mode: GenerationMode;
  onUpdateProblem?: (problem: GeneratedProblem) => void;
}

const ProblemDisplay: React.FC<ProblemDisplayProps> = ({ problem, isLoading, mode, onUpdateProblem }) => {
  const [showSolution, setShowSolution] = useState(false);
  const [showRawFormat, setShowRawFormat] = useState(false);
  const [isEditingDiagram, setIsEditingDiagram] = useState(false);

  // Reset show solution when problem changes
  React.useEffect(() => {
    setShowSolution(false);
    setShowRawFormat(false);
    setIsEditingDiagram(false);
  }, [problem]);

  // Handler for saving diagram
  const handleSaveDiagram = (newSvg: string | null) => {
    if (problem && onUpdateProblem) {
      onUpdateProblem({
        ...problem,
        diagramSVG: newSvg
      });
    }
    setIsEditingDiagram(false);
  };

  // Handler for printing
  const handlePrint = (mode: 'problem' | 'solution') => {
    // Determine visibility based on mode
    if (mode === 'problem') {
      setShowSolution(false);
    } else {
      setShowSolution(true);
    }
    // Timeout to allow state update and re-render before printing
    setTimeout(() => {
      window.print();
    }, 100);
  };

  if (isLoading) {
    let loadingTitle = "AI 선생님이 문제를 만들고 있어요";
    let loadingDesc = "선택하신 단원과 난이도를 분석하여 최적의 문제를 생성 중입니다. 잠시만 기다려주세요.";

    if (mode === 'image') {
      loadingTitle = "AI 선생님이 유사 문제를 만들고 있어요";
      loadingDesc = "업로드하신 문제 사진을 분석하여 같은 개념의 새로운 문제를 생성 중입니다. 잠시만 기다려주세요.";
    } else if (mode === 'exact') {
      loadingTitle = "AI 선생님이 문제를 추출하고 있어요";
      loadingDesc = "업로드하신 문제 사진에서 텍스트와 수식을 추출하여 동일한 문제를 구성 중입니다. 잠시만 기다려주세요.";
    }

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center h-full">
        <div className="w-16 h-16 mb-6 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
        <h3 className="text-xl font-bold text-slate-800 mb-2">{loadingTitle}</h3>
        <p className="text-slate-500 max-w-sm">
          {loadingDesc}
        </p>
      </div>
    );
  }

  if (!problem) {
    let emptyTitle = "문제를 생성해보세요";
    let emptyDesc = "왼쪽 패널에서 학년, 단원, 난이도를 선택하고 '문제 생성하기' 버튼을 눌러주세요.";

    if (mode === 'image') {
      emptyTitle = "유사 문제를 생성해보세요";
      emptyDesc = "왼쪽 패널에 문제 사진을 업로드하고 '유사 문제 생성하기' 버튼을 눌러주세요.";
    } else if (mode === 'exact') {
      emptyTitle = "동일 문제를 추출해보세요";
      emptyDesc = "왼쪽 패널에 문제 사진을 업로드하고 '동일 문제 추출하기' 버튼을 눌러주세요.";
    }

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50/50 h-full">
        <div className="w-20 h-20 bg-indigo-50 text-indigo-200 rounded-3xl flex items-center justify-center mb-6">
          <FileText size={40} />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">{emptyTitle}</h3>
        <p className="text-slate-500 max-w-sm">
          {emptyDesc}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-100/50 p-4 md:p-8 print:p-0 print:bg-white print:overflow-visible">
      <div className="max-w-4xl mx-auto space-y-6 print:max-w-none print:space-y-4">
        
        {/* Actions Bar - Hidden on Print */}
        <div className="flex justify-between items-center print:hidden">
            <div className="flex items-center gap-2">
                <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-semibold tracking-wide">
                    {problem.topic}
                </span>
                <span className="bg-slate-200 text-slate-700 px-3 py-1 rounded-full text-xs font-semibold">
                    난이도: {problem.difficulty}
                </span>
            </div>
            <div className="flex gap-2">
                <button
                    onClick={() => handlePrint('problem')}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors text-sm font-medium shadow-sm"
                    title="문제지만 인쇄합니다 (정답 제외)"
                >
                    <Printer size={16} />
                    문제지 인쇄
                </button>
                <button
                    onClick={() => handlePrint('solution')}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors text-sm font-medium shadow-sm"
                    title="문제와 해설을 함께 인쇄합니다"
                >
                    <FileText size={16} />
                    해설지 인쇄
                </button>
            </div>
        </div>

        {/* Print Only Header */}
        <div className="hidden print:block border-b-2 border-slate-800 pb-2 mb-6">
            <div className="flex justify-between items-end">
                <h1 className="text-2xl font-bold text-slate-900">MathGen AI 문제지</h1>
                <div className="text-sm text-slate-600">
                    {problem.topic} | 난이도: {problem.difficulty}
                </div>
            </div>
        </div>

        {/* Question Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none print:rounded-none">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center gap-2 print:bg-transparent print:border-b print:border-slate-300 print:px-0 print:py-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold text-lg print:bg-black print:text-white print:w-6 print:h-6 print:text-sm print:rounded-md">Q</span>
            <span className="font-semibold text-slate-700 print:text-black">문제</span>
          </div>
          <div className="p-6 md:p-8 print:px-0 print:py-4">
            <MarkdownRenderer content={problem.question} className="text-lg md:text-xl text-slate-800 print:text-black font-exam" />
            
            {/* Visual Diagram (SVG) */}
            {problem.diagramSVG && (
              <div className="my-8 flex justify-center print:my-4 relative group">
                <div className="w-full max-w-lg">
                  <div 
                    className="w-full overflow-hidden rounded-lg border border-slate-100 bg-white p-6 shadow-sm print:shadow-none print:border-none print:p-0 [&_svg]:w-full [&_svg]:h-auto"
                    dangerouslySetInnerHTML={{ __html: problem.diagramSVG }} 
                  />
                  {/* Edit Diagram Button (Hover) */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                    <button
                      onClick={() => setIsEditingDiagram(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 shadow-sm rounded-md text-xs font-medium text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                    >
                      <PenTool size={14} />
                      도형 편집
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* If no diagram exists, allow adding one via editor */}
            {!problem.diagramSVG && (
              <div className="my-4 flex justify-center print:hidden">
                <button
                  onClick={() => setIsEditingDiagram(true)}
                  className="flex items-center gap-2 px-4 py-2 border border-dashed border-slate-300 rounded-lg text-slate-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors text-sm font-medium"
                >
                  <PenTool size={16} />
                  + 도형 추가하기
                </button>
              </div>
            )}

            {/* Choices if available - LAYOUT UPDATE */}
            {problem.choices && problem.choices.length > 0 ? (
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2 print:gap-x-8 print:gap-y-4 print:mt-4">
                {problem.choices.map((choice, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 group print:break-inside-avoid">
                    <span className="flex-shrink-0 text-lg text-slate-800 print:text-black font-exam leading-relaxed">
                      {['①', '②', '③', '④', '⑤'][idx] || `(${idx + 1})`}
                    </span>
                    <div className="flex-1">
                      <MarkdownRenderer content={choice} className="text-lg text-slate-800 [&_p]:my-0 print:text-black print:text-base font-exam" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
                /* Subjective Answer Box (Print Only) */
                <div className="hidden print:block mt-8 h-48 border border-slate-300 rounded-lg p-4 bg-white">
                    <div className="flex justify-between items-center mb-2">
                         <span className="text-slate-500 text-xs font-semibold">[답안 작성란]</span>
                         <span className="text-slate-300 text-xs">풀이 과정을 자세히 기술하세요.</span>
                    </div>
                </div>
            )}
          </div>
        </div>

        {/* Controls - Hidden on Print */}
        <div className="flex justify-end gap-2 print:hidden">
          <button
            onClick={() => setShowRawFormat(!showRawFormat)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm text-sm font-medium"
          >
            <Code size={18} />
            {showRawFormat ? '원본 서식 숨기기' : '원본 서식 보기'}
          </button>
          <button
            onClick={() => setShowSolution(!showSolution)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm text-sm font-medium"
          >
            {showSolution ? <EyeOff size={18} /> : <Eye size={18} />}
            {showSolution ? '정답 및 해설 숨기기' : '정답 및 해설 확인'}
          </button>
        </div>

        {/* Raw Format Display */}
        {showRawFormat && (
          <div className="animate-fade-in-up mt-6 print:hidden">
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-inner">
              <div className="bg-slate-900 px-4 py-3 border-b border-slate-700 flex items-center gap-2">
                <Code className="text-slate-400" size={18} />
                <span className="font-semibold text-slate-200 text-sm">원본 서식 (Markdown / LaTeX / SVG)</span>
              </div>
              <div className="p-4 overflow-x-auto max-h-[500px] overflow-y-auto">
                <pre className="text-slate-300 text-sm font-mono whitespace-pre-wrap">
                  {JSON.stringify(problem, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Answer & Solution Card */}
        {showSolution && (
          <div className="animate-fade-in-up space-y-6 print:space-y-4 print:mt-8">
            
            {/* Print Only Solution Header */}
            <div className="hidden print:block border-b border-slate-300 pb-1 mt-8 mb-4">
                <h2 className="text-xl font-bold text-slate-900">해설지</h2>
            </div>
            
            {/* Answer */}
            <div className="bg-green-50 rounded-xl border border-green-100 p-6 flex items-start gap-4 print:bg-transparent print:border-none print:p-0 print:block">
              <div className="flex items-center gap-2 mb-2 print:mb-1">
                <CheckCircle className="text-green-600 flex-shrink-0 print:text-black" size={24} />
                <h4 className="text-green-800 font-bold print:text-black">정답</h4>
              </div>
              <div className="print:pl-8">
                <MarkdownRenderer content={problem.answer} className="text-lg text-green-900 font-medium print:text-black font-exam" />
              </div>
            </div>

            {/* Detailed Solution */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none print:rounded-none print:break-inside-avoid">
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center gap-2 print:hidden">
                <HelpCircle className="text-slate-500" size={20} />
                <span className="font-semibold text-slate-700">상세 풀이</span>
              </div>
              <div className="hidden print:flex items-center gap-2 mb-2">
                 <span className="font-bold text-black border-b border-black">상세 풀이</span>
              </div>
              <div className="p-6 md:p-8 bg-white print:p-0 print:pl-2">
                 <MarkdownRenderer content={problem.solution} className="text-base text-slate-700 leading-relaxed print:text-black print:text-sm font-exam" />
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Diagram Editor Modal */}
      {isEditingDiagram && (
        <DiagramEditor
          initialSvg={problem?.diagramSVG || null}
          onSave={handleSaveDiagram}
          onClose={() => setIsEditingDiagram(false)}
        />
      )}
    </div>
  );
};

export default ProblemDisplay;
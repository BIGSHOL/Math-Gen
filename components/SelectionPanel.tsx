import React, { useEffect, useState, useRef } from 'react';
import { SelectionState, SchoolLevel, Difficulty, ProblemType, AnswerType, CurriculumUnit } from '../types';
import { MIDDLE_SCHOOL_CURRICULUM, HIGH_SCHOOL_CURRICULUM, ELEMENTARY_SCHOOL_CURRICULUM } from '../constants';
import { BookOpen, GraduationCap, Layers, Zap, PenTool, Image as ImageIcon, Upload, X, Copy, LayoutTemplate } from 'lucide-react';

interface SelectionPanelProps {
  selection: SelectionState;
  onChange: (newSelection: SelectionState) => void;
  onGenerate: () => void;
  isLoading: boolean;
}

const SelectionPanel: React.FC<SelectionPanelProps> = ({ selection, onChange, onGenerate, isLoading }) => {
  const [availableMainUnits, setAvailableMainUnits] = useState<CurriculumUnit[]>([]);
  const [availableSubUnits, setAvailableSubUnits] = useState<CurriculumUnit[]>([]);
  const [availableDetailUnits, setAvailableDetailUnits] = useState<CurriculumUnit[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update Main Units when Level/Grade changes
  useEffect(() => {
    let units: CurriculumUnit[] = [];
    if (selection.schoolLevel === SchoolLevel.ELEMENTARY) {
      units = ELEMENTARY_SCHOOL_CURRICULUM[selection.grade] || [];
    } else if (selection.schoolLevel === SchoolLevel.MIDDLE) {
      units = MIDDLE_SCHOOL_CURRICULUM[selection.grade] || [];
    } else {
      units = HIGH_SCHOOL_CURRICULUM[selection.grade] || [];
    }
    setAvailableMainUnits(units);
    
    // Reset downward selections safely only if we are in curriculum mode or initializing
    if (selection.mode === 'curriculum') {
       if (units.length > 0) {
        // Only reset if current selection is invalid for new grade
        const currentValid = units.some(u => u.name === selection.mainUnit);
        if (!currentValid) handleChange('mainUnit', units[0].name);
      } else {
        handleChange('mainUnit', '');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.schoolLevel, selection.grade]);

  // Update Sub Units when Main Unit changes
  useEffect(() => {
    const main = availableMainUnits.find(u => u.name === selection.mainUnit);
    const subs = main?.subUnits || [];
    setAvailableSubUnits(subs);

    if (selection.mode === 'curriculum') {
      if (subs.length > 0) {
         const currentValid = subs.some(u => u.name === selection.subUnit);
         if (!currentValid) handleChange('subUnit', subs[0].name);
      } else {
        handleChange('subUnit', '');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.mainUnit, availableMainUnits]);

  // Update Detail Units when Sub Unit changes
  useEffect(() => {
    const sub = availableSubUnits.find(u => u.name === selection.subUnit);
    const details = sub?.subUnits || [];
    setAvailableDetailUnits(details);

    if (selection.mode === 'curriculum') {
      if (details.length > 0) {
        const currentValid = details.some(u => u.name === selection.detailUnit);
        if (!currentValid) handleChange('detailUnit', details[0].name);
      } else {
        handleChange('detailUnit', '');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.subUnit, availableSubUnits]);

  // Handle Ctrl+V Paste for Images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Only active in Image or Exact Mode
      if (selection.mode !== 'image' && selection.mode !== 'exact') return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault(); // Prevent default paste behavior
            const reader = new FileReader();
            reader.onloadend = () => {
              // Update state directly using the prop function to avoid closure staleness if needed,
              // though here we use the wrapper which calls onChange with current selection spread.
              // We need to be careful about `selection` dependency.
              // Ideally, we construct the new state.
              onChange({ ...selection, sourceImage: reader.result as string });
            };
            reader.readAsDataURL(file);
            return; // Stop after finding the first image
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [selection.mode, selection, onChange]); 

  const handleChange = (field: keyof SelectionState, value: any) => {
    if (selection[field] !== value) {
      onChange({ ...selection, [field]: value });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleChange('sourceImage', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleChange('sourceImage', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const getGrades = () => {
    if (selection.schoolLevel === SchoolLevel.ELEMENTARY) {
      return [
        '1학년 1학기', '1학년 2학기', '2학년 1학기', '2학년 2학기', 
        '3학년 1학기', '3학년 2학기', '4학년 1학기', '4학년 2학기',
        '5학년 1학기', '5학년 2학기', '6학년 1학기', '6학년 2학기'
      ];
    } else if (selection.schoolLevel === SchoolLevel.MIDDLE) {
      return ['1학년 1학기', '1학년 2학기', '2학년 1학기', '2학년 2학기', '3학년 1학기', '3학년 2학기'];
    } else {
      return ['공통수학1', '공통수학2', '대수', '미적분I', '확률과 통계', '미적분II', '기하'];
    }
  };

  const isGenerateDisabled = () => {
    if (isLoading) return true;
    if (selection.mode === 'curriculum') return !selection.mainUnit;
    if (selection.mode === 'image' || selection.mode === 'exact') return !selection.sourceImage;
    return false;
  };

  return (
    <div className="w-full md:w-80 bg-white border-r border-slate-200 h-full flex flex-col print:hidden shadow-lg z-10">
      <div className="p-6 border-b border-slate-100">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <GraduationCap className="text-indigo-600" />
          MathGen AI
        </h1>
        <p className="text-xs text-slate-500 mt-1">2022 개정 교육과정 기반</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => handleChange('mode', 'curriculum')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative ${
            selection.mode === 'curriculum' 
              ? 'text-indigo-600' 
              : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <BookOpen size={16} />
          교과 선택
          {selection.mode === 'curriculum' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600" />}
        </button>
        <button
          onClick={() => handleChange('mode', 'image')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative ${
            selection.mode === 'image' 
              ? 'text-indigo-600' 
              : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <ImageIcon size={16} />
          유사 문제
          {selection.mode === 'image' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600" />}
        </button>
        <button
          onClick={() => handleChange('mode', 'exact')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative ${
            selection.mode === 'exact' 
              ? 'text-indigo-600' 
              : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Copy size={16} />
          동일 문제
          {selection.mode === 'exact' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600" />}
        </button>
        <button
          onClick={() => handleChange('mode', 'diagram')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative ${
            selection.mode === 'diagram' 
              ? 'text-indigo-600' 
              : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <LayoutTemplate size={16} />
          도형 편집
          {selection.mode === 'diagram' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* CURRICULUM MODE UI */}
        {selection.mode === 'curriculum' && (
          <>
            <div className="space-y-3">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <BookOpen size={16} /> 학제 및 학년
              </label>
              <div className="flex flex-wrap gap-2">
                {(Object.values(SchoolLevel) as string[]).map((level) => (
                  <button
                    key={level}
                    onClick={() => handleChange('schoolLevel', level)}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg transition-colors border text-center ${
                      selection.schoolLevel === level
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <select
                value={selection.grade}
                onChange={(e) => handleChange('grade', e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {getGrades().map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Layers size={16} /> 단원 선택
              </label>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-slate-500 mb-1 block">대단원</span>
                  <select
                    value={selection.mainUnit}
                    onChange={(e) => handleChange('mainUnit', e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 transition-colors"
                  >
                    {availableMainUnits.length > 0 ? (
                      availableMainUnits.map(u => <option key={u.name} value={u.name}>{u.name}</option>)
                    ) : (
                      <option value="">단원 없음</option>
                    )}
                  </select>
                </div>
                <div>
                  <span className="text-xs text-slate-500 mb-1 block">중단원</span>
                  <select
                    value={selection.subUnit}
                    onChange={(e) => handleChange('subUnit', e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 transition-colors"
                    disabled={availableSubUnits.length === 0}
                  >
                    {availableSubUnits.length > 0 ? (
                       availableSubUnits.map(u => <option key={u.name} value={u.name}>{u.name}</option>)
                    ) : (
                      <option value="">중단원 없음</option>
                    )}
                  </select>
                </div>
                <div>
                  <span className="text-xs text-slate-500 mb-1 block">소단원</span>
                   {availableDetailUnits.length > 0 ? (
                    <select 
                      value={selection.detailUnit}
                      onChange={(e) => handleChange('detailUnit', e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {availableDetailUnits.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
                    </select>
                  ) : (
                    <input 
                      type="text"
                      value={selection.detailUnit}
                      onChange={(e) => handleChange('detailUnit', e.target.value)}
                      placeholder="직접 입력"
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* IMAGE & EXACT MODE UI */}
        {(selection.mode === 'image' || selection.mode === 'exact') && (
          <div className="space-y-4">
             <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-xs text-blue-700 mb-2">
                {selection.mode === 'image' ? (
                  <><strong>유사 문제 생성:</strong> 문제 사진을 업로드하면 AI가 분석하여 같은 개념, 비슷한 난이도의 <strong>새로운 문제</strong>를 만들어줍니다.</>
                ) : (
                  <><strong>동일 문제 생성:</strong> 문제 사진을 업로드하면 AI가 사진 속 문제를 <strong>텍스트와 수식으로 똑같이</strong> 변환해 줍니다.</>
                )}
             </div>

             <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <ImageIcon size={16} /> 문제 사진 업로드
             </label>

             {!selection.sourceImage ? (
                <div 
                  className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                >
                   <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-3">
                      <Upload size={24} />
                   </div>
                   <p className="text-sm font-medium text-slate-700">클릭하여 이미지 업로드</p>
                   <p className="text-xs text-slate-400 mt-1">
                     파일을 여기로 드래그하거나<br/>
                     <span className="font-semibold text-indigo-500">Ctrl+V</span>로 붙여넣으세요
                   </p>
                </div>
             ) : (
                <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm group">
                   <img src={selection.sourceImage} alt="Uploaded Problem" className="w-full h-auto object-contain max-h-60 bg-slate-100" />
                   <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button 
                        onClick={() => handleChange('sourceImage', null)}
                        className="bg-white text-red-500 px-4 py-2 rounded-lg font-medium shadow-lg hover:bg-red-50 transition-colors flex items-center gap-2"
                      >
                         <X size={16} /> 이미지 삭제
                      </button>
                   </div>
                </div>
             )}
             <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={handleImageUpload}
             />
             
             {selection.mode === 'exact' && (
               <div className="flex items-center gap-2 mt-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                 <input
                   type="checkbox"
                   id="removeScore"
                   checked={selection.removeScore || false}
                   onChange={(e) => handleChange('removeScore', e.target.checked)}
                   className="w-4 h-4 shrink-0 text-indigo-600 bg-white border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                 />
                 <label htmlFor="removeScore" className="text-sm font-medium text-slate-700 cursor-pointer select-none whitespace-nowrap tracking-tight">
                   배점 제거 (예: '10점', '[5점]' 등 삭제)
                 </label>
               </div>
             )}
          </div>
        )}

        {/* DIAGRAM MODE UI */}
        {selection.mode === 'diagram' && (
          <div className="space-y-4">
             <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 text-sm text-indigo-800 mb-2 leading-relaxed">
                <strong>도형 편집기 모드</strong><br/><br/>
                우측 패널에서 도형을 자유롭게 생성하고 편집할 수 있습니다.<br/><br/>
                작업한 도형은 <strong>'현재 문제에 저장하기'</strong> 버튼을 눌러 생성된 문제에 포함시킬 수 있습니다.
             </div>
          </div>
        )}

        {/* Shared Difficulty & Type Controls - Hidden in Exact Mode and Diagram Mode */}
        {(selection.mode !== 'exact' && selection.mode !== 'diagram') && (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Zap size={16} /> 
              {selection.mode === 'curriculum' ? '난이도 및 유형' : '생성 옵션'}
            </label>
            <div className="space-y-2">
               {selection.mode === 'image' && (
                  <p className="text-xs text-slate-400 mb-2">
                    사진의 문제와 유사한 난이도로 생성되지만, 필요 시 아래 옵션으로 변경할 수 있습니다.
                  </p>
               )}
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={selection.difficulty}
                  onChange={(e) => handleChange('difficulty', e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
                >
                  {Object.values(Difficulty).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select
                  value={selection.problemType}
                  onChange={(e) => handleChange('problemType', e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none"
                >
                  {Object.values(ProblemType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Answer Type */}
              <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200">
                 {Object.values(AnswerType).map((type) => (
                   <button
                     key={type}
                     onClick={() => handleChange('answerType', type)}
                     className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                       selection.answerType === type
                         ? 'bg-white text-indigo-700 shadow-sm border border-slate-100'
                         : 'text-slate-500 hover:text-slate-700'
                     }`}
                   >
                     {type === AnswerType.MULTIPLE_CHOICE ? '객관식' : '주관식'}
                   </button>
                 ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {selection.mode !== 'diagram' && (
        <div className="p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onGenerate}
            disabled={isGenerateDisabled()}
            className={`w-full py-3.5 rounded-xl text-white font-bold shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-all ${
              isGenerateDisabled()
                ? 'bg-indigo-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-300 active:scale-95'
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                생성 중...
              </>
            ) : (
              <>
                <PenTool size={20} fill="currentColor" />
                {selection.mode === 'image' ? '유사 문제 생성하기' : selection.mode === 'exact' ? '동일 문제 추출하기' : '문제 생성하기'}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default SelectionPanel;
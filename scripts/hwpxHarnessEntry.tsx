import React from 'react';
import 'katex/dist/katex.min.css';
import { createRoot } from 'react-dom/client';
import { PyeonggaTemplate, JeongtongTemplate, ModernTemplate, WorkbookTemplate, JaseupTemplate, YuhyungTemplate } from '../src/components/print/templates';
import { useWizardStore, type ProblemReview } from '../src/stores/wizardStore';
import { collectHwpxLayout } from '../src/lib/hwpxLayout';
import { hwpxZip } from '../src/lib/hwpxZip';
import { getFontPack } from '../src/lib/printFontPacks';
import { printPagePadding } from '../src/lib/printGeometry';
import { PrintAnswerKeyPage } from '../src/components/print/PrintAnswerKeyPage';
export { collectHwpxLayout, hwpxZip };
const templates = { pyeongga: PyeonggaTemplate, jeongtong: JeongtongTemplate, modern: ModernTemplate, workbook: WorkbookTemplate, jaseup: JaseupTemplate, yuhyung: YuhyungTemplate };
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="200" height="130" viewBox="0 0 200 130"><path d="M20 110L100 15L180 110Z" stroke="black" fill="none" stroke-width="2"/><text x="95" y="13" font-size="12">A</text></svg>';
const problems = [1,2].map(n => ({ id:String(n), status:'approved', original: { number:n, question:'그림과 같은 삼각형에서 $x=\\frac{3}{2}$이다.\n넓이를 구하시오.\n[그림1]\n[4.1점]', choices:['$1$','$2$','$3$','$4$','$5$'], choicesLayout:'5x1', images:[{dataUrl:'data:image/svg+xml,'+encodeURIComponent(svg),label:'삼각형'}], answer:'③ 3', solution:'삼각형의 넓이는 $\\frac{1}{2}\\times 3\\times 2=3$이다.', topic:'삼각형의 넓이', difficulty:'중', score:4.1, diagramSVG:null } } as unknown as ProblemReview)).map(p=>({...p,variant:p.original}));
export function mountHwpxFixture() {
  const options = useWizardStore.getState().printOptions, font = getFontPack('system');
  const root=createRoot(document.getElementById('root')!);
  root.render(<div id="hwpx-fixture" style={{ '--paper-font-serif':font.serif, '--paper-font-sans':font.sans } as React.CSSProperties}>
    {Object.entries(templates).flatMap(([name,Component])=>[1,2].map(columns=><div key={name+columns} data-case={name+columns} data-print-page="true" style={{width:'210mm',height:'297mm',overflow:'hidden',background:'white'}}>
      <Component page={1} totalPages={1} columns={columns as 1|2} meta={{title:'함수와 도형 평가',schoolName:'수학고등학교',subject:'수학',grade:'2학년',semester:'1학기',examDate:'2026-09-13',examDuration:'50분',totalScore:100,academyName:'수학학원',instructorName:'김선생',conceptNote:'삼각형의 넓이',todayGoal:'도형의 넓이를 구할 수 있다.',patternName:'삼각형',patternStrategy:'밑변과 높이를 찾는다.'}}
       problems={columns===1?problems.slice(0,1):problems} startingNumber={1} splitIndex={1} options={{...options,template:name as keyof typeof templates,columns:columns as 1|2,marginPreset:'normal',showChapter:true,color:'#1d4ed8',showDifficulty:true,spacing:16}}/>
    </div>))}
    {[false,true].map(quickAnswerOnly=><div key={String(quickAnswerOnly)} data-print-page="true" style={{width:'210mm',height:'297mm',padding:printPagePadding('normal'),background:'white'}}><PrintAnswerKeyPage questionNumbers={[1,2]} allProblems={problems} options={{...options,showAnswers:true,quickAnswerOnly}} exportSource="original" testTitle="정답 검증" isFirstAnswerPage /></div>)}
  </div>);
}

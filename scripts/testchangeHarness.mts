import assert from 'node:assert/strict';
import { normalizeContents } from '../src/services/ai/contentParser';
import { blocksToMarkdown } from '../src/lib/blocksToMarkdown';
import { repositionScore } from '../src/lib/problemAdapter';
import { testchangeExamToTest, testchangeQuestionToOcr, testchangeToDetail, testchangeToHwp, engineBlocksToWeb } from '../src/lib/testchangeAdapter';
import type { TestchangeExamData } from '../src/types/testchange';
import type { ContentBlock } from '../src/types/ocrBlocks';
const text = (value: string): ContentBlock => ({type:'text',value,rows:[]});
const eq = (value: string): ContentBlock => ({type:'equation',value,rows:[]});
let checks = 0;
const check = (label: string, fn: () => void) => { fn(); checks++; console.log('PASS',label); };
check('원의 중심·선분 문맥과 확통 구별',()=>{
  assert.ok(blocksToMarkdown([text('원 '),eq('O'),text('에서')]).includes('\\mathrm{O}'));
  assert.ok(blocksToMarkdown([text('중심 '),eq('O')]).includes('\\mathrm{O}'));
  assert.ok(blocksToMarkdown([text('지점 '),eq('C'),text('와 '),eq('\\overline{AB}')]).includes('\\mathrm{C}'));
  assert.ok(!blocksToMarkdown([text('확률변수 '),eq('\\mathrm{X}')]).includes('\\mathrm{X}'));
});
check('수직선 좌표와 함수 인자 구별',()=>{
  assert.ok(blocksToMarkdown([text('수직선 위의 점 '),eq('A(-1)')]).includes('\\mathrm{A}\\mathit{(-1)}'));
  assert.ok(!blocksToMarkdown([text('함수 '),eq('F(x)')]).includes('\\mathrm{F}'));
});
check('과잉 백슬래시·cases 줄바꿈 보존',()=>{
  assert.equal(normalizeContents([eq(String.raw`\\sqrt{2}`)])[0].value,String.raw`\sqrt{2}`);
  assert.ok(normalizeContents([eq(String.raw`\begin{cases}x=1\\ y=2\end{cases}`)])[0].value.includes(String.raw`\\ y`));
});
check('물음표와 단서 괄호의 동일/교차 블록 공백',()=>{
  assert.equal(blocksToMarkdown([text('값은?(단, 양수이다)')]),'값은? (단, 양수이다)');
  assert.equal(blocksToMarkdown([text('값은?'),text('(단, 양수이다)')]),'값은? (단, 양수이다)');
});
check('짧은 값 나열만 display 강등',()=>{
  const run=[text('세 수 '),{...eq('3a-2,3b-2,3c-2'),type:'equation_block' as const},text('의 평균')];
  assert.ok(!blocksToMarkdown(run).includes('$$'));
  assert.ok(blocksToMarkdown([text('식 '),{...eq('a=2,b=3'),type:'equation_block'},text('의 값')]).includes('$$'));
});
check('소문항 중복 박스 제거·원본 불변',()=>{
  const sub={number:1,contents:[text('주어진 조건을 만족하는 자연수의 개수를 구하시오.')]};
  const raw=[text('다음 물음에 답하시오.'),text('<상자> 주어진 조건을 만족하는 자연수의 개수를 구하시오. [5점]')];
  const before=JSON.stringify(raw);
  const rendered=blocksToMarkdown(raw,[],[sub]);
  assert.equal(rendered.match(/자연수의 개수를/g)?.length,1);
  assert.equal(JSON.stringify(raw),before);
});
check('소수 배점·인쇄 문자열 보존',()=>{
  assert.equal(repositionScore('값은? [3.5점]',3.5),'값은? [3.5점]');
  assert.equal(repositionScore('값은?', '3.0'),'값은? [3.0점]');
  assert.equal(repositionScore('값은? [3.0점]'),'값은? [3.0점]');
});
const data: TestchangeExamData={exam:{id:17,level:'중',school:'검증중',grade:3,subject:'수학',year:2025,semester:1,round:'기말',publisher:null,question_count:1,created_at:'2025-06-01'},questions:[{
  id:19,exam_id:17,number:1,qtype:'서술형',score:3,label:null,
  body:{number:1,score:'3.0',contents:[{type:'text',value:'다음 값을 구하시오.'},{type:'figure',spec:{version:2},svg:'<svg/>'},{type:'table',rows:[[{value:'x'},{value:'2'}]]}],sub_questions:[{number:1,contents:[{type:'text',value:'값을 구하시오.'}]}]},
  plain:null,answer:'2',solution:'계산하면 2이다.',topic:'인수분해',difficulty:'중',answer_source:'computed:high',has_figure:true,
}]};
check('기출·문항·정답 출처·표 셀 어댑터',()=>{
  assert.equal(testchangeExamToTest(data.exam).id,'testchange:17');
  const q=testchangeQuestionToOcr(data.questions[0]);
  assert.equal(q.printedScore,'3.0'); assert.equal(q.status,'warn');
  assert.equal(q.solutionWarnings?.[0].rule,'answer-source');
  assert.deepEqual(engineBlocksToWeb(data.questions[0].body.contents).at(-1)?.rows,[['x','2']]);
  const detail=testchangeToDetail(data);
  assert.equal(detail.problemsByPage.get(detail.pages[0].id)?.length,1);
});
check('HWP 엔진 봉투 도형·배점·소문항 보존',()=>{
  const before=JSON.stringify(data);
  const wire=testchangeToHwp(data);
  assert.equal(wire.renderFigures,true);
  assert.equal(wire.questions[0].score,'3.0');
  assert.equal(wire.questions[0].contents?.[1].type,'figure');
  assert.equal(wire.questions[0].sub_questions?.length,1);
  assert.equal(JSON.stringify(data),before);
});
console.log(`${checks} testchange integration checks passed`);

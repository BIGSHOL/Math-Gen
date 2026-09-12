/** Run against local dev. Network is stubbed: no AI billing or database writes. */
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(process.env.DEV_URL || 'http://localhost:3005/', { waitUntil: 'networkidle0' });
  const results = await page.evaluate(async () => {
    const { redrawQuestionFigures } = await import('/src/services/ai/figurePipeline.ts');
    const canvas = document.createElement('canvas'); canvas.width=400; canvas.height=400;
    canvas.getContext('2d').fillRect(0,0,400,400);
    const source = canvas.toDataURL();
    const base = { id:'test',number:1,text:'본문 [그림1]',blocks:[{type:'text',value:'본문 [그림1]',rows:[]}],status:'ok',reviewed:false };
    const figure = {box:[250,250,750,750],label:'삼각형',kind:'diagram'};
    const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M0 0L20 20L0 20Z"/></svg>';
    let figures=[figure], calls=[], renderFails=false, cancel=false, cancelAtDetect=false, reviewFails=false;
    const nativeFetch=window.fetch;
    window.fetch=async (url, options) => {
      const body=JSON.parse(options.body); calls.push({url,body});
      if (url==='/api/ai-figure-detect') { if(cancelAtDetect) cancel=true; return Response.json({figures}); }
      if (url==='/api/ai-figure-review') return Response.json({passed:!reviewFails,issues:reviewFails?['인쇄된 라벨 A가 누락됨']:[]});
      if (url==='/api/ai-figure') return Response.json({spec:{version:2},model:'claude-opus-5'});
      if (url==='/api/figure-render') return renderFails ? Response.json({error:'Invalid geometry'},{status:422}) : Response.json({svg});
      throw new Error('Unexpected network request');
    };
    const checks=[];
    const assert=(condition,label)=>{if(!condition) throw new Error(label); checks.push(label);};
    try {
      const result=await redrawQuestionFigures(source,base);
      const input=calls.find(c=>c.url==='/api/ai-figure').body;
      const image=new Image(); image.src=input.figureCrop; await image.decode();
      assert(image.width===200&&image.height===200,'Opus receives the second 200×200 crop, not the 400×400 question');
      assert(!('questionCrop' in input)&&!('pageBase64' in input),'Opus request contains no question/page image');
      assert(result.images[0].originalDataUrl===input.figureCrop && result.images[0].engineSvg.includes('M0 0L20 20L0 20Z'),'Original crop and engine SVG are both preserved');
      assert(result.blocks===base.blocks && result.text===base.text,'Original typed blocks and marker position are preserved');
      calls=[];
      await redrawQuestionFigures(source,base,undefined,[{...figure,box:[0,0,100,200]}]);
      const inspectedInput=calls.find(c=>c.url==='/api/ai-figure').body;
      const inspectedImage=new Image();inspectedImage.src=inspectedInput.figureCrop;await inspectedImage.decode();
      assert(!calls.some(c=>c.url==='/api/ai-figure-detect')&&inspectedImage.width===80&&inspectedImage.height===40,'Inspected figure edits control the actual Opus crop without another detection');
      calls=[];
      const empty=await redrawQuestionFigures(source,{...base,images:[{box:figure.box}]},undefined,[]);
      assert(calls.length===0&&empty.images.length===0,'Deleted inspected figures are not recreated by OCR');
      calls=[];reviewFails=true;
      const reviewFailure=await redrawQuestionFigures(source,base);
      assert(calls.filter(c=>c.url==='/api/ai-figure').length===3&&reviewFailure.images[0].engineSvg&&reviewFailure.images[0].originalDataUrl&&reviewFailure.figureWarnings.length,'Visual mismatch gets two bounded repairs then keeps an editable candidate, original and warning');
      reviewFails=false;
      calls=[];figures=[];
      await redrawQuestionFigures(source,{...base,text:'수식만 있는 문제',blocks:[]});
      assert(calls.length===1,'No figures means no Opus/render calls');
      calls=[];figures=[figure,{...figure,kind:'artwork',label:'사진',box:[0,0,200,200]}];
      const mixed=await redrawQuestionFigures(source,base);
      assert(mixed.images.length===2 && calls.filter(c=>c.url==='/api/ai-figure').length===1,'Separate diagram and artwork crops; artwork stays original');
      assert(mixed.text.includes('[그림2]'),'Missing second marker is retained visibly');
      calls=[];figures=[figure];renderFails=true;
      const failed=await redrawQuestionFigures(source,base);
      assert(failed.status==='warn'&&failed.images[0].dataUrl===failed.images[0].originalDataUrl,'Render failure retains original crop with a warning');
      assert(calls.filter(c=>c.url==='/api/ai-figure').length===3,'Invalid spec gets at most two repair attempts');
      calls=[];figures=[{...figure,box:[0,0,1200,100]}];renderFails=false;
      const invalid=await redrawQuestionFigures(source,base);
      assert(invalid.status==='warn'&&calls.length===1,'Out-of-range crop is rejected before Opus');
      calls=[];figures=[figure];cancelAtDetect=true;
      const cancelled=await redrawQuestionFigures(source,base,()=>cancel);
      assert(cancelled===base&&calls.length===1,'Cancellation prevents downstream calls and stale results');
    } finally { window.fetch=nativeFetch; }
    return checks;
  });
  for(const result of results) console.log('PASS',result);
  console.log(`${results.length} figure pipeline checks passed`);
} finally { await browser.close(); }

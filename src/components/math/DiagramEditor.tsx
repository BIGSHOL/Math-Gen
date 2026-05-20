import React, { useState, useEffect, useMemo } from 'react';
import { X, LayoutTemplate } from 'lucide-react';

interface DiagramEditorProps {
  initialSvg: string | null;
  onSave: (newSvg: string | null) => void;
  onClose?: () => void;
  isModal?: boolean;
}

const ELEM_CATEGORIES = [
  { id: 'frac-rect', label: '분수 사각형' },
  { id: 'frac-circle', label: '분수 원' },
  { id: 'number-line', label: '수직선' },
  { id: 'place-value', label: '자릿값' },
  { id: 'dot-array', label: '점 배열' },
  { id: 'flowchart', label: '흐름도' },
  { id: 'bar-graph', label: '막대그래프' },
  { id: 'line-graph', label: '꺾은선그래프' },
  { id: 'pictograph', label: '그림그래프' },
  { id: 'pie-chart', label: '원그래프' },
  { id: 'band-graph', label: '띠그래프' },
  { id: 'angle', label: '각도' },
  { id: 'clock', label: '시계' },
];

const MIDDLE_CATEGORIES = [
  { id: 'coord-plane', label: '좌표평면' },
  { id: 'triangle', label: '삼각형' },
  { id: 'rectangle', label: '사각형' },
  { id: 'circle', label: '원' },
  { id: 'polygon', label: '정다각형' },
  { id: 'func-graph', label: '함수 그래프' },
  { id: 'venn', label: '벤 다이어그램' },
  { id: 'histogram', label: '히스토그램' },
  { id: 'stem-leaf', label: '줄기잎그림' },
  { id: '3d-shape', label: '입체도형' },
  { id: 'net', label: '전개도' },
  { id: 'tree-diagram', label: '수형도' },
  { id: 'scatter', label: '산점도' },
];

const COLORS = ['#3b82f6', '#f97316', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b'];

const DiagramEditor: React.FC<DiagramEditorProps> = ({ initialSvg, onSave, onClose, isModal = true }) => {
  const [activeTab, setActiveTab] = useState<string>('frac-rect');
  const [description, setDescription] = useState('');
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('center');
  const [color, setColor] = useState(COLORS[0]);
  const [isHatched, setIsHatched] = useState(false);

  // Parameter States
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(1);
  const [count, setCount] = useState(1);
  const [shaded, setShaded] = useState(1);
  
  const [parts, setParts] = useState(4); // For circles
  
  const [minVal, setMinVal] = useState(0); // For number line
  const [maxVal, setMaxVal] = useState(10);
  
  const [hour, setHour] = useState(10); // For clock
  const [minute, setMinute] = useState(10);

  const [graphData, setGraphData] = useState('10, 25, 15, 30');
  const [graphLabels, setGraphLabels] = useState('가, 나, 다, 라');

  // Generate SVG based on active tab and parameters
  const generatedSvg = useMemo(() => {
    let svgContent = '';
    let viewBox = '0 0 200 200';

    const defs = isHatched ? `
      <defs>
        <pattern id="hatch" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="8" stroke="${color}" stroke-width="2" />
        </pattern>
      </defs>
    ` : '';

    const fillStyle = isHatched ? 'url(#hatch)' : color;

    try {
      if (activeTab === 'frac-rect') {
        const cellW = 40;
        const cellH = 40;
        const gap = 20;
        const totalW = (cols * cellW) * count + gap * (count - 1);
        const totalH = rows * cellH;
        viewBox = `0 0 ${totalW + 40} ${totalH + 40}`;
        
        let rects = '';
        let shadedCount = 0;
        
        for (let i = 0; i < count; i++) {
          const offsetX = 20 + i * (cols * cellW + gap);
          const offsetY = 20;
          
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const isShaded = shadedCount < shaded;
              const fill = isShaded ? fillStyle : 'white';
              rects += `<rect x="${offsetX + c * cellW}" y="${offsetY + r * cellH}" width="${cellW}" height="${cellH}" fill="${fill}" stroke="#333" stroke-width="1.5" />\n`;
              shadedCount++;
            }
          }
        }
        svgContent = defs + rects;
      } 
      else if (activeTab === 'frac-circle') {
        const r = 80;
        const cx = 100;
        const cy = 100;
        viewBox = `0 0 200 200`;
        
        let slices = '';
        if (parts === 1) {
          const fill = shaded > 0 ? fillStyle : 'white';
          slices = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#333" stroke-width="1.5" />`;
        } else {
          const angleStep = (Math.PI * 2) / parts;
          for (let i = 0; i < parts; i++) {
            const startAngle = i * angleStep - Math.PI / 2;
            const endAngle = (i + 1) * angleStep - Math.PI / 2;
            
            const x1 = cx + r * Math.cos(startAngle);
            const y1 = cy + r * Math.sin(startAngle);
            const x2 = cx + r * Math.cos(endAngle);
            const y2 = cy + r * Math.sin(endAngle);
            
            const largeArcFlag = angleStep > Math.PI ? 1 : 0;
            const isShaded = i < shaded;
            const fill = isShaded ? fillStyle : 'white';
            
            const pathData = [
              `M ${cx} ${cy}`,
              `L ${x1} ${y1}`,
              `A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
              'Z'
            ].join(' ');
            
            slices += `<path d="${pathData}" fill="${fill}" stroke="#333" stroke-width="1.5" />\n`;
          }
        }
        svgContent = defs + slices;
      }
      else if (activeTab === 'number-line') {
        const w = 400;
        const h = 100;
        viewBox = `0 0 ${w} ${h}`;
        const pad = 40;
        const lineLen = w - pad * 2;
        const range = maxVal - minVal;
        const step = range > 0 ? lineLen / range : 0;
        
        let elements = `<line x1="${pad - 10}" y1="50" x2="${w - pad + 10}" y2="50" stroke="#333" stroke-width="2" />`;
        // Arrows
        elements += `<polygon points="${w - pad + 10},50 ${w - pad + 5},45 ${w - pad + 5},55" fill="#333" />`;
        elements += `<polygon points="${pad - 10},50 ${pad - 5},45 ${pad - 5},55" fill="#333" />`;
        
        for (let i = 0; i <= range; i++) {
          const x = pad + i * step;
          elements += `<line x1="${x}" y1="45" x2="${x}" y2="55" stroke="#333" stroke-width="2" />\n`;
          elements += `<text x="${x}" y="75" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#333">${minVal + i}</text>\n`;
        }
        svgContent = elements;
      }
      else if (activeTab === 'clock') {
        const cx = 100, cy = 100, r = 80;
        viewBox = `0 0 200 200`;
        let elements = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="#333" stroke-width="2" />`;
        
        // Ticks and numbers
        for (let i = 1; i <= 12; i++) {
          const angle = (i * 30 - 90) * (Math.PI / 180);
          const x1 = cx + (r - 10) * Math.cos(angle);
          const y1 = cy + (r - 10) * Math.sin(angle);
          const x2 = cx + r * Math.cos(angle);
          const y2 = cy + r * Math.sin(angle);
          const tx = cx + (r - 22) * Math.cos(angle);
          const ty = cy + (r - 22) * Math.sin(angle) + 5;
          
          elements += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#333" stroke-width="2" />`;
          elements += `<text x="${tx}" y="${ty}" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="#333">${i}</text>`;
        }
        
        // Hands
        const hAngle = ((hour % 12) * 30 + (minute / 60) * 30 - 90) * (Math.PI / 180);
        const mAngle = (minute * 6 - 90) * (Math.PI / 180);
        
        const hx = cx + (r * 0.5) * Math.cos(hAngle);
        const hy = cy + (r * 0.5) * Math.sin(hAngle);
        const mx = cx + (r * 0.75) * Math.cos(mAngle);
        const my = cy + (r * 0.75) * Math.sin(mAngle);
        
        elements += `<line x1="${cx}" y1="${cy}" x2="${hx}" y2="${hy}" stroke="#333" stroke-width="4" stroke-linecap="round" />`;
        elements += `<line x1="${cx}" y1="${cy}" x2="${mx}" y2="${my}" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />`;
        elements += `<circle cx="${cx}" cy="${cy}" r="4" fill="#333" />`;
        
        svgContent = elements;
      }
      else if (activeTab === 'coord-plane') {
        const w = 300, h = 300;
        viewBox = `0 0 ${w} ${h}`;
        let elements = '';
        const step = 30;
        
        // Grid
        for(let i=0; i<=w; i+=step) {
          elements += `<line x1="${i}" y1="0" x2="${i}" y2="${h}" stroke="#e2e8f0" stroke-width="1" />`;
          elements += `<line x1="0" y1="${i}" x2="${w}" y2="${i}" stroke="#e2e8f0" stroke-width="1" />`;
        }
        
        // Axes
        const cx = w/2, cy = h/2;
        elements += `<line x1="0" y1="${cy}" x2="${w}" y2="${cy}" stroke="#333" stroke-width="1.5" />`;
        elements += `<line x1="${cx}" y1="0" x2="${cx}" y2="${h}" stroke="#333" stroke-width="1.5" />`;
        
        // Arrows
        elements += `<polygon points="${w},${cy} ${w-6},${cy-4} ${w-6},${cy+4}" fill="#333" />`;
        elements += `<polygon points="${cx},0 ${cx-4},6 ${cx+4},6" fill="#333" />`;
        
        // Labels
        elements += `<text x="${w-10}" y="${cy+15}" font-family="serif" font-style="italic" font-size="14">x</text>`;
        elements += `<text x="${cx-15}" y="15" font-family="serif" font-style="italic" font-size="14">y</text>`;
        elements += `<text x="${cx-12}" y="${cy+15}" font-family="serif" font-style="italic" font-size="14">O</text>`;
        
        svgContent = elements;
      }
      else if (activeTab === 'place-value') {
        viewBox = "0 0 300 150";
        svgContent = `
          <rect x="10" y="10" width="280" height="130" fill="none" stroke="#333" stroke-width="2" />
          <line x1="103" y1="10" x2="103" y2="140" stroke="#333" stroke-width="2" />
          <line x1="196" y1="10" x2="196" y2="140" stroke="#333" stroke-width="2" />
          <line x1="10" y1="50" x2="290" y2="50" stroke="#333" stroke-width="2" />
          <text x="56" y="35" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle" fill="#333">백의 자리</text>
          <text x="150" y="35" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle" fill="#333">십의 자리</text>
          <text x="243" y="35" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle" fill="#333">일의 자리</text>
          <text x="56" y="105" font-family="sans-serif" font-size="32" text-anchor="middle" fill="${color}">3</text>
          <text x="150" y="105" font-family="sans-serif" font-size="32" text-anchor="middle" fill="${color}">5</text>
          <text x="243" y="105" font-family="sans-serif" font-size="32" text-anchor="middle" fill="${color}">2</text>
        `;
      }
      else if (activeTab === 'dot-array') {
        const r = 4;
        const gap = 20;
        const w = cols * gap;
        const h = rows * gap;
        viewBox = `0 0 ${w + 20} ${h + 20}`;
        let dots = '';
        for(let r=0; r<rows; r++) {
          for(let c=0; c<cols; c++) {
            dots += `<circle cx="${10 + c*gap}" cy="${10 + r*gap}" r="${r}" fill="${color}" />\n`;
          }
        }
        svgContent = dots;
      }
      else if (activeTab === 'flowchart') {
        viewBox = "0 0 200 300";
        svgContent = `
          <rect x="50" y="20" width="100" height="40" rx="20" fill="white" stroke="#333" stroke-width="2" />
          <text x="100" y="45" font-family="sans-serif" font-size="14" text-anchor="middle">시작</text>
          <line x1="100" y1="60" x2="100" y2="100" stroke="#333" stroke-width="2" marker-end="url(#arrow)" />
          <rect x="40" y="100" width="120" height="50" fill="${fillStyle}" stroke="#333" stroke-width="2" />
          <text x="100" y="130" font-family="sans-serif" font-size="14" text-anchor="middle">처리</text>
          <line x1="100" y1="150" x2="100" y2="190" stroke="#333" stroke-width="2" marker-end="url(#arrow)" />
          <polygon points="100,190 150,215 100,240 50,215" fill="white" stroke="#333" stroke-width="2" />
          <text x="100" y="220" font-family="sans-serif" font-size="14" text-anchor="middle">조건</text>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#333" />
            </marker>
          </defs>
        `;
      }
      else if (activeTab === 'bar-graph') {
        const data = graphData.split(',').map(Number).filter(n => !isNaN(n));
        const labels = graphLabels.split(',').map(s => s.trim());
        const max = Math.max(...data, 10);
        const w = 300, h = 200;
        viewBox = `0 0 ${w+50} ${h+50}`;
        let elements = `<line x1="40" y1="20" x2="40" y2="${h+20}" stroke="#333" stroke-width="2" />`;
        elements += `<line x1="40" y1="${h+20}" x2="${w+20}" y2="${h+20}" stroke="#333" stroke-width="2" />`;
        
        const barW = Math.min(40, (w - 20) / data.length - 10);
        data.forEach((val, i) => {
          const barH = (val / max) * (h - 20);
          const x = 50 + i * (barW + 20);
          const y = h + 20 - barH;
          elements += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${fillStyle}" stroke="#333" stroke-width="1" />`;
          elements += `<text x="${x + barW/2}" y="${h+40}" font-family="sans-serif" font-size="12" text-anchor="middle">${labels[i] || i+1}</text>`;
          elements += `<text x="${x + barW/2}" y="${y-5}" font-family="sans-serif" font-size="12" text-anchor="middle">${val}</text>`;
        });
        svgContent = defs + elements;
      }
      else if (activeTab === 'line-graph') {
        const data = graphData.split(',').map(Number).filter(n => !isNaN(n));
        const labels = graphLabels.split(',').map(s => s.trim());
        const max = Math.max(...data, 10);
        const w = 300, h = 200;
        viewBox = `0 0 ${w+50} ${h+50}`;
        let elements = `<line x1="40" y1="20" x2="40" y2="${h+20}" stroke="#333" stroke-width="2" />`;
        elements += `<line x1="40" y1="${h+20}" x2="${w+20}" y2="${h+20}" stroke="#333" stroke-width="2" />`;
        
        const stepX = (w - 20) / Math.max(1, data.length - 1);
        let points = [];
        data.forEach((val, i) => {
          const x = 50 + i * stepX;
          const y = h + 20 - (val / max) * (h - 20);
          points.push(`${x},${y}`);
          elements += `<circle cx="${x}" cy="${y}" r="4" fill="${color}" />`;
          elements += `<text x="${x}" y="${h+40}" font-family="sans-serif" font-size="12" text-anchor="middle">${labels[i] || i+1}</text>`;
          elements += `<text x="${x}" y="${y-10}" font-family="sans-serif" font-size="12" text-anchor="middle">${val}</text>`;
        });
        if (points.length > 1) {
          elements = `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2" />` + elements;
        }
        svgContent = elements;
      }
      else if (activeTab === 'pie-chart') {
        const data = graphData.split(',').map(Number).filter(n => !isNaN(n));
        const labels = graphLabels.split(',').map(s => s.trim());
        const total = data.reduce((a,b)=>a+b, 0);
        const cx = 150, cy = 150, r = 100;
        viewBox = `0 0 300 300`;
        let elements = '';
        let startAngle = -Math.PI / 2;
        const colors = [color, '#f97316', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#3b82f6'];
        
        data.forEach((val, i) => {
          const sliceAngle = (val / total) * Math.PI * 2;
          const endAngle = startAngle + sliceAngle;
          const x1 = cx + r * Math.cos(startAngle);
          const y1 = cy + r * Math.sin(startAngle);
          const x2 = cx + r * Math.cos(endAngle);
          const y2 = cy + r * Math.sin(endAngle);
          const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;
          
          const pathData = [
            `M ${cx} ${cy}`,
            `L ${x1} ${y1}`,
            `A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
            'Z'
          ].join(' ');
          
          const fill = isHatched ? `url(#hatch)` : colors[i % colors.length];
          elements += `<path d="${pathData}" fill="${fill}" stroke="#333" stroke-width="1.5" />`;
          
          const midAngle = startAngle + sliceAngle / 2;
          const tx = cx + (r * 0.6) * Math.cos(midAngle);
          const ty = cy + (r * 0.6) * Math.sin(midAngle);
          elements += `<text x="${tx}" y="${ty}" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#fff" font-weight="bold">${labels[i] || val}</text>`;
          
          startAngle = endAngle;
        });
        svgContent = defs + elements;
      }
      else if (activeTab === 'band-graph') {
        const data = graphData.split(',').map(Number).filter(n => !isNaN(n));
        const labels = graphLabels.split(',').map(s => s.trim());
        const total = data.reduce((a,b)=>a+b, 0);
        const w = 400, h = 60;
        viewBox = `0 0 450 150`;
        let elements = '';
        let currentX = 20;
        const colors = [color, '#f97316', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#3b82f6'];
        
        data.forEach((val, i) => {
          const barW = (val / total) * w;
          const fill = isHatched ? `url(#hatch)` : colors[i % colors.length];
          elements += `<rect x="${currentX}" y="40" width="${barW}" height="${h}" fill="${fill}" stroke="#333" stroke-width="1.5" />`;
          elements += `<text x="${currentX + barW/2}" y="75" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#fff" font-weight="bold">${labels[i] || val}</text>`;
          elements += `<text x="${currentX + barW/2}" y="120" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#333">${Math.round((val/total)*100)}%</text>`;
          currentX += barW;
        });
        svgContent = defs + elements;
      }
      else if (activeTab === 'angle') {
        const cx = 150, cy = 150, r = 100;
        viewBox = `0 0 300 300`;
        const startRad = (minVal * Math.PI) / 180;
        const endRad = (maxVal * Math.PI) / 180;
        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy - r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy - r * Math.sin(endRad);
        
        const diff = (maxVal - minVal + 360) % 360;
        const largeArc = diff > 180 ? 1 : 0;
        
        let elements = `<line x1="${cx}" y1="${cy}" x2="${x1}" y2="${y1}" stroke="#333" stroke-width="2" />`;
        elements += `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="#333" stroke-width="2" />`;
        
        const arcR = 30;
        const ax1 = cx + arcR * Math.cos(startRad);
        const ay1 = cy - arcR * Math.sin(startRad);
        const ax2 = cx + arcR * Math.cos(endRad);
        const ay2 = cy - arcR * Math.sin(endRad);
        
        elements += `<path d="M ${ax1} ${ay1} A ${arcR} ${arcR} 0 ${largeArc} 0 ${ax2} ${ay2}" fill="none" stroke="${color}" stroke-width="2" />`;
        
        const midRad = startRad + (diff * Math.PI / 180) / 2;
        const tx = cx + (arcR + 20) * Math.cos(midRad);
        const ty = cy - (arcR + 20) * Math.sin(midRad);
        elements += `<text x="${tx}" y="${ty}" font-family="sans-serif" font-size="14" text-anchor="middle" fill="${color}">${diff}°</text>`;
        
        svgContent = elements;
      }
      else if (activeTab === 'triangle') {
        viewBox = "0 0 200 200";
        let points = "";
        if (parts === 1) points = "40,160 160,160 40,40"; // 직각
        else if (parts === 2) points = "100,40 40,160 160,160"; // 이등변
        else if (parts === 3) points = "100,40 30,160 170,160"; // 정삼각형 (근사)
        else points = "80,40 30,160 180,140"; // 일반
        
        svgContent = defs + `<polygon points="${points}" fill="${fillStyle}" stroke="#333" stroke-width="2" />`;
        if (parts === 1) {
          svgContent += `<polyline points="40,140 60,140 60,160" fill="none" stroke="#333" stroke-width="1.5" />`;
        }
      }
      else if (activeTab === 'rectangle') {
        viewBox = "0 0 200 200";
        let points = "";
        if (parts === 1) points = "50,50 150,50 150,150 50,150"; // 정사각형
        else if (parts === 2) points = "30,60 170,60 170,140 30,140"; // 직사각형
        else if (parts === 3) points = "60,60 180,60 140,140 20,140"; // 평행사변형
        else if (parts === 4) points = "70,60 130,60 170,140 30,140"; // 사다리꼴
        else if (parts === 5) points = "100,40 160,100 100,160 40,100"; // 마름모
        
        svgContent = defs + `<polygon points="${points}" fill="${fillStyle}" stroke="#333" stroke-width="2" />`;
      }
      else if (activeTab === 'circle') {
        viewBox = "0 0 200 200";
        svgContent = defs + `
          <circle cx="100" cy="100" r="80" fill="${fillStyle}" stroke="#333" stroke-width="2" />
          <circle cx="100" cy="100" r="3" fill="#333" />
          <line x1="100" y1="100" x2="180" y2="100" stroke="#333" stroke-width="1.5" stroke-dasharray="4" />
          <text x="140" y="95" font-family="sans-serif" font-size="14" text-anchor="middle">r</text>
        `;
      }
      else if (activeTab === 'polygon') {
        viewBox = "0 0 200 200";
        const cx = 100, cy = 100, r = 80;
        let points = [];
        for (let i = 0; i < parts; i++) {
          const angle = (i * 2 * Math.PI) / parts - Math.PI / 2;
          points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
        }
        svgContent = defs + `<polygon points="${points.join(' ')}" fill="${fillStyle}" stroke="#333" stroke-width="2" />`;
      }
      else if (activeTab === 'func-graph') {
        const w = 300, h = 300;
        viewBox = `0 0 ${w} ${h}`;
        const cx = w/2, cy = h/2;
        let elements = `
          <line x1="0" y1="${cy}" x2="${w}" y2="${cy}" stroke="#94a3b8" stroke-width="1" />
          <line x1="${cx}" y1="0" x2="${cx}" y2="${h}" stroke="#94a3b8" stroke-width="1" />
        `;
        
        let pathData = "";
        let prevY = null;
        
        // 1픽셀 단위로 촘촘하게 점을 계산하여 부드러운 곡선 생성
        for (let x = -w/2; x <= w/2; x += 1) { 
          let y = 0;
          let isValid = true;
          
          if (parts === 1) y = x; // y = x
          else if (parts === 2) y = (x * x) / 50; // y = x^2 (스케일 조정)
          else if (parts === 3) { // y = 1/x
            if (x === 0) isValid = false;
            else y = -1000 / x; 
          }
          else if (parts === 4) { // y = sin x
            y = Math.sin(x / 20) * 50;
          }
          else if (parts === 5) { // y = cos x
            y = Math.cos(x / 20) * 50;
          }
          
          if (isValid) {
            const px = cx + x;
            const py = cy - y;
            
            // 반비례 그래프(1/x)의 점근선(무한대로 튀는 부분) 처리
            if (parts === 3 && prevY !== null && Math.abs(py - prevY) > h / 2) {
              pathData += ` M ${px} ${py}`;
            } else if (pathData === "") {
              pathData += `M ${px} ${py}`;
            } else {
              pathData += ` L ${px} ${py}`;
            }
            prevY = py;
          } else {
            prevY = null;
          }
        }
        
        elements += `<path d="${pathData}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
        svgContent = elements;
      }
      else if (activeTab === 'venn') {
        viewBox = "0 0 300 200";
        if (parts === 2) {
          svgContent = defs + `
            <circle cx="110" cy="100" r="60" fill="${fillStyle}" fill-opacity="0.5" stroke="#333" stroke-width="2" />
            <circle cx="190" cy="100" r="60" fill="${color}" fill-opacity="0.3" stroke="#333" stroke-width="2" />
            <text x="80" y="50" font-family="sans-serif" font-size="16" font-weight="bold">A</text>
            <text x="220" y="50" font-family="sans-serif" font-size="16" font-weight="bold">B</text>
          `;
        } else {
          svgContent = defs + `
            <circle cx="110" cy="80" r="50" fill="${fillStyle}" fill-opacity="0.5" stroke="#333" stroke-width="2" />
            <circle cx="190" cy="80" r="50" fill="${color}" fill-opacity="0.3" stroke="#333" stroke-width="2" />
            <circle cx="150" cy="140" r="50" fill="#f59e0b" fill-opacity="0.3" stroke="#333" stroke-width="2" />
            <text x="80" y="40" font-family="sans-serif" font-size="16" font-weight="bold">A</text>
            <text x="220" y="40" font-family="sans-serif" font-size="16" font-weight="bold">B</text>
            <text x="150" y="190" font-family="sans-serif" font-size="16" font-weight="bold">C</text>
          `;
        }
      }
      else if (activeTab === '3d-shape') {
        viewBox = "0 0 200 200";
        if (parts === 1) { // Cube
          svgContent = defs + `
            <polygon points="60,60 140,60 140,140 60,140" fill="${fillStyle}" stroke="#333" stroke-width="2" />
            <polygon points="60,60 90,30 170,30 140,60" fill="${fillStyle}" stroke="#333" stroke-width="2" />
            <polygon points="140,60 170,30 170,110 140,140" fill="${fillStyle}" stroke="#333" stroke-width="2" />
            <line x1="60" y1="140" x2="90" y2="110" stroke="#333" stroke-width="1.5" stroke-dasharray="4" />
            <line x1="90" y1="110" x2="170" y2="110" stroke="#333" stroke-width="1.5" stroke-dasharray="4" />
            <line x1="90" y1="30" x2="90" y2="110" stroke="#333" stroke-width="1.5" stroke-dasharray="4" />
          `;
        } else if (parts === 2) { // Cylinder
          svgContent = defs + `
            <ellipse cx="100" cy="40" rx="60" ry="20" fill="${fillStyle}" stroke="#333" stroke-width="2" />
            <path d="M 40 40 L 40 140 A 60 20 0 0 0 160 140 L 160 40" fill="${fillStyle}" stroke="#333" stroke-width="2" />
            <path d="M 40 140 A 60 20 0 0 1 160 140" fill="none" stroke="#333" stroke-width="1.5" stroke-dasharray="4" />
          `;
        } else if (parts === 3) { // Cone
          svgContent = defs + `
            <path d="M 100 30 L 40 150 A 60 20 0 0 0 160 150 Z" fill="${fillStyle}" stroke="#333" stroke-width="2" />
            <path d="M 40 150 A 60 20 0 0 1 160 150" fill="none" stroke="#333" stroke-width="1.5" stroke-dasharray="4" />
          `;
        } else if (parts === 4) { // Sphere
          svgContent = defs + `
            <circle cx="100" cy="100" r="80" fill="${fillStyle}" stroke="#333" stroke-width="2" />
            <ellipse cx="100" cy="100" rx="80" ry="25" fill="none" stroke="#333" stroke-width="2" />
            <ellipse cx="100" cy="100" rx="80" ry="25" fill="none" stroke="#333" stroke-width="1.5" stroke-dasharray="4" stroke-dashoffset="125" />
          `;
        }
      }
      else if (activeTab === 'net') {
        viewBox = "0 0 300 300";
        if (parts === 1) { // Cube net
          svgContent = defs + `
            <rect x="100" y="50" width="50" height="50" fill="${fillStyle}" stroke="#333" stroke-width="2" />
            <rect x="50" y="100" width="50" height="50" fill="${fillStyle}" stroke="#333" stroke-width="2" />
            <rect x="100" y="100" width="50" height="50" fill="${fillStyle}" stroke="#333" stroke-width="2" />
            <rect x="150" y="100" width="50" height="50" fill="${fillStyle}" stroke="#333" stroke-width="2" />
            <rect x="200" y="100" width="50" height="50" fill="${fillStyle}" stroke="#333" stroke-width="2" />
            <rect x="100" y="150" width="50" height="50" fill="${fillStyle}" stroke="#333" stroke-width="2" />
          `;
        } else { // Cylinder net
          svgContent = defs + `
            <circle cx="150" cy="60" r="30" fill="${fillStyle}" stroke="#333" stroke-width="2" />
            <rect x="50" y="90" width="200" height="100" fill="${fillStyle}" stroke="#333" stroke-width="2" />
            <circle cx="150" cy="220" r="30" fill="${fillStyle}" stroke="#333" stroke-width="2" />
          `;
        }
      }
      else if (activeTab === 'tree-diagram') {
        viewBox = "0 0 300 200";
        if (parts === 2) {
          svgContent = `
            <text x="50" y="105" font-family="sans-serif" font-size="14">시작</text>
            <line x1="80" y1="100" x2="150" y2="50" stroke="#333" stroke-width="1.5" />
            <line x1="80" y1="100" x2="150" y2="150" stroke="#333" stroke-width="1.5" />
            <text x="160" y="55" font-family="sans-serif" font-size="14">A</text>
            <text x="160" y="155" font-family="sans-serif" font-size="14">B</text>
          `;
        } else {
          svgContent = `
            <text x="30" y="105" font-family="sans-serif" font-size="14">시작</text>
            <line x1="60" y1="100" x2="120" y2="50" stroke="#333" stroke-width="1.5" />
            <line x1="60" y1="100" x2="120" y2="150" stroke="#333" stroke-width="1.5" />
            <text x="130" y="55" font-family="sans-serif" font-size="14">A</text>
            <text x="130" y="155" font-family="sans-serif" font-size="14">B</text>
            
            <line x1="150" y1="50" x2="210" y2="20" stroke="#333" stroke-width="1.5" />
            <line x1="150" y1="50" x2="210" y2="80" stroke="#333" stroke-width="1.5" />
            <text x="220" y="25" font-family="sans-serif" font-size="14">A1</text>
            <text x="220" y="85" font-family="sans-serif" font-size="14">A2</text>
            
            <line x1="150" y1="150" x2="210" y2="120" stroke="#333" stroke-width="1.5" />
            <line x1="150" y1="150" x2="210" y2="180" stroke="#333" stroke-width="1.5" />
            <text x="220" y="125" font-family="sans-serif" font-size="14">B1</text>
            <text x="220" y="185" font-family="sans-serif" font-size="14">B2</text>
          `;
        }
      }
      else if (activeTab === 'scatter') {
        const data = graphData.split(',').map(Number).filter(n => !isNaN(n));
        const w = 300, h = 200;
        viewBox = `0 0 ${w+50} ${h+50}`;
        let elements = `<line x1="40" y1="20" x2="40" y2="${h+20}" stroke="#333" stroke-width="2" />`;
        elements += `<line x1="40" y1="${h+20}" x2="${w+20}" y2="${h+20}" stroke="#333" stroke-width="2" />`;
        
        for (let i = 0; i < data.length - 1; i += 2) {
          const x = 40 + (data[i] / 100) * w;
          const y = h + 20 - (data[i+1] / 100) * h;
          elements += `<circle cx="${x}" cy="${y}" r="4" fill="${color}" />`;
        }
        svgContent = elements;
      }
      else if (activeTab === 'histogram' || activeTab === 'stem-leaf' || activeTab === 'pictograph') {
        viewBox = "0 0 300 200";
        svgContent = `
          <rect x="10" y="10" width="280" height="180" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="4" rx="8"/>
          <text x="150" y="100" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#64748b">${activeTab} 생성됨</text>
          <text x="150" y="125" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#94a3b8">데이터: ${graphData}</text>
        `;
      }
    } catch (e) {
      console.error(e);
    }

    return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">\n${svgContent}\n</svg>`;
  }, [activeTab, rows, cols, count, shaded, color, isHatched, parts, minVal, maxVal, hour, minute, graphData, graphLabels]);

  const content = (
    <div className={`bg-white flex flex-col overflow-hidden ${isModal ? 'rounded-2xl shadow-2xl w-full max-w-[1200px] h-[90vh] animate-fade-in-up' : 'w-full h-full'}`}>
      
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2 text-slate-800">
          <LayoutTemplate size={20} className="text-blue-600" />
          <h2 className="text-lg font-bold">도형 편집기</h2>
        </div>
        {isModal && onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-50/50">
        
        {/* Left Panel: Controls */}
        <div className="w-full md:w-[55%] flex flex-col border-r border-slate-200 bg-white overflow-y-auto">
          <div className="p-6 space-y-8">
            
            {/* Categories */}
            <div>
              <div className="mb-4">
                <h3 className="text-xs font-bold text-slate-500 mb-2">초등</h3>
                <div className="flex flex-wrap gap-2">
                  {ELEM_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveTab(cat.id)}
                      className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        activeTab === cat.id 
                          ? 'bg-blue-600 text-white border-blue-600 font-medium' 
                          : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-500 mb-2">중등</h3>
                <div className="flex flex-wrap gap-2">
                  {MIDDLE_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveTab(cat.id)}
                      className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                        activeTab === cat.id 
                          ? 'bg-blue-600 text-white border-blue-600 font-medium' 
                          : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* Common Settings */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">도형 설명</label>
                <input 
                  type="text" 
                  placeholder="예: 3등분 색칠 사각형" 
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">도형 정렬</label>
                <div className="flex gap-2">
                  {['left', 'center', 'right'].map(a => (
                    <button 
                      key={a}
                      onClick={() => setAlign(a as any)}
                      className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${
                        align === a ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {a === 'left' ? '왼쪽' : a === 'center' ? '가운데' : '오른쪽'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* Specific Settings based on Active Tab */}
            <div className="space-y-4">
              {activeTab === 'frac-rect' && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">행 수</label>
                      <input type="number" min="1" value={rows} onChange={e => setRows(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">열 수</label>
                      <input type="number" min="1" value={cols} onChange={e => setCols(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">사각형 개수</label>
                      <input type="number" min="1" value={count} onChange={e => setCount(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">색칠할 개수 (앞에서부터)</label>
                    <input type="number" min="0" value={shaded} onChange={e => setShaded(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                  </div>
                </>
              )}

              {activeTab === 'frac-circle' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">등분 수</label>
                    <input type="number" min="1" value={parts} onChange={e => setParts(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">색칠할 개수</label>
                    <input type="number" min="0" max={parts} value={shaded} onChange={e => setShaded(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                  </div>
                </div>
              )}

              {activeTab === 'number-line' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">시작 값</label>
                    <input type="number" value={minVal} onChange={e => setMinVal(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">끝 값</label>
                    <input type="number" value={maxVal} onChange={e => setMaxVal(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                  </div>
                </div>
              )}

              {activeTab === 'clock' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">시 (Hour)</label>
                    <input type="number" min="1" max="12" value={hour} onChange={e => setHour(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">분 (Minute)</label>
                    <input type="number" min="0" max="59" value={minute} onChange={e => setMinute(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                  </div>
                </div>
              )}

              {['bar-graph', 'line-graph', 'pictograph', 'pie-chart', 'band-graph', 'histogram', 'stem-leaf', 'scatter'].includes(activeTab) && (
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">데이터 (쉼표로 구분)</label>
                    <input type="text" value={graphData} onChange={e => setGraphData(e.target.value)} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                  </div>
                  {activeTab !== 'histogram' && activeTab !== 'stem-leaf' && activeTab !== 'scatter' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">라벨 (쉼표로 구분)</label>
                      <input type="text" value={graphLabels} onChange={e => setGraphLabels(e.target.value)} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'angle' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">시작 각도</label>
                    <input type="number" value={minVal} onChange={e => setMinVal(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">끝 각도</label>
                    <input type="number" value={maxVal} onChange={e => setMaxVal(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                  </div>
                </div>
              )}

              {activeTab === 'dot-array' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">행 수</label>
                    <input type="number" min="1" value={rows} onChange={e => setRows(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">열 수</label>
                    <input type="number" min="1" value={cols} onChange={e => setCols(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                  </div>
                </div>
              )}

              {activeTab === 'polygon' && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">변의 개수</label>
                  <input type="number" min="3" max="12" value={parts} onChange={e => setParts(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm" />
                </div>
              )}

              {['triangle', 'rectangle', 'func-graph', 'venn', '3d-shape', 'net', 'tree-diagram'].includes(activeTab) && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">유형 선택</label>
                  <select value={parts} onChange={e => setParts(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-md text-sm">
                    {activeTab === 'triangle' && (
                      <>
                        <option value={1}>직각삼각형</option>
                        <option value={2}>이등변삼각형</option>
                        <option value={3}>정삼각형</option>
                        <option value={4}>일반삼각형</option>
                      </>
                    )}
                    {activeTab === 'rectangle' && (
                      <>
                        <option value={1}>정사각형</option>
                        <option value={2}>직사각형</option>
                        <option value={3}>평행사변형</option>
                        <option value={4}>사다리꼴</option>
                        <option value={5}>마름모</option>
                      </>
                    )}
                    {activeTab === 'func-graph' && (
                      <>
                        <option value={1}>일차함수 (y = x)</option>
                        <option value={2}>이차함수 (y = x²)</option>
                        <option value={3}>반비례함수 (y = 1/x)</option>
                        <option value={4}>사인함수 (y = sin x)</option>
                        <option value={5}>코사인함수 (y = cos x)</option>
                      </>
                    )}
                    {activeTab === 'venn' && (
                      <>
                        <option value={2}>2개 집합</option>
                        <option value={3}>3개 집합</option>
                      </>
                    )}
                    {activeTab === '3d-shape' && (
                      <>
                        <option value={1}>정육면체</option>
                        <option value={2}>원기둥</option>
                        <option value={3}>원뿔</option>
                        <option value={4}>구</option>
                      </>
                    )}
                    {activeTab === 'net' && (
                      <>
                        <option value={1}>정육면체 전개도</option>
                        <option value={2}>원기둥 전개도</option>
                      </>
                    )}
                    {activeTab === 'tree-diagram' && (
                      <>
                        <option value={2}>2단 수형도</option>
                        <option value={3}>3단 수형도</option>
                      </>
                    )}
                  </select>
                </div>
              )}

              {/* Common Style Settings */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer mb-4">
                  <input type="checkbox" checked={isHatched} onChange={e => setIsHatched(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                  <span className="text-sm text-slate-600">빗금 처리</span>
                </label>
                
                <label className="block text-xs font-medium text-slate-500 mb-2">색상</label>
                <div className="flex gap-3">
                  {COLORS.map(c => (
                    <button 
                      key={c} 
                      onClick={() => setColor(c)} 
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${color === c ? 'border-slate-800 scale-110 shadow-md' : 'border-transparent hover:scale-105'}`} 
                      style={{backgroundColor: c}} 
                    />
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Right Panel: Preview */}
        <div className="w-full md:w-[45%] p-6 flex flex-col">
          <h3 className="text-sm font-medium text-slate-500 mb-3">미리보기</h3>
          <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center justify-center p-8 relative overflow-hidden">
            <div 
              className={`w-full h-full flex items-center [&_svg]:max-w-full [&_svg]:max-h-full ${
                align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center'
              }`}
              dangerouslySetInnerHTML={{ __html: generatedSvg }}
            />
          </div>
          
          {/* SVG Code Debug (Optional, hidden by default but useful for developers) */}
          <details className="mt-4 text-xs text-slate-400">
            <summary className="cursor-pointer hover:text-slate-600">SVG 코드 보기</summary>
            <pre className="mt-2 p-2 bg-slate-800 text-slate-200 rounded overflow-x-auto max-h-32">
              {generatedSvg}
            </pre>
          </details>
        </div>

      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-end gap-3">
        {isModal && onClose && (
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-md text-slate-600 font-medium hover:bg-slate-100 transition-colors"
          >
            취소
          </button>
        )}
        <button
          onClick={() => onSave(generatedSvg)}
          className="px-8 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          추가
        </button>
      </div>

    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
        {content}
      </div>
    );
  }

  return content;
};

export default DiagramEditor;

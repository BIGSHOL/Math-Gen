# 픽셀 단위 구현 가이드

> `DESIGN_SPEC.md` 만으로 부족하다면 → **레퍼런스 HTML을 직접 inspect** 하세요. 모든 값이 거기 들어있습니다.

---

## 1. 가장 빠른 방법: 브라우저 devtools 로 직접 추출

### 1.1 레퍼런스 HTML 열기
```
design_handoff_print_templates/
└── reference/
    ├── 인쇄 템플릿 시안.html         ← 이걸 Chrome 등에 직접 열기
    └── templates/                    ← 소스 JSX (참고)
```

### 1.2 devtools 로 모든 값 추출
1. Chrome / Edge / Firefox 에서 `인쇄 템플릿 시안.html` 열기
2. `Cmd + Shift + C` (Mac) / `Ctrl + Shift + C` (Win) → element inspector 활성화
3. 측정하고 싶은 요소 클릭
4. 우측 Computed 탭 → 모든 속성의 **실제 계산된 값** 픽셀 단위로 확인

**얻을 수 있는 값들:**
- padding / margin (px 단위)
- font-family / font-size / font-weight / line-height / letter-spacing
- color / background (hex 값)
- border (두께·색·스타일)
- gap / grid-template-columns
- box-shadow / border-radius

### 1.3 단축 팁
- **거리 측정**: 한 요소 클릭 후 다른 요소에 hover → 거리가 표시됨
- **색상 spoit**: Styles 탭에서 색 swatch 클릭 → eyedropper
- **box model**: 우측 패널의 box-model 다이어그램에 padding/border/margin 시각화

---

## 2. JSX 소스 매핑

각 템플릿이 어디서 어떻게 정의되었는지:

| 템플릿 | 소스 파일 | 라인 단위 |
|---|---|---|
| T1 평가원 | `reference/templates/T1-pyeongga.jsx` | 66 lines |
| T2 정통 내신 | `reference/templates/T2-jeongtong.jsx` | 154 lines |
| T3 모던 내신 | `reference/templates/T3-modern.jsx` | 106 lines |
| T4 워크북 | `reference/templates/T4-workbook.jsx` | 118 lines |
| T5 자습 | `reference/templates/T5-jaseup.jsx` | 118 lines |
| T6 유형 훈련 | `reference/templates/T6-yuhyung.jsx` | 82 lines |
| 공용 토큰 | `reference/templates/primitives.jsx` | 252 lines — `KP.c`/`KP.font`/`A4`/`Body`/`Q`/`Points` 등 |

**모든 inline style 의 픽셀 값이 그대로 명시되어 있음.** 예시 — T2의 시험 정보 표 헤더 셀:
```jsx
{ height: 38 }
{ textAlign: "center", fontSize: 22, fontWeight: 800,
  letterSpacing: "0.12em", padding: "6px 12px",
  borderBottom: `1.5px solid ${KP.c.ink}` }
```
→ height 38px / font 22px weight 800 / letter-spacing 0.12em / padding 6px 12px / border-bottom 1.5px solid #0E0E10.

JSX 의 `KP.c.xxx` 는 `primitives.jsx` 1번째 const 객체에서 hex 값으로 풀림.

---

## 3. 픽셀 단위 워크플로

권장 작업 순서:

1. **DESIGN_SPEC.md** 로 전체 구조 이해 (헤더·본문·푸터 흐름)
2. **레퍼런스 HTML** 을 두 창으로:
   - 창 A: 시안 자체 (디자인 캔버스 펼친 상태)
   - 창 B: 같은 시안의 devtools 열어서 원소별 값 추출
3. **JSX 소스** 로 inline style 값 직접 복사
4. 구현 → 결과를 창 A 와 픽셀 단위 비교 (스크린샷 겹치기 또는 PerfectPixel 확장 사용)

---

## 4. Chrome 확장 권장

- **PerfectPixel** (또는 PixelParallel): 레퍼런스 스크린샷을 반투명 overlay 로 띄워 픽셀 단위 비교
- **WhatFont**: 폰트 패밀리·크기·weight 정확히 추출
- **ColorZilla**: 화면 위에서 직접 hex 값 추출

---

## 5. 페이지 단위 캡처 (필요 시)

레퍼런스 HTML 을 화면에 띄우고 각 아트보드를 **Cmd+P** 로 PDF 인쇄 → 픽셀 정확한 PDF 시안 확보.

또는 디자인 캔버스에서 아트보드 클릭 → 풀스크린 focus 모드 → `Cmd+Shift+P` → "Capture screenshot of full screen".

---

## 6. 의문 사항이 있을 때

DESIGN_SPEC.md 와 레퍼런스 HTML 이 충돌하면 **레퍼런스 HTML 이 진실의 원천 (source of truth)**. SPEC 은 요약이고 사양에서 누락된 값은 있지만 HTML 에 명시되지 않은 값은 없습니다.

---

## 7. 최종 체크리스트 (구현 완료 검증)

각 템플릿마다 픽셀 단위 일치 확인:
- [ ] A4 사이즈 794 × 1123 px
- [ ] Padding (top/right/bottom/left)
- [ ] 헤더 영역 높이
- [ ] 헤더 박스 border 두께·색
- [ ] 본문 font-family / size / line-height
- [ ] 문항 번호 스타일 (모양·색·크기)
- [ ] 문항 사이 gap
- [ ] 보기(①②③④⑤) grid columns
- [ ] 점수 라벨 [N점] 위치·색
- [ ] 푸터 형식·위치
- [ ] Accent 색 (T3 navy / T4 red / T5 gold / T6 slate)
- [ ] 1단/2단 토글 동작
- [ ] 풀이공간 (T4/T5 만) flex stretch 동작
- [ ] break-inside avoid 동작
- [ ] 흑백 인쇄 미리보기 OK

---

생성: 2026-05-26

/* Hi-fi Wizard Step 4 (Per-problem review) + Step 5 (Export) */

// ========== STEP 4: Per-problem review ==========
function WizStep4HF({ ctx }) {
  const [selectedNum, setSelectedNum] = React.useState(6);
  const [filter, setFilter] = React.useState("all");
  const [activeTab, setActiveTab] = React.useState("문제");

  // Status map
  const allProblems = Array.from({ length: 30 }).map((_, i) => {
    const n = i + 1;
    let status = "ok";
    if ([6, 11, 22].includes(n)) status = "warn";
    else if ([28, 29, 30].includes(n)) status = "pending";
    return { num: n, status };
  });

  const filtered = filter === "all" ? allProblems
    : filter === "warn" ? allProblems.filter(p => p.status === "warn")
    : allProblems.filter(p => p.status === "pending");

  const selected = allProblems.find(p => p.num === selectedNum);
  const problemId = selectedNum === 6 ? "p6" : selectedNum === 11 ? "p11" : selectedNum === 17 ? "p17" : "p1";

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 560, gap: 0 }}>

      {/* Index sidebar */}
      <aside style={{
        width: 248, flexShrink: 0,
        padding: "20px 16px",
        borderRight: `1px solid ${HF.c.line}`,
        background: HF.c.surface, overflow: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Eyebrow>문항 30개</Eyebrow>
          <Segmented value={filter} onChange={setFilter} size="sm" options={[
            { value: "all", label: "전체" },
            { value: "warn", label: "검토" },
            { value: "pending", label: "대기" },
          ]} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4, marginBottom: 18 }}>
          {allProblems.map(p => {
            const focus = p.num === selectedNum;
            const hidden = filter !== "all" && !filtered.includes(p);
            const colors = {
              ok: { bg: focus ? HF.c.accent : "white", color: focus ? "white" : HF.c.text2, border: focus ? HF.c.accent : HF.c.ok + "55" },
              warn: { bg: focus ? HF.c.warn : HF.c.warnSoft, color: focus ? "white" : HF.c.warnInk, border: focus ? HF.c.warn : HF.c.warn + "55" },
              pending: { bg: focus ? HF.c.muted : HF.c.surface2, color: focus ? "white" : HF.c.muted, border: focus ? HF.c.muted : HF.c.line },
            };
            const c = colors[p.status];
            return (
              <div key={p.num} onClick={() => setSelectedNum(p.num)} style={{
                height: 30, borderRadius: HF.r.r1,
                display: "grid", placeItems: "center",
                fontSize: 11.5, fontWeight: 600, fontFamily: HF.t.mono.family,
                cursor: "pointer", transition: "all 140ms",
                background: c.bg, color: c.color, border: `1px solid ${c.border}`,
                opacity: hidden ? 0.25 : 1,
                boxShadow: focus ? HF.sh.accentGlow : "none",
              }}>{p.num}</div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 20, padding: "10px 12px", background: HF.c.surface2, borderRadius: HF.r.r2 }}>
          {[
            ["확정", 24, HF.c.ok],
            ["검토 필요", 3, HF.c.warn],
            ["생성 대기", 3, HF.c.muted],
          ].map(([l, n, c]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...applyType("small") }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: HF.c.text2 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                {l}
              </span>
              <span style={{ color: HF.c.muted, fontFamily: HF.t.mono.family }}>{n}</span>
            </div>
          ))}
        </div>

        <Eyebrow style={{ marginBottom: 10 }}>단원별 점프</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            ["다항식", "1–4"],
            ["방정식·부등식", "5–9"],
            ["도형의 방정식", "10–13"],
            ["함수와 그래프", "14–19"],
            ["수열·미적분", "20–27"],
            ["통계", "28–30"],
          ].map(([t, r]) => (
            <div key={t} style={{
              display: "flex", justifyContent: "space-between", padding: "6px 8px",
              ...applyType("small"), color: HF.c.text2,
              borderRadius: HF.r.r1, cursor: "pointer",
            }}>
              <span>{t}</span>
              <span style={{ color: HF.c.muted, fontFamily: HF.t.mono.family }}>{r}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Main work area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Toolbar */}
        <div style={{
          padding: "12px 24px", borderBottom: `1px solid ${HF.c.line}`,
          background: HF.c.surface,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Btn kind="ghost" size="sm" icon="caret-left" onClick={() => setSelectedNum(Math.max(1, selectedNum - 1))}></Btn>
            <div style={{ ...applyType("h3"), color: HF.c.text, fontFamily: HF.t.mono.family, minWidth: 50, textAlign: "center" }}>
              {selectedNum} <span style={{ color: HF.c.muted, fontWeight: 400 }}>/ 30</span>
            </div>
            <Btn kind="ghost" size="sm" icon="caret-right" onClick={() => setSelectedNum(Math.min(30, selectedNum + 1))}></Btn>
            <Divider vertical style={{ height: 18, marginLeft: 4 }} />
            <Chip tone={selected?.status === "warn" ? "warn" : selected?.status === "pending" ? "neutral" : "ok"} dot>
              {selected?.status === "warn" ? "검토 필요" : selected?.status === "pending" ? "생성 대기" : "확정"}
            </Chip>
            <Chip size="sm">{PROBLEMS[problemId]?.topic || "함수와 그래프"}</Chip>
            <Chip size="sm">중상 · 3점</Chip>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn kind="ghost" size="sm" icon="chat-circle">코멘트</Btn>
            <Divider vertical style={{ height: 18, marginLeft: 4, marginRight: 4 }} />
            <Btn kind="secondary" size="sm" icon="arrow-clockwise">다시 생성</Btn>
            <Btn kind="secondary" size="sm" icon="pencil-simple">직접 편집</Btn>
            <Btn kind="soft" size="sm" icon="check">확정</Btn>
          </div>
        </div>

        {/* Compare panes */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, padding: 22, overflow: "auto", minHeight: 0, background: HF.c.bg }}>
          {/* Original */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
              <Chip size="sm" icon="image">원본</Chip>
              <span style={{ ...applyType("small"), color: HF.c.muted }}>2024 6모 {selectedNum}번 · 3점</span>
            </div>
            <Card pad={20} style={{ flex: 1, overflow: "auto" }}>
              {PROBLEMS[problemId]?.render("full", "orig") || PROBLEMS.p1.render("full")}
            </Card>
          </div>

          {/* New */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 4px" }}>
              <Chip tone="accent" size="sm" icon="sparkle">변환 결과</Chip>
              <span style={{ ...applyType("small"), color: HF.c.muted }}>{PROBLEMS[problemId]?.topic || "합성함수"} · 3점</span>
              {selected?.status === "warn" && (
                <Chip tone="warn" size="sm" icon="warning">차이 발견</Chip>
              )}
            </div>
            <Card pad={20} style={{
              flex: 1, overflow: "auto",
              border: `1.5px solid ${selected?.status === "warn" ? HF.c.warn : HF.c.accent}`,
              boxShadow: selected?.status === "warn"
                ? "0 0 0 4px rgba(245, 158, 11, 0.12)"
                : HF.sh.accentGlow,
            }}>
              {PROBLEMS[problemId]?.render("full", "new") || PROBLEMS.p1.render("full")}
              {selected?.status === "warn" && (
                <div style={{
                  marginTop: 14, padding: "10px 12px",
                  background: HF.c.warnSoft, borderRadius: HF.r.r2,
                  display: "flex", gap: 10, alignItems: "flex-start",
                }}>
                  <Ico name="warning" size={16} weight="fill" color={HF.c.warn} />
                  <div>
                    <div style={{ ...applyType("body"), fontWeight: 600, color: HF.c.warnInk }}>원본과 정의역이 다릅니다</div>
                    <div style={{ ...applyType("small"), color: HF.c.warnInk, marginTop: 2 }}>합성함수의 정의역을 확인하여 다시 생성하거나 직접 편집해 주세요.</div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Bottom — tabs */}
        <div style={{ borderTop: `1px solid ${HF.c.line}`, background: HF.c.surface, padding: "10px 24px" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            {["문제", "풀이", "해설", "변경 이력", "메모"].map(t => {
              const on = t === activeTab;
              return (
                <div key={t} onClick={() => setActiveTab(t)} style={{
                  padding: "5px 12px", fontSize: 12, fontWeight: 600,
                  borderRadius: HF.r.r1, cursor: "pointer",
                  background: on ? HF.c.surface2 : "transparent",
                  color: on ? HF.c.text : HF.c.muted,
                }}>{t}</div>
              );
            })}
          </div>
          <div style={{ ...applyType("body"), color: HF.c.text2, padding: "6px 4px" }}>
            {activeTab === "풀이" && (
              <>
                <span>합성함수 <Formula tex="(g \\circ g)(x) = g(g(x))" />를 전개하면, </span>
                <Formula tex="g(x) = 2x^2 - 6x + 1" />
                <span>의 합성에서… (계속)</span>
              </>
            )}
            {activeTab === "문제" && <span style={{ color: HF.c.muted }}>이 문제에 대한 추가 정보를 보려면 다른 탭을 선택하세요.</span>}
            {activeTab !== "문제" && activeTab !== "풀이" && (
              <span style={{ color: HF.c.muted }}>{activeTab} 내용 (mock)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ========== STEP 5: Export ==========
function WizStep5HF({ ctx }) {
  const [format, setFormat] = React.useState("pdf");
  const [bundle, setBundle] = React.useState({ problems: true, answers: true, solutions: true, stats: false });

  const formats = [
    { v: "pdf", t: "인쇄용 PDF", d: "학교 시험지 레이아웃", ico: "file-pdf" },
    { v: "hwp", t: "한글 (HWP)", d: "직접 편집 가능", ico: "file-doc" },
    { v: "docx", t: "MS Word", d: "표·수식 호환", ico: "file-doc" },
    { v: "online", t: "온라인 시험지", d: "링크로 학생 배포", ico: "globe" },
  ];

  return (
    <div style={{ padding: "32px 48px", display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 32, maxWidth: 1280, margin: "0 auto" }}>

      <div>
        <Heading level="h1" sub="형식을 선택하면 미리보기가 즉시 갱신됩니다." style={{ marginBottom: 24 }}>
          어떻게 내보낼까요?
        </Heading>

        <div style={{ marginBottom: 24 }}>
          <Eyebrow style={{ marginBottom: 10 }}>출력 형식</Eyebrow>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {formats.map(f => {
              const on = f.v === format;
              return (
                <div key={f.v} onClick={() => setFormat(f.v)} style={{
                  padding: 14, borderRadius: HF.r.r3, cursor: "pointer",
                  border: `1.5px solid ${on ? HF.c.accent : HF.c.line}`,
                  background: on ? HF.c.accentSoft : HF.c.surface,
                  boxShadow: on ? HF.sh.accentGlow : HF.sh.s1,
                  position: "relative", transition: "all 140ms",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 36, height: 44, borderRadius: HF.r.r1,
                    background: on ? "white" : HF.c.surface2,
                    color: on ? HF.c.accent : HF.c.muted,
                    display: "grid", placeItems: "center",
                    flexShrink: 0,
                  }}>
                    <Ico name={f.ico} size={20} weight={on ? "duotone" : "regular"} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ ...applyType("body"), fontWeight: 600, color: on ? HF.c.accentInk : HF.c.text }}>{f.t}</div>
                    <div style={{ ...applyType("caption"), color: HF.c.muted, marginTop: 1 }}>{f.d}</div>
                  </div>
                  {on && (
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: HF.c.accent, color: "white", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <Ico name="check" size={11} weight="bold" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <Eyebrow style={{ marginBottom: 10 }}>함께 내보낼 자료</Eyebrow>
          <Card pad={4}>
            {[
              ["problems", "문제지", "30 문항 · 8 페이지", "article"],
              ["answers", "정답지", "분리 PDF", "list-checks"],
              ["solutions", "해설지", "풀이 포함 · 12 페이지", "book-open"],
              ["stats", "단원·유형 통계", "엑셀 (.xlsx)", "chart-bar"],
            ].map(([k, t, sub, ico], i, arr) => {
              const on = bundle[k];
              return (
                <div key={k} onClick={() => setBundle(o => ({...o, [k]: !on}))} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                  borderBottom: i < arr.length - 1 ? `1px solid ${HF.c.line}` : "none",
                  cursor: "pointer",
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: HF.r.r1,
                    background: on ? HF.c.accent : HF.c.surface,
                    border: `1.5px solid ${on ? HF.c.accent : HF.c.lineStrong}`,
                    color: "white", display: "grid", placeItems: "center",
                    flexShrink: 0, transition: "all 140ms",
                  }}>{on && <Ico name="check" size={11} weight="bold" />}</div>
                  <Ico name={ico} size={16} color={on ? HF.c.text : HF.c.muted} />
                  <div style={{ flex: 1 }}>
                    <div style={{ ...applyType("body"), fontWeight: 550, color: HF.c.text }}>{t}</div>
                    <div style={{ ...applyType("caption"), color: HF.c.muted, marginTop: 1 }}>{sub}</div>
                  </div>
                </div>
              );
            })}
          </Card>
        </div>

        <div>
          <Eyebrow style={{ marginBottom: 10 }}>파일명</Eyebrow>
          <Input value={`${ctx.selectedTest?.title || "변형 시험지"}_${new Date().toLocaleDateString("ko-KR").replace(/\\./g, "").replace(/\\s/g, "")}`} suffix={"." + format} mono />
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Eyebrow icon="eye">미리보기</Eyebrow>
          <div style={{ display: "flex", gap: 4 }}>
            <Btn kind="ghost" size="sm" icon="magnifying-glass-plus"></Btn>
            <Btn kind="ghost" size="sm" icon="magnifying-glass-minus"></Btn>
          </div>
        </div>

        <div style={{
          background: "#E8EAEF", borderRadius: HF.r.r3, padding: 28,
          display: "flex", justifyContent: "center", gap: 16,
          minHeight: 380,
        }}>
          {[1, 2].map(p => (
            <div key={p} style={{
              width: 220, aspectRatio: "3 / 4.2",
              background: "white", boxShadow: HF.sh.s3,
              borderRadius: 2,
              padding: "16px 18px",
              fontSize: 7, lineHeight: 1.5,
              display: "flex", flexDirection: "column",
            }}>
              <div style={{
                paddingBottom: 4, marginBottom: 8,
                fontSize: 9, fontWeight: 700, color: HF.c.text,
                borderBottom: `1px solid ${HF.c.ink}`,
                display: "flex", justifyContent: "space-between",
              }}>
                <span>수학영역 · 변형 시험지 A</span>
                <span style={{ fontFamily: HF.t.mono.family }}>{p}</span>
              </div>
              {[1, 2, 3].map(n => {
                const num = n + (p - 1) * 3;
                return (
                  <div key={n} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 3, alignItems: "baseline" }}>
                      <span style={{ fontSize: 8, fontWeight: 700 }}>{num}.</span>
                      <div style={{ flex: 1, height: 2, background: HF.c.surface3, borderRadius: 1 }} />
                    </div>
                    <div style={{ marginLeft: 10, marginTop: 2 }}>
                      <div style={{ height: 2, background: HF.c.surface3, borderRadius: 1, width: "75%" }} />
                      {n === 2 && p === 1 && <div style={{ height: 14, background: HF.c.surface2, borderRadius: 1, marginTop: 2, width: "60%" }} />}
                    </div>
                    <div style={{ marginLeft: 10, marginTop: 3, display: "flex", flexDirection: "column", gap: 1.5 }}>
                      {[1,2,3,4,5].map(i => (
                        <div key={i} style={{ display: "flex", gap: 3, alignItems: "center" }}>
                          <span style={{ fontSize: 6, color: HF.c.muted }}>({i})</span>
                          <div style={{ flex: 1, height: 1.5, background: HF.c.surface3, borderRadius: 1, maxWidth: "50%" }} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", fontSize: 6, color: HF.c.muted }}>
                <span>홀수형</span><span style={{ fontFamily: HF.t.mono.family }}>{p}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 4 }}>
          {[1,2,3,4,5,6,7,8].map(p => (
            <div key={p} style={{
              width: 26, height: 26, borderRadius: HF.r.r1,
              background: p === 1 ? HF.c.accent : "white",
              border: p === 1 ? "none" : `1px solid ${HF.c.line}`,
              color: p === 1 ? "white" : HF.c.muted,
              fontSize: 11, fontWeight: 600, fontFamily: HF.t.mono.family,
              display: "grid", placeItems: "center", cursor: "pointer",
              boxShadow: p === 1 ? HF.sh.s1 : "none",
            }}>{p}</div>
          ))}
        </div>

        <Card pad={20} style={{ marginTop: 24 }}>
          <Heading level="h3" style={{ marginBottom: 14 }}>최종 점검</Heading>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              ["전체 문항", "30 / 30 확정", true],
              ["검토 필요", "없음", true],
              ["풀이·해설", bundle.solutions ? "포함" : "미포함", bundle.solutions],
              ["정답지", bundle.answers ? "분리 PDF" : "미포함", bundle.answers],
              ["출력 형식", format.toUpperCase(), true],
            ].map(([k, v, ok]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...applyType("body") }}>
                <span style={{ color: HF.c.text2, display: "flex", alignItems: "center", gap: 8 }}>
                  <Ico name={ok ? "check-circle" : "circle"} size={15} weight={ok ? "fill" : "regular"} color={ok ? HF.c.ok : HF.c.muted} />
                  {k}
                </span>
                <span style={{ color: ok ? HF.c.text : HF.c.muted, fontWeight: 550 }}>{v}</span>
              </div>
            ))}
          </div>
          <Divider style={{ margin: "16px 0" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn kind="secondary" size="md" full icon="eye">미리보기 열기</Btn>
            <Btn kind="accent" size="md" full icon="download-simple">{format === "pdf" ? "PDF 다운로드" : "내보내기"}</Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { WizStep4HF, WizStep5HF });

/* Hi-fi Detail — 시험지 상세 페이지. 실제 수식·도형 렌더링. */

function DetailHF({ ctx }) {
  const test = ctx.selectedTest;
  if (!test) return null;
  const [activeTab, setActiveTab] = React.useState("문항");
  const [activePage, setActivePage] = React.useState(1);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: HF.c.bg }}>

      <TopBar
        left={<>
          <Btn kind="ghost" size="sm" icon="arrow-left" onClick={ctx.backToLibrary}>보관함</Btn>
          <Divider vertical style={{ height: 18 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, ...applyType("body"), minWidth: 0, whiteSpace: "nowrap", overflow: "hidden" }}>
            <span style={{ color: HF.c.muted }}>내 시험지</span>
            <Ico name="caret-right" size={11} color={HF.c.muted} />
            <span style={{ color: HF.c.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 280 }}>{test.title}</span>
            <Chip tone={test.status} size="sm" dot>{test.statusText}</Chip>
          </div>
        </>}
        right={<>
          <Btn kind="ghost" size="sm" icon="share-network">공유</Btn>
          <Btn kind="secondary" size="sm" icon="download-simple">PDF</Btn>
          <Btn kind="accent" size="sm" icon="sparkle" onClick={() => ctx.openModal("new-variant")}>변형 만들기</Btn>
        </>}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Left — pages */}
        <aside style={{
          width: 192, flexShrink: 0, padding: "20px 14px",
          borderRight: `1px solid ${HF.c.line}`,
          background: HF.c.surface, overflow: "auto",
        }}>
          <Eyebrow style={{ marginBottom: 10, whiteSpace: "nowrap" }}>페이지 8개</Eyebrow>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[1,2,3,4,5,6,7,8].map(p => (
              <div key={p}
                onClick={() => setActivePage(p)}
                style={{
                  aspectRatio: "3/4", padding: 8,
                  background: "white",
                  border: `1.5px solid ${p === activePage ? HF.c.accent : HF.c.line}`,
                  borderRadius: HF.r.r1, cursor: "pointer",
                  position: "relative",
                  boxShadow: p === activePage ? HF.sh.accentGlow : HF.sh.s1,
                  transition: "all 140ms ease",
                }}>
                <div style={{
                  borderBottom: `0.6px solid ${HF.c.text}`,
                  paddingBottom: 2, marginBottom: 4,
                  fontSize: 5.5, fontWeight: 700, color: HF.c.text,
                  display: "flex", justifyContent: "space-between",
                }}>
                  <span>수학영역</span><span>{p}</span>
                </div>
                {[1, 2, 3].map(n => (
                  <div key={n} style={{ marginTop: 3 }}>
                    <div style={{ display: "flex", gap: 1.5, alignItems: "baseline" }}>
                      <span style={{ fontSize: 5, fontWeight: 700 }}>{n}</span>
                      <div style={{ flex: 1, height: 1.2, background: HF.c.surface3, borderRadius: 1 }} />
                    </div>
                    <div style={{ marginLeft: 5, marginTop: 1.5, height: 1, background: HF.c.surface3, borderRadius: 1, width: "70%" }} />
                    {n === 2 && <div style={{ marginLeft: 5, marginTop: 1.5, height: 8, background: HF.c.surface2, borderRadius: 1, width: "60%" }} />}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
          {/* Hero */}
          <Card pad={24} style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
              <div style={{
                width: 124, height: 158, borderRadius: HF.r.r2,
                background: "white", border: `1px solid ${HF.c.line}`,
                boxShadow: HF.sh.s2,
                padding: "10px 14px", position: "relative",
                flexShrink: 0,
              }}>
                <div style={{ borderBottom: `0.8px solid ${HF.c.text}`, paddingBottom: 3, marginBottom: 6, fontSize: 8, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                  <span>수학영역</span><span>1</span>
                </div>
                {[1, 2].map(n => (
                  <div key={n} style={{ marginTop: 5 }}>
                    <div style={{ display: "flex", gap: 2, alignItems: "baseline", marginBottom: 2 }}>
                      <span style={{ fontSize: 7, fontWeight: 700 }}>{n}.</span>
                      <div style={{ flex: 1, height: 2, background: HF.c.surface3, borderRadius: 1 }} />
                    </div>
                    <div style={{ marginLeft: 7, height: 2, background: HF.c.surface3, borderRadius: 1, width: "70%" }} />
                  </div>
                ))}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  {test.tags.map(t => <Chip key={t} size="sm">{t}</Chip>)}
                </div>
                <div style={{ ...applyType("h1"), color: HF.c.text, marginBottom: 4 }}>{test.title}</div>
                <div style={{ ...applyType("body"), color: HF.c.muted, marginBottom: 18 }}>
                  {test.subject} · 30문항 · 8 페이지 · 업로드 2025.05.18
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, max-content)", gap: 28 }}>
                  {[
                    { l: "문항", v: "30", u: "" },
                    { l: "확정", v: "27", u: "/30", tone: HF.c.ok },
                    { l: "검토 필요", v: "3", u: "", tone: HF.c.warn },
                    { l: "변형본", v: "2", u: "개" },
                    { l: "평균 난이도", v: "중", u: "" },
                  ].map((s, i) => (
                    <div key={i} style={{ whiteSpace: "nowrap" }}>
                      <div style={{ ...applyType("micro"), color: HF.c.muted, marginBottom: 4 }}>{s.l}</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                        <span style={{ fontSize: 22, fontWeight: 700, color: s.tone || HF.c.text, fontFamily: HF.t.mono.family, letterSpacing: "-0.02em" }}>{s.v}</span>
                        <span style={{ ...applyType("small"), color: HF.c.muted }}>{s.u}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Tab bar */}
          <div style={{
            display: "flex", borderBottom: `1px solid ${HF.c.line}`,
            marginBottom: 20, gap: 4,
          }}>
            {[
              { id: "문항", label: "문항", count: 30, icon: "list-numbers" },
              { id: "해설", label: "해설", count: 30, icon: "book-open" },
              { id: "통계", label: "통계", icon: "chart-bar" },
              { id: "변형 이력", label: "변형 이력", count: 2, icon: "git-branch" },
            ].map(t => {
              const on = t.id === activeTab;
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "10px 14px", border: "none", background: "transparent",
                  color: on ? HF.c.text : HF.c.muted, fontWeight: on ? 600 : 500,
                  fontSize: 13.5, cursor: "pointer", whiteSpace: "nowrap",
                  borderBottom: `2px solid ${on ? HF.c.text : "transparent"}`,
                  marginBottom: -1, fontFamily: "inherit",
                }}>
                  <Ico name={t.icon} size={14} weight={on ? "fill" : "regular"} />
                  {t.label}
                  {t.count && (
                    <span style={{ ...applyType("caption"), color: HF.c.muted, fontFamily: HF.t.mono.family }}>
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {activeTab === "문항" && <ProblemsTab />}
          {activeTab === "통계" && <StatsTab />}
          {activeTab === "해설" && <SolutionsTab />}
          {activeTab === "변형 이력" && <HistoryTab />}

          {/* Call to action */}
          <div style={{
            marginTop: 32, padding: 22, borderRadius: HF.r.r4,
            background: `linear-gradient(135deg, ${HF.c.accentSoft}, white)`,
            border: `1px solid ${HF.c.accentSoftStrong}`,
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 22,
          }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{
                width: 40, height: 40, borderRadius: HF.r.r2,
                background: `linear-gradient(135deg, ${HF.c.accent}, ${HF.c.accentDark})`,
                color: "white", display: "grid", placeItems: "center",
                boxShadow: HF.sh.s2,
              }}>
                <Ico name="sparkle" size={20} weight="fill" />
              </div>
              <div>
                <div style={{ ...applyType("h2"), color: HF.c.accentInk, marginBottom: 2 }}>이 시험지로 변형 시험지 만들기</div>
                <div style={{ ...applyType("body"), color: HF.c.text2 }}>난이도·유형·문항을 미세 조정해서 새 시험지 N개를 한 번에 생성합니다.</div>
              </div>
            </div>
            <Btn kind="accent" size="lg" iconRight="arrow-right" onClick={() => ctx.openModal("new-variant")}>변형 만들기</Btn>
          </div>
        </main>

        {/* Right — metadata */}
        <aside style={{
          width: 296, flexShrink: 0, padding: "24px 20px",
          borderLeft: `1px solid ${HF.c.line}`,
          background: HF.c.surface, overflow: "auto",
        }}>
          <Eyebrow style={{ marginBottom: 12 }}>정보</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 26 }}>
            {[
              ["과목", test.subject, "function"],
              ["문항", `${test.count}개`, "list-numbers"],
              ["업로드", "2025.05.18", "calendar"],
              ["변환 방식", "OCR + 유사", "magic-wand"],
              ["크기", "2.4 MB · 8p", "file-pdf"],
              ["제작자", "박선생", "user"],
            ].map(([k, v, ico]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, ...applyType("small") }}>
                <span style={{ color: HF.c.muted, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  <Ico name={ico} size={13} />{k}
                </span>
                <span style={{ color: HF.c.text, fontWeight: 550, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span>
              </div>
            ))}
          </div>

          <Eyebrow style={{ marginBottom: 12 }}>단원별 분포</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 26 }}>
            {[
              ["다항식", 4, 0.85, HF.c.ok],
              ["방정식·부등식", 5, 0.72, HF.c.ok],
              ["도형의 방정식", 4, 0.6, HF.c.accent],
              ["함수와 그래프", 6, 0.5, HF.c.warn],
              ["수열·미적분", 8, 0.4, HF.c.warn],
              ["통계", 3, 0.92, HF.c.ok],
            ].map(([t, n, acc, color]) => (
              <div key={t}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 8, ...applyType("small") }}>
                  <span style={{ color: HF.c.text, whiteSpace: "nowrap", flex: "1 1 auto", minWidth: 0 }}>{t}</span>
                  <span style={{ color: HF.c.muted, fontFamily: HF.t.mono.family, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {n} · {Math.round(acc * 100)}%
                  </span>
                </div>
                <div style={{ height: 4, background: HF.c.surface2, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${acc * 100}%`, height: "100%", background: color, transition: "width 600ms cubic-bezier(.2,.9,.3,1)" }} />
                </div>
              </div>
            ))}
          </div>

          <Eyebrow style={{ marginBottom: 12 }}>변형 이력</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              ["ver.1 · 숫자만", "박선생 · 5/15", "ok"],
              ["ver.2 · 같은 유형", "박선생 · 5/18", "ok"],
            ].map(([v, m, t]) => (
              <div key={v} style={{
                padding: 10, borderRadius: HF.r.r2, background: HF.c.surface2,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ ...applyType("small"), fontWeight: 600, color: HF.c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</div>
                  <div style={{ ...applyType("caption"), color: HF.c.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m}</div>
                </div>
                <Chip tone={t} size="sm" dot>완료</Chip>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ProblemsTab() {
  const samples = ["p1", "p6", "p11", "p17"];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <Heading level="h2" sub="30개 중 4개 표시">문항 미리보기</Heading>
        <div style={{ display: "flex", gap: 6 }}>
          <Segmented value="grid" onChange={() => {}} options={[
            { value: "grid", icon: "squares-four", label: "카드" },
            { value: "list", icon: "list", label: "목록" },
          ]} size="sm" />
          <Btn kind="ghost" size="sm" iconRight="arrow-right">전체 보기</Btn>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {samples.map(id => <ProblemCard key={id} problemId={id} />)}
      </div>
    </div>
  );
}

function ProblemCard({ problemId }) {
  const p = PROBLEMS[problemId];
  return (
    <Card pad={18} style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${HF.c.line}` }}>
        <div style={{
          display: "grid", placeItems: "center",
          width: 26, height: 26, borderRadius: HF.r.r1,
          background: HF.c.ink, color: "white",
          fontSize: 12, fontWeight: 700, fontFamily: HF.t.mono.family,
        }}>{p.num}</div>
        <Chip tone="accent" size="sm">{p.topic}</Chip>
        <span style={{ ...applyType("small"), color: HF.c.muted, marginLeft: "auto" }}>
          {p.diff} · {p.points}점
        </span>
      </div>
      {p.render("full")}
    </Card>
  );
}

function StatsTab() {
  return (
    <div style={{ padding: 24, textAlign: "center", color: HF.c.muted, ...applyType("body") }}>
      <Ico name="chart-bar" size={36} color={HF.c.mutedSoft} weight="duotone" />
      <div style={{ marginTop: 10 }}>통계 탭 (mock)</div>
    </div>
  );
}
function SolutionsTab() {
  return (
    <div style={{ padding: 24, textAlign: "center", color: HF.c.muted, ...applyType("body") }}>
      <Ico name="book-open" size={36} color={HF.c.mutedSoft} weight="duotone" />
      <div style={{ marginTop: 10 }}>해설지 탭 (mock)</div>
    </div>
  );
}
function HistoryTab() {
  return (
    <div style={{ padding: 24, textAlign: "center", color: HF.c.muted, ...applyType("body") }}>
      <Ico name="git-branch" size={36} color={HF.c.mutedSoft} weight="duotone" />
      <div style={{ marginTop: 10 }}>변형 이력 (mock)</div>
    </div>
  );
}

Object.assign(window, { DetailHF });

/* Hi-fi Library — Linear/Notion feel. Sidebar + stats + tests grid. */

function LibraryHF({ ctx }) {
  const [collection, setCollection] = React.useState("전체");
  const [view, setView] = React.useState("grid");
  const [sort, setSort] = React.useState("recent");

  const tests = window.MOCK_TESTS_HF;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: HF.c.bg }}>

      <TopBar
        left={<>
          <Logo />
          <Divider vertical style={{ height: 20 }} />
          <nav style={{ display: "flex", gap: 2 }}>
            {[
              { t: "내 시험지", icon: "books", on: true },
              { t: "변환 작업", icon: "lightning" },
              { t: "단원 자료", icon: "graduation-cap" },
            ].map(n => (
              <div key={n.t} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", borderRadius: HF.r.r1, cursor: "pointer",
                color: n.on ? HF.c.text : HF.c.muted,
                background: n.on ? HF.c.surface2 : "transparent",
                fontSize: 13, fontWeight: 550, whiteSpace: "nowrap",
              }}>
                <Ico name={n.icon} size={14} weight={n.on ? "fill" : "regular"} />
                {n.t}
              </div>
            ))}
          </nav>
        </>}
        right={<>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "0 10px 0 8px", height: 30,
            background: HF.c.surface2, borderRadius: HF.r.r2,
            color: HF.c.muted, fontSize: 12.5, minWidth: 220,
          }}>
            <Ico name="magnifying-glass" size={14} />
            <span style={{ flex: 1 }}>검색</span>
            <Kbd>⌘</Kbd><Kbd>K</Kbd>
          </div>
          <Btn kind="ghost" size="sm" icon="bell-simple"></Btn>
          <Btn kind="accent" size="sm" icon="plus" onClick={() => ctx.startWizard(null)}>새 변환</Btn>
          <Avatar />
        </>}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Sidebar */}
        <aside style={{
          width: 232, flexShrink: 0, padding: "18px 14px",
          borderRight: `1px solid ${HF.c.line}`,
          background: HF.c.surface, overflow: "auto",
        }}>
          <Eyebrow style={{ marginBottom: 8, paddingLeft: 8 }}>컬렉션</Eyebrow>
          <NavList items={[
            { id: "전체", label: "전체", icon: "stack", count: 47 },
            { id: "모의평가", label: "모의평가", icon: "chart-line", count: 12 },
            { id: "수능 기출", label: "수능 기출", icon: "exam", count: 8 },
            { id: "학교 시험", label: "학교 시험", icon: "buildings", count: 18 },
            { id: "내가 만든 변형", label: "내가 만든 변형", icon: "sparkle", count: 9 },
          ]} current={collection} onChange={setCollection} />

          <div style={{ marginTop: 22 }}>
            <Eyebrow style={{ marginBottom: 8, paddingLeft: 8 }}>학년</Eyebrow>
            <NavList items={[
              { id: "고1", label: "고1", icon: "circle", count: 12 },
              { id: "고2", label: "고2", icon: "circle", count: 18 },
              { id: "고3 · 재수", label: "고3 · 재수", icon: "circle-half", count: 17 },
            ]} />
          </div>

          <div style={{ marginTop: 22, paddingLeft: 8 }}>
            <Eyebrow style={{ marginBottom: 8 }}>태그</Eyebrow>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {["미적분", "확통", "기하", "공통수학1", "수능 직전"].map(t => (
                <Chip key={t} tone="soft" size="sm">#{t}</Chip>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 28, padding: 12, background: HF.c.surface2, borderRadius: HF.r.r3, border: `1px solid ${HF.c.line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Ico name="lightning" size={13} color={HF.c.accent} weight="fill" />
              <span style={{ ...applyType("caption"), color: HF.c.text }}>이번 달 사용</span>
            </div>
            <div style={{ ...applyType("h3"), fontFamily: HF.t.mono.family, color: HF.c.text }}>
              318 <span style={{ color: HF.c.muted, fontWeight: 400 }}>/ 2,000</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <Progress value={318} max={2000} tone="accent" height={3} />
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
          <div style={{ padding: "28px 36px", maxWidth: 1280, minWidth: 0 }}>
            <Heading
              level="h1"
              sub={`${tests.length}개 · 최근 7일 12개 추가`}
              right={<>
                <Segmented value={sort} onChange={setSort} options={[
                  { value: "recent", label: "최근순" },
                  { value: "name", label: "이름순" },
                  { value: "status", label: "상태별" },
                ]} size="sm" />
                <Segmented value={view} onChange={setView} options={[
                  { value: "grid", icon: "squares-four" },
                  { value: "list", icon: "list" },
                ]} size="sm" />
              </>}
            >{collection}</Heading>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginTop: 22 }}>
              <StatCard label="변환 완료" value="1,420" unit="문항" trend="+82" trendTone="ok" tone="ok" icon="check-circle" />
              <StatCard label="변형 시험지" value="9" unit="개 생성" trend="+2" tone="accent" icon="sparkle" />
              <StatCard label="검토 대기" value="23" unit="문항" tone="warn" icon="warning-circle" />
              <StatCard label="평균 정답률" value="78" unit="%" trend="+3pt" tone="ok" icon="trend-up" />
            </div>

            <div style={{ marginTop: 28, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Eyebrow icon="clock-counter-clockwise">최근 작업</Eyebrow>
              <span style={{ ...applyType("small"), color: HF.c.muted }}>{tests.length}개 표시</span>
            </div>

            {view === "grid" ? (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(232px, 1fr))",
                gap: 14,
              }}>
                {tests.map(t => <TestCardHF key={t.id} test={t} onClick={() => ctx.openTest(t.id)} />)}
              </div>
            ) : (
              <TestListHF tests={tests} onClick={(id) => ctx.openTest(id)} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function NavList({ items, current, onChange }) {
  const [hover, setHover] = React.useState(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {items.map(it => {
        const on = it.id === current;
        const h = hover === it.id;
        return (
          <div key={it.id}
            onClick={() => onChange && onChange(it.id)}
            onMouseEnter={() => setHover(it.id)}
            onMouseLeave={() => setHover(null)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 8px", borderRadius: HF.r.r1, cursor: "pointer",
              background: on ? HF.c.surface2 : h ? HF.c.hover : "transparent",
              color: on ? HF.c.text : HF.c.text2,
              fontSize: 13, fontWeight: on ? 550 : 450,
              transition: "background 100ms",
            }}>
            <Ico name={it.icon} size={14} weight={on ? "fill" : "regular"} color={on ? HF.c.accent : HF.c.muted} />
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.count !== undefined && (
              <span style={{ fontSize: 11, color: HF.c.muted, fontFamily: HF.t.mono.family }}>{it.count}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TestCardHF({ test, onClick }) {
  return (
    <Card pad={0} interactive onClick={onClick} style={{ overflow: "hidden" }}>
      {/* Thumbnail */}
      <div style={{
        height: 132, position: "relative",
        background: `linear-gradient(135deg, ${HF.c.surface2}, ${HF.c.bg})`,
        borderBottom: `1px solid ${HF.c.line}`,
        overflow: "hidden",
      }}>
        {/* Mini paper preview */}
        <div style={{
          position: "absolute", inset: "12px 24px 0 24px",
          background: "white", borderRadius: "3px 3px 0 0",
          boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
          padding: "10px 12px",
          fontSize: 5.5, lineHeight: 1.4,
        }}>
          <div style={{ fontWeight: 600, color: HF.c.text, fontSize: 6.5, marginBottom: 3, paddingBottom: 2, borderBottom: `0.6px solid ${HF.c.ink}` }}>수학영역</div>
          {[1, 2, 3].map(n => (
            <div key={n} style={{ marginTop: 4 }}>
              <div style={{ display: "flex", gap: 2, alignItems: "baseline" }}>
                <span style={{ fontWeight: 600 }}>{n}.</span>
                <div style={{ flex: 1, height: 2, background: HF.c.surface3, borderRadius: 1 }} />
              </div>
              <div style={{ marginLeft: 6, marginTop: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
                <div style={{ height: 1.5, background: HF.c.surface2, borderRadius: 1, width: "75%" }} />
                {n === 2 && <div style={{ height: 10, background: HF.c.surface2, borderRadius: 1, margin: "2px 0", width: "60%" }} />}
              </div>
            </div>
          ))}
        </div>
        {/* Status chip */}
        <div style={{ position: "absolute", top: 8, right: 8 }}>
          <Chip tone={test.status} size="sm" dot>{test.statusText}</Chip>
        </div>
      </div>
      {/* Meta */}
      <div style={{ padding: "12px 14px" }}>
        <div style={{
          ...applyType("h3"), color: HF.c.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginBottom: 4,
        }}>{test.title}</div>
        <div style={{ display: "flex", justifyContent: "space-between", ...applyType("small"), color: HF.c.muted, whiteSpace: "nowrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Ico name="article" size={12} />{test.count}문항
          </span>
          <span>{test.time}</span>
        </div>
      </div>
    </Card>
  );
}

function TestListHF({ tests, onClick }) {
  return (
    <Card pad={0}>
      <div style={{
        padding: "10px 16px", borderBottom: `1px solid ${HF.c.line}`,
        display: "grid", gridTemplateColumns: "1fr 80px 140px 100px 100px 36px",
        gap: 12, alignItems: "center",
        ...applyType("micro"), color: HF.c.muted,
      }}>
        <span>제목</span>
        <span>문항</span>
        <span>과목</span>
        <span>상태</span>
        <span>수정</span>
        <span></span>
      </div>
      {tests.map(t => (
        <ListRow key={t.id} test={t} onClick={() => onClick(t.id)} />
      ))}
    </Card>
  );
}

function ListRow({ test, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "12px 16px", borderBottom: `1px solid ${HF.c.line}`,
        display: "grid", gridTemplateColumns: "1fr 80px 140px 100px 100px 36px",
        gap: 12, alignItems: "center", cursor: "pointer",
        background: hover ? HF.c.hover : "transparent",
        transition: "background 100ms",
      }}>
      <span style={{ ...applyType("body"), color: HF.c.text, fontWeight: 550 }}>{test.title}</span>
      <span style={{ ...applyType("small"), color: HF.c.muted, fontFamily: HF.t.mono.family }}>{test.count}</span>
      <span style={{ ...applyType("small"), color: HF.c.text2 }}>{test.subject}</span>
      <Chip tone={test.status} size="sm" dot>{test.statusText}</Chip>
      <span style={{ ...applyType("small"), color: HF.c.muted }}>{test.time}</span>
      <Ico name="caret-right" size={12} color={hover ? HF.c.text : HF.c.muted} />
    </div>
  );
}

// Mock test data with richer fields
window.MOCK_TESTS_HF = [
  { id: "t1", title: "2024학년도 6월 모의평가", count: 30, status: "warn", statusText: "검토 중 (3)", time: "오늘", subject: "공통+미적분", tags: ["고3", "모의평가", "6월"] },
  { id: "t2", title: "3월 학평 변형 ver.2", count: 30, status: "ok", statusText: "확정", time: "어제", subject: "공통+미적분", tags: ["고3", "학평", "변형"] },
  { id: "t3", title: "수능 미적분 클론", count: 8, status: "ok", statusText: "확정", time: "2일 전", subject: "미적분", tags: ["고3", "변형"] },
  { id: "t4", title: "내신 대비 모의 1차", count: 25, status: "neutral", statusText: "초안", time: "3일 전", subject: "공통수학1", tags: ["고2", "내신"] },
  { id: "t5", title: "2023 9월 모의평가", count: 30, status: "ok", statusText: "확정", time: "1주 전", subject: "공통+미적분", tags: ["고3", "모의평가"] },
  { id: "t6", title: "기출 변형 (확통)", count: 12, status: "ok", statusText: "확정", time: "1주 전", subject: "확률과 통계", tags: ["고3", "변형"] },
  { id: "t7", title: "10월 학평 + 변형", count: 30, status: "ok", statusText: "확정", time: "2주 전", subject: "공통+미적분", tags: ["고3"] },
  { id: "t8", title: "여름방학 보충 세트", count: 40, status: "neutral", statusText: "초안", time: "3주 전", subject: "공통수학1·2", tags: ["고2"] },
];

Object.assign(window, { LibraryHF });

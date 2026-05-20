/* Wireframe primitives — shared building blocks for all 6 variations.
   Aesthetic: mid-fi. Crisp boxes, grayscale + single indigo accent, Pretendard. */

const WF = {};

// ---------- Style tokens ----------
WF.t = {
  ink: "#1F2330",
  ink2: "#4A5060",
  muted: "#8A91A0",
  line: "#D8DCE3",
  line2: "#E6E9EF",
  bg: "#F4F5F8",
  surface: "#FFFFFF",
  accent: "#4F46E5",
  accentSoft: "#EEF0FF",
  accentInk: "#3730A3",
  warn: "#D97706",
  warnSoft: "#FEF3C7",
  ok: "#059669",
  okSoft: "#D1FAE5",
  danger: "#DC2626",
};

// ---------- Frame: a single screen surface ----------
WF.Frame = ({ width = 1280, height = 820, bg = WF.t.bg, children, style = {}, label }) => (
  <div style={{
    width, height, background: bg, position: "relative", overflow: "hidden",
    fontFamily: "Pretendard, 'Apple SD Gothic Neo', -apple-system, system-ui, sans-serif",
    color: WF.t.ink, fontSize: 13, lineHeight: 1.45,
    ...style
  }}>
    {label && <WF.ScreenTag>{label}</WF.ScreenTag>}
    {children}
  </div>
);

WF.ScreenTag = ({ children }) => (
  <div style={{
    position: "absolute", top: 12, right: 12, zIndex: 50,
    background: WF.t.ink, color: "white", fontSize: 10, fontWeight: 600,
    padding: "4px 8px", borderRadius: 4, letterSpacing: 0.3,
    textTransform: "uppercase",
  }}>{children}</div>
);

// ---------- Generic Box ----------
WF.Box = ({ children, style = {}, pad = 16, border = true, bg = WF.t.surface, dashed = false, ...rest }) => (
  <div style={{
    background: bg,
    border: border ? `1px ${dashed ? "dashed" : "solid"} ${WF.t.line}` : "none",
    borderRadius: 8, padding: pad, boxSizing: "border-box",
    ...style
  }} {...rest}>{children}</div>
);

// ---------- Top App Bar ----------
WF.AppBar = ({ title = "수학 기출지 변환기", right, tabs, current, style = {} }) => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between",
    height: 56, background: WF.t.surface, borderBottom: `1px solid ${WF.t.line}`,
    padding: "0 24px", flexShrink: 0, ...style
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6, background: WF.t.accent,
          color: "white", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700,
          flexShrink: 0
        }}>∑</div>
        <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap" }}>{title}</div>
      </div>
      {tabs && (
        <div style={{ display: "flex", gap: 4 }}>
          {tabs.map(t => (
            <div key={t} style={{
              padding: "8px 14px", fontSize: 13, borderRadius: 6,
              background: t === current ? WF.t.accentSoft : "transparent",
              color: t === current ? WF.t.accentInk : WF.t.ink2,
              fontWeight: t === current ? 600 : 500,
              whiteSpace: "nowrap",
            }}>{t}</div>
          ))}
        </div>
      )}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap" }}>
      {right}
      <div style={{
        width: 28, height: 28, borderRadius: "50%", background: WF.t.line2,
        display: "grid", placeItems: "center", fontSize: 11, color: WF.t.ink2, flexShrink: 0
      }}>김</div>
    </div>
  </div>
);

// ---------- Button ----------
WF.Btn = ({ children, kind = "secondary", size = "md", icon, full, style = {} }) => {
  const sizes = {
    sm: { padding: "5px 10px", fontSize: 11, height: 26 },
    md: { padding: "8px 14px", fontSize: 13, height: 34 },
    lg: { padding: "10px 18px", fontSize: 14, height: 42 },
  };
  const kinds = {
    primary: { background: WF.t.accent, color: "white", border: `1px solid ${WF.t.accent}` },
    secondary: { background: WF.t.surface, color: WF.t.ink, border: `1px solid ${WF.t.line}` },
    ghost: { background: "transparent", color: WF.t.ink2, border: `1px solid transparent` },
    soft: { background: WF.t.accentSoft, color: WF.t.accentInk, border: `1px solid ${WF.t.accentSoft}` },
    danger: { background: WF.t.surface, color: WF.t.danger, border: `1px solid #FEE2E2` },
  };
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 6,
      fontWeight: 600, whiteSpace: "nowrap", boxSizing: "border-box",
      width: full ? "100%" : undefined, justifyContent: "center",
      ...sizes[size], ...kinds[kind], ...style
    }}>
      {icon && <span style={{ fontSize: sizes[size].fontSize }}>{icon}</span>}
      {children}
    </div>
  );
};

// ---------- Input field ----------
WF.Input = ({ label, value, placeholder, style = {}, suffix }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
    {label && <div style={{ fontSize: 11, fontWeight: 600, color: WF.t.ink2 }}>{label}</div>}
    <div style={{
      height: 34, border: `1px solid ${WF.t.line}`, borderRadius: 6,
      background: WF.t.surface, padding: "0 10px", display: "flex",
      alignItems: "center", justifyContent: "space-between", fontSize: 12,
      color: value ? WF.t.ink : WF.t.muted
    }}>
      <span>{value || placeholder}</span>
      {suffix && <span style={{ color: WF.t.muted, fontSize: 11 }}>{suffix}</span>}
    </div>
  </div>
);

// ---------- Select ----------
WF.Select = ({ label, value, style = {} }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
    {label && <div style={{ fontSize: 11, fontWeight: 600, color: WF.t.ink2 }}>{label}</div>}
    <div style={{
      height: 34, border: `1px solid ${WF.t.line}`, borderRadius: 6,
      background: WF.t.surface, padding: "0 10px", display: "flex",
      alignItems: "center", justifyContent: "space-between", fontSize: 12,
    }}>
      <span>{value}</span>
      <span style={{ color: WF.t.muted, fontSize: 10 }}>▾</span>
    </div>
  </div>
);

// ---------- Chip / Tag ----------
WF.Chip = ({ children, tone = "neutral", style = {} }) => {
  const tones = {
    neutral: { bg: WF.t.line2, fg: WF.t.ink2 },
    accent: { bg: WF.t.accentSoft, fg: WF.t.accentInk },
    warn: { bg: WF.t.warnSoft, fg: WF.t.warn },
    ok: { bg: WF.t.okSoft, fg: WF.t.ok },
  };
  const c = tones[tone];
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: c.bg, color: c.fg, fontSize: 11, fontWeight: 600,
      padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap", ...style
    }}>{children}</div>
  );
};

// ---------- Section header inside a frame ----------
WF.SectionTitle = ({ children, sub, right, style = {} }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", ...style }}>
    <div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{children}</div>
      {sub && <div style={{ fontSize: 11, color: WF.t.muted, marginTop: 2 }}>{sub}</div>}
    </div>
    {right}
  </div>
);

// ---------- Skeleton blocks (for placeholder text) ----------
WF.Line = ({ w = "100%", h = 8, style = {} }) => (
  <div style={{ width: w, height: h, background: WF.t.line2, borderRadius: 3, ...style }} />
);

WF.Para = ({ lines = 3, style = {}, last = "60%" }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
    {Array.from({ length: lines }).map((_, i) => (
      <WF.Line key={i} w={i === lines - 1 ? last : "100%"} h={8} />
    ))}
  </div>
);

// ---------- Math problem mock (compact + full variants) ----------
WF.ProblemMock = ({ num = 1, dense = false, hasFigure = false, choices = true, status, height = "auto" }) => (
  <div style={{
    border: `1px solid ${WF.t.line}`, borderRadius: 8, padding: dense ? 12 : 16,
    background: WF.t.surface, position: "relative", height
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <div style={{
        width: 22, height: 22, borderRadius: 4, background: WF.t.ink, color: "white",
        display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700
      }}>{num}</div>
      {status && <WF.Chip tone={status.tone}>{status.text}</WF.Chip>}
    </div>
    <WF.Para lines={dense ? 2 : 3} last={dense ? "75%" : "85%"} />
    {hasFigure && (
      <div style={{
        marginTop: 10, height: dense ? 60 : 90, background: WF.t.bg,
        border: `1px dashed ${WF.t.line}`, borderRadius: 6, display: "grid",
        placeItems: "center", fontSize: 10, color: WF.t.muted
      }}>도형 / 그래프</div>
    )}
    {choices && (
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{
              width: 14, height: 14, borderRadius: "50%",
              border: `1px solid ${WF.t.line}`, fontSize: 9, color: WF.t.muted,
              display: "grid", placeItems: "center", flex: "0 0 14px"
            }}>{i}</div>
            <WF.Line w={`${40 + (i * 7) % 40}%`} h={6} />
          </div>
        ))}
      </div>
    )}
  </div>
);

// ---------- Stepper ----------
WF.Stepper = ({ steps, current = 0, style = {} }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, ...style }}>
    {steps.map((s, i) => (
      <React.Fragment key={i}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center",
            fontSize: 12, fontWeight: 700,
            background: i < current ? WF.t.ok : i === current ? WF.t.accent : WF.t.line2,
            color: i <= current ? "white" : WF.t.muted,
          }}>{i < current ? "✓" : i + 1}</div>
          <div style={{
            fontSize: 12, fontWeight: i === current ? 700 : 500,
            color: i === current ? WF.t.ink : i < current ? WF.t.ink2 : WF.t.muted
          }}>{s}</div>
        </div>
        {i < steps.length - 1 && (
          <div style={{ flex: 1, height: 1, background: i < current ? WF.t.ok : WF.t.line, minWidth: 30 }} />
        )}
      </React.Fragment>
    ))}
  </div>
);

// ---------- Annotation callout ----------
WF.Note = ({ children, style = {} }) => (
  <div style={{
    fontSize: 11, color: WF.t.warn, background: WF.t.warnSoft,
    border: `1px dashed #FCD34D`, padding: "6px 10px", borderRadius: 6,
    display: "inline-block", ...style
  }}>↳ {children}</div>
);

// Export
Object.assign(window, { WF });

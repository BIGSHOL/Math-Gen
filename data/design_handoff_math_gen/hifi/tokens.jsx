/* Hi-fi design tokens + 공용 컴포넌트.
   Modern SaaS (Linear/Notion 톤) + Sky blue accent. */

const HF = {
  // Color tokens
  c: {
    // Neutrals
    ink: "#0F1117",
    text: "#1A1D24",
    text2: "#3D4453",
    muted: "#6B7280",
    mutedSoft: "#9CA3AF",
    // Surfaces
    bg: "#FAFBFC",
    surface: "#FFFFFF",
    surface2: "#F4F5F7",
    surface3: "#EAECF0",
    hover: "#F4F5F7",
    // Borders
    line: "#ECEEF0",
    lineStrong: "#D9DCE0",
    // Accent — Sky
    accent: "#0EA5E9",
    accentHover: "#0284C7",
    accentDark: "#075985",
    accentSoft: "#E0F2FE",
    accentSoftStrong: "#BAE6FD",
    accentInk: "#0C4A6E",
    // States
    ok: "#10B981", okSoft: "#D1FAE5", okInk: "#065F46",
    warn: "#F59E0B", warnSoft: "#FEF3C7", warnInk: "#92400E",
    danger: "#EF4444", dangerSoft: "#FEE2E2",
  },

  // Type scale
  t: {
    display: { size: 30, weight: 700, ls: "-0.02em", lh: 1.2 },
    h1: { size: 22, weight: 700, ls: "-0.01em", lh: 1.3 },
    h2: { size: 17, weight: 600, ls: "-0.005em", lh: 1.35 },
    h3: { size: 14, weight: 600, ls: "0", lh: 1.4 },
    body: { size: 13.5, weight: 450, ls: "0", lh: 1.5 },
    small: { size: 12.5, weight: 450, ls: "0", lh: 1.45 },
    caption: { size: 11.5, weight: 500, ls: "0.005em", lh: 1.4 },
    micro: { size: 10.5, weight: 600, ls: "0.06em", lh: 1.3, transform: "uppercase" },
    mono: { family: '"JetBrains Mono", "SF Mono", Menlo, monospace' },
  },

  // Shadows
  sh: {
    s1: "0 1px 2px rgba(15, 17, 23, 0.04)",
    s2: "0 1px 2px rgba(15, 17, 23, 0.04), 0 2px 6px rgba(15, 17, 23, 0.04)",
    s3: "0 4px 16px rgba(15, 17, 23, 0.06), 0 1px 3px rgba(15, 17, 23, 0.05)",
    s4: "0 12px 40px rgba(15, 17, 23, 0.12), 0 4px 12px rgba(15, 17, 23, 0.06)",
    inset: "inset 0 0 0 1px rgba(15, 17, 23, 0.04)",
    accentGlow: "0 0 0 4px rgba(14, 165, 233, 0.12)",
  },

  // Radii
  r: { r1: 4, r2: 6, r3: 8, r4: 12, r5: 16, full: 999 },

  // Spacing helper not needed; use direct px
};

const applyType = (variant) => {
  const t = HF.t[variant];
  if (!t) return {};
  return {
    fontSize: t.size,
    fontWeight: t.weight,
    letterSpacing: t.ls,
    lineHeight: t.lh,
    textTransform: t.transform || "none",
  };
};

// ---------- Phosphor icon wrapper ----------
// Usage: <Ico name="house" weight="regular" size={16} />
// Weights: thin / light / regular / bold / fill / duotone
const Ico = ({ name, weight = "regular", size = 16, color, style }) => {
  const cls = weight === "regular" ? "ph" : `ph-${weight}`;
  return (
    <i className={`${cls} ph-${name}`} style={{
      fontSize: size,
      lineHeight: 1,
      color: color || "inherit",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, flexShrink: 0,
      ...style,
    }} />
  );
};

// ---------- Button ----------
const Btn = ({ children, kind = "secondary", size = "md", icon, iconRight, full, onClick, disabled, style = {}, ...rest }) => {
  const sizes = {
    xs: { padding: "3px 8px", fontSize: 11.5, height: 24, gap: 4, iconSize: 12 },
    sm: { padding: "5px 10px", fontSize: 12.5, height: 28, gap: 5, iconSize: 13 },
    md: { padding: "7px 12px", fontSize: 13, height: 32, gap: 6, iconSize: 14 },
    lg: { padding: "10px 16px", fontSize: 14, height: 40, gap: 8, iconSize: 16 },
  };
  const kinds = {
    primary: {
      background: HF.c.ink, color: "white",
      border: "1px solid " + HF.c.ink,
      boxShadow: HF.sh.s1,
      hoverBg: "#000",
    },
    accent: {
      background: HF.c.accent, color: "white",
      border: "1px solid " + HF.c.accent,
      boxShadow: HF.sh.s1,
      hoverBg: HF.c.accentHover,
    },
    secondary: {
      background: HF.c.surface, color: HF.c.text,
      border: "1px solid " + HF.c.lineStrong,
      boxShadow: HF.sh.s1,
      hoverBg: HF.c.hover,
    },
    ghost: {
      background: "transparent", color: HF.c.text2,
      border: "1px solid transparent",
      hoverBg: HF.c.hover,
    },
    soft: {
      background: HF.c.accentSoft, color: HF.c.accentInk,
      border: "1px solid " + HF.c.accentSoft,
      hoverBg: HF.c.accentSoftStrong,
    },
    softWarn: {
      background: HF.c.warnSoft, color: HF.c.warnInk,
      border: "1px solid " + HF.c.warnSoft,
      hoverBg: "#FDE68A",
    },
    danger: {
      background: HF.c.surface, color: HF.c.danger,
      border: "1px solid #FEE2E2",
      hoverBg: HF.c.dangerSoft,
    },
  };
  const s = sizes[size]; const k = kinds[kind];
  const [hover, setHover] = React.useState(false);

  return (
    <button
      onClick={!disabled ? onClick : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: s.gap, padding: s.padding, height: s.height, fontSize: s.fontSize,
        fontWeight: 550, lineHeight: 1, letterSpacing: 0,
        borderRadius: HF.r.r2, cursor: disabled ? "not-allowed" : "pointer",
        boxSizing: "border-box", whiteSpace: "nowrap",
        width: full ? "100%" : "auto",
        background: hover && !disabled ? k.hoverBg : k.background,
        color: k.color, border: k.border, boxShadow: k.boxShadow,
        opacity: disabled ? 0.5 : 1,
        transition: "background 120ms ease, transform 80ms ease, box-shadow 120ms ease",
        transform: hover && !disabled ? "translateY(-0.5px)" : "none",
        fontFamily: "inherit",
        ...style,
      }}
      {...rest}>
      {icon && <Ico name={icon} size={s.iconSize} weight={kind === "accent" || kind === "primary" ? "bold" : "regular"} />}
      {children}
      {iconRight && <Ico name={iconRight} size={s.iconSize} weight={kind === "accent" || kind === "primary" ? "bold" : "regular"} />}
    </button>
  );
};

// ---------- Chip / Tag ----------
const Chip = ({ children, tone = "neutral", size = "md", icon, dot, style = {} }) => {
  const tones = {
    neutral: { bg: HF.c.surface2, fg: HF.c.text2, dot: HF.c.mutedSoft, border: HF.c.line },
    soft: { bg: HF.c.surface, fg: HF.c.text2, dot: HF.c.mutedSoft, border: HF.c.line },
    accent: { bg: HF.c.accentSoft, fg: HF.c.accentInk, dot: HF.c.accent, border: HF.c.accentSoftStrong },
    ok: { bg: HF.c.okSoft, fg: HF.c.okInk, dot: HF.c.ok, border: "#A7F3D0" },
    warn: { bg: HF.c.warnSoft, fg: HF.c.warnInk, dot: HF.c.warn, border: "#FDE68A" },
    danger: { bg: HF.c.dangerSoft, fg: "#991B1B", dot: HF.c.danger, border: "#FECACA" },
  };
  const sizes = {
    sm: { padding: "1px 6px", fontSize: 10.5, gap: 4, dotSize: 5 },
    md: { padding: "2px 8px", fontSize: 11.5, gap: 5, dotSize: 6 },
    lg: { padding: "4px 10px", fontSize: 12, gap: 6, dotSize: 6 },
  };
  const c = tones[tone]; const s = sizes[size];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: s.gap,
      background: c.bg, color: c.fg, fontSize: s.fontSize, fontWeight: 550,
      padding: s.padding, borderRadius: HF.r.full,
      whiteSpace: "nowrap", lineHeight: 1.4,
      border: `1px solid ${c.border}`,
      ...style,
    }}>
      {dot && <span style={{ width: s.dotSize, height: s.dotSize, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />}
      {icon && <Ico name={icon} size={s.fontSize} />}
      {children}
    </span>
  );
};

// ---------- Card ----------
const Card = ({ children, style = {}, pad = 16, hover, interactive, onClick }) => {
  const [h, setH] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: HF.c.surface,
        border: `1px solid ${HF.c.line}`,
        borderRadius: HF.r.r4,
        padding: pad,
        boxShadow: interactive && h ? HF.sh.s3 : HF.sh.s1,
        cursor: interactive ? "pointer" : "default",
        transform: interactive && h ? "translateY(-1px)" : "none",
        transition: "box-shadow 160ms ease, transform 160ms ease, border-color 160ms ease",
        borderColor: interactive && h ? HF.c.lineStrong : HF.c.line,
        ...style,
      }}>
      {children}
    </div>
  );
};

// ---------- Input ----------
const Input = ({ label, value, onChange, placeholder, suffix, prefix, mono, style = {}, size = "md" }) => {
  const [focus, setFocus] = React.useState(false);
  const sizes = { sm: { h: 28, fs: 12, pad: "0 10px" }, md: { h: 34, fs: 13, pad: "0 12px" } };
  const s = sizes[size];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label && <div style={{ ...applyType("caption"), color: HF.c.text2 }}>{label}</div>}
      <div style={{
        height: s.h, borderRadius: HF.r.r2,
        border: `1px solid ${focus ? HF.c.accent : HF.c.lineStrong}`,
        background: HF.c.surface, padding: s.pad,
        display: "flex", alignItems: "center", gap: 8,
        fontSize: s.fs, color: value ? HF.c.text : HF.c.muted,
        fontFamily: mono ? HF.t.mono.family : "inherit",
        boxShadow: focus ? HF.sh.accentGlow : "none",
        transition: "all 140ms ease",
      }}>
        {prefix && <span style={{ color: HF.c.muted, fontSize: s.fs - 1 }}>{prefix}</span>}
        <input
          value={value || ""} placeholder={placeholder}
          onChange={onChange}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: "inherit", color: "inherit" }}
        />
        {suffix && <span style={{ color: HF.c.muted, fontSize: s.fs - 1 }}>{suffix}</span>}
      </div>
    </div>
  );
};

// ---------- Toggle ----------
const Toggle = ({ value, onChange, label, hint, size = "md" }) => {
  const sizes = { sm: { w: 28, h: 16, k: 12 }, md: { w: 34, h: 20, k: 16 } };
  const s = sizes[size];
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={(e) => { e.preventDefault(); onChange && onChange(!value); }}>
      <div style={{
        width: s.w, height: s.h, borderRadius: s.h,
        background: value ? HF.c.accent : HF.c.surface3,
        position: "relative", flexShrink: 0,
        transition: "background 180ms ease",
      }}>
        <div style={{
          position: "absolute", top: 2, left: value ? s.w - s.k - 2 : 2,
          width: s.k, height: s.k, borderRadius: "50%", background: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          transition: "left 180ms cubic-bezier(.2,.9,.3,1.1)",
        }} />
      </div>
      {label && (
        <div>
          <div style={{ ...applyType("body"), color: HF.c.text }}>{label}</div>
          {hint && <div style={{ ...applyType("small"), color: HF.c.muted, marginTop: 1 }}>{hint}</div>}
        </div>
      )}
    </label>
  );
};

// ---------- Segmented control ----------
const Segmented = ({ value, onChange, options, size = "md", full }) => {
  const sizes = { sm: { h: 26, fs: 11.5, pad: "0 10px" }, md: { h: 30, fs: 12.5, pad: "0 12px" } };
  const s = sizes[size];
  return (
    <div style={{
      display: "inline-flex", padding: 3, background: HF.c.surface2,
      borderRadius: HF.r.r2, gap: 2, width: full ? "100%" : "auto",
    }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} style={{
            flex: full ? 1 : "0 0 auto",
            height: s.h, padding: s.pad, fontSize: s.fs, fontWeight: on ? 600 : 500,
            background: on ? HF.c.surface : "transparent",
            color: on ? HF.c.text : HF.c.muted,
            border: "none", borderRadius: HF.r.r1,
            boxShadow: on ? HF.sh.s1 : "none",
            cursor: "pointer", whiteSpace: "nowrap",
            display: "inline-flex", alignItems: "center", gap: 5, justifyContent: "center",
            transition: "all 120ms ease",
            fontFamily: "inherit",
          }}>
            {o.icon && <Ico name={o.icon} size={s.fs} weight={on ? "bold" : "regular"} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
};

// ---------- KBD shortcut ----------
const Kbd = ({ children, style = {} }) => (
  <kbd style={{
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: 18, height: 18, padding: "0 5px",
    background: HF.c.surface2,
    border: `1px solid ${HF.c.line}`,
    borderBottomWidth: 2,
    borderRadius: 4,
    fontFamily: HF.t.mono.family,
    fontSize: 10, fontWeight: 600, color: HF.c.text2,
    ...style,
  }}>{children}</kbd>
);

// ---------- Divider ----------
const Divider = ({ vertical, style = {} }) => (
  <div style={{
    background: HF.c.line,
    width: vertical ? 1 : "100%", height: vertical ? "100%" : 1,
    ...style,
  }} />
);

// ---------- App bar (TopBar) ----------
const TopBar = ({ left, right, breadcrumb }) => (
  <div style={{
    height: 52, padding: "0 20px", background: HF.c.surface,
    borderBottom: `1px solid ${HF.c.line}`,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    flexShrink: 0,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>{left}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{right}</div>
  </div>
);

// ---------- Logo lockup ----------
const Logo = ({ size = 22 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
    <div style={{
      width: size, height: size, borderRadius: 6,
      background: `linear-gradient(135deg, ${HF.c.accent}, ${HF.c.accentDark})`,
      display: "grid", placeItems: "center",
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15), 0 1px 2px rgba(14, 165, 233, 0.25)",
      flexShrink: 0,
    }}>
      <Ico name="function" weight="bold" size={size * 0.6} color="white" />
    </div>
    <div style={{ ...applyType("h3"), color: HF.c.ink, letterSpacing: "-0.01em" }}>
      MathGen<span style={{ color: HF.c.muted, fontWeight: 500 }}> / 변환</span>
    </div>
  </div>
);

// ---------- Avatar ----------
const Avatar = ({ name = "김", color, size = 26 }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%",
    background: color || `linear-gradient(135deg, #FCA5A5, #EF4444)`,
    color: "white", display: "grid", placeItems: "center",
    fontSize: size * 0.42, fontWeight: 600,
    flexShrink: 0,
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.2)",
  }}>{name}</div>
);

// ---------- Section heading ----------
const Heading = ({ children, sub, right, level = "h2", style = {} }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, ...style }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ ...applyType(level), color: HF.c.text, whiteSpace: "nowrap" }}>{children}</div>
      {sub && <div style={{ ...applyType("small"), color: HF.c.muted, marginTop: 2, whiteSpace: "nowrap" }}>{sub}</div>}
    </div>
    {right && <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>{right}</div>}
  </div>
);

// ---------- Eyebrow micro label ----------
const Eyebrow = ({ children, icon, style = {} }) => (
  <div style={{
    ...applyType("micro"),
    color: HF.c.muted,
    display: "flex", alignItems: "center", gap: 6,
    whiteSpace: "nowrap",
    ...style,
  }}>
    {icon && <Ico name={icon} size={11} />}
    {children}
  </div>
);

// ---------- Stat card (4-up dashboard tile) ----------
const StatCard = ({ label, value, unit, trend, trendTone = "ok", icon, tone = "accent" }) => {
  const toneMap = {
    ok: { bg: HF.c.okSoft, fg: HF.c.ok },
    warn: { bg: HF.c.warnSoft, fg: HF.c.warn },
    accent: { bg: HF.c.accentSoft, fg: HF.c.accent },
  };
  const c = toneMap[tone];
  return (
    <Card pad={16}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{
          width: 28, height: 28, borderRadius: HF.r.r2,
          background: c.bg, color: c.fg,
          display: "grid", placeItems: "center",
        }}>
          <Ico name={icon} size={15} weight="bold" />
        </div>
        {trend && <Chip tone={trendTone === "ok" ? "ok" : trendTone} size="sm">{trend}</Chip>}
      </div>
      <div style={{ ...applyType("caption"), color: HF.c.muted, marginBottom: 4, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 26, fontWeight: 700, color: HF.c.text,
          fontFamily: HF.t.mono.family, letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
        }}>{value}</span>
        {unit && <span style={{ ...applyType("small"), color: HF.c.muted, whiteSpace: "nowrap" }}>{unit}</span>}
      </div>
    </Card>
  );
};

// ---------- Progress bar ----------
const Progress = ({ value, max = 100, tone = "accent", height = 4, label }) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tones = { accent: HF.c.accent, ok: HF.c.ok, warn: HF.c.warn };
  return (
    <div style={{ width: "100%" }}>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, ...applyType("small") }}>
          {label}
        </div>
      )}
      <div style={{ height, background: HF.c.surface3, borderRadius: height, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%", background: tones[tone],
          borderRadius: height, transition: "width 500ms cubic-bezier(.2,.9,.3,1)",
        }} />
      </div>
    </div>
  );
};

Object.assign(window, { HF, applyType, Ico, Btn, Chip, Card, Input, Toggle, Segmented, Kbd, Divider, TopBar, Logo, Avatar, Heading, Eyebrow, Progress, StatCard });

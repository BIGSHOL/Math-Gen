import type { Config } from "tailwindcss";

// Design tokens mirror hifi/tokens.jsx (HF.c / HF.t / HF.sh / HF.r)
// from data/design_handoff_math_gen.
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
    // Legacy files still present in root during Phase 0.6 transition:
    "./App.tsx",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // 와이드 모니터(≥1600 px) 전용 breakpoint. Tailwind 기본은 2xl(1536)
      // 까지라 1920 px 모니터에서 추가 분기를 못 잡았다. 3xl 이후로는
      // `3xl:grid-cols-5` 같은 분기로 카드를 더 펼칠 수 있다.
      screens: {
        "3xl": "1600px",
      },
      colors: {
        // Neutrals
        ink: "#0F1117",
        text: "#1A1D24",
        text2: "#3D4453",
        muted: "#6B7280",
        "muted-soft": "#9CA3AF",
        // Surfaces
        bg: "#FAFBFC",
        surface: "#FFFFFF",
        surface2: "#F4F5F7",
        surface3: "#EAECF0",
        hover: "#F4F5F7",
        // Borders
        line: "#ECEEF0",
        "line-strong": "#D9DCE0",
        // Accent — Sky
        accent: {
          DEFAULT: "#0EA5E9",
          hover: "#0284C7",
          dark: "#075985",
          soft: "#E0F2FE",
          "soft-strong": "#BAE6FD",
          ink: "#0C4A6E",
        },
        // Status
        ok: { DEFAULT: "#10B981", soft: "#D1FAE5", ink: "#065F46" },
        warn: { DEFAULT: "#F59E0B", soft: "#FEF3C7", ink: "#92400E" },
        danger: { DEFAULT: "#EF4444", soft: "#FEE2E2" },
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          '"SF Mono"',
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        // hifi tokens (HF.t) — size / line-height / letter-spacing
        display: ["30px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],
        h1: ["22px", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "700" }],
        h2: ["17px", { lineHeight: "1.35", letterSpacing: "-0.005em", fontWeight: "600" }],
        h3: ["14px", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "600" }],
        body: ["13.5px", { lineHeight: "1.5", letterSpacing: "0", fontWeight: "450" }],
        small: ["12.5px", { lineHeight: "1.45", letterSpacing: "0", fontWeight: "450" }],
        caption: ["11.5px", { lineHeight: "1.4", letterSpacing: "0.005em", fontWeight: "500" }],
        micro: ["10.5px", { lineHeight: "1.3", letterSpacing: "0.06em", fontWeight: "600" }],
      },
      boxShadow: {
        s1: "0 1px 2px rgba(15, 17, 23, 0.04)",
        s2: "0 1px 2px rgba(15, 17, 23, 0.04), 0 2px 6px rgba(15, 17, 23, 0.04)",
        s3: "0 4px 16px rgba(15, 17, 23, 0.06), 0 1px 3px rgba(15, 17, 23, 0.05)",
        s4: "0 12px 40px rgba(15, 17, 23, 0.12), 0 4px 12px rgba(15, 17, 23, 0.06)",
        "inset-line": "inset 0 0 0 1px rgba(15, 17, 23, 0.04)",
        "accent-glow": "0 0 0 4px rgba(14, 165, 233, 0.12)",
      },
      borderRadius: {
        r1: "4px",
        r2: "6px",
        r3: "8px",
        r4: "12px",
        r5: "16px",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(.2,.9,.3,1)",
        "spring-bounce": "cubic-bezier(.2,.9,.3,1.1)",
      },
      keyframes: {
        wizSlideInRight: {
          "0%": { opacity: "0", transform: "translateX(40px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        wizSlideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-40px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        modalEnter: {
          "0%": { opacity: "0", transform: "scale(0.96) translateY(8px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        backdropFade: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "wiz-slide-in-right": "wizSlideInRight 300ms cubic-bezier(.2,.9,.3,1) both",
        "wiz-slide-in-left": "wizSlideInLeft 300ms cubic-bezier(.2,.9,.3,1) both",
        "fade-in-up": "fadeInUp 280ms ease both",
        "modal-enter": "modalEnter 260ms cubic-bezier(.2,.9,.3,1.1) both",
        "backdrop-fade": "backdropFade 220ms ease both",
      },
    },
  },
  plugins: [],
} satisfies Config;

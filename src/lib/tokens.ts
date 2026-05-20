/**
 * Design tokens (JS surface).
 *
 * Mirrors hifi/tokens.jsx (`HF.c / HF.t / HF.sh / HF.r`) from the design
 * handoff. Tailwind already exposes these via theme.extend, but some runtime
 * code (SVG fills, framer-motion props, dynamic colors) still needs raw values.
 *
 * Keep this in sync with tailwind.config.ts.
 */

export const colors = {
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
  // Status
  ok: "#10B981",
  okSoft: "#D1FAE5",
  okInk: "#065F46",
  warn: "#F59E0B",
  warnSoft: "#FEF3C7",
  warnInk: "#92400E",
  danger: "#EF4444",
  dangerSoft: "#FEE2E2",
} as const;

export const shadows = {
  s1: "0 1px 2px rgba(15, 17, 23, 0.04)",
  s2: "0 1px 2px rgba(15, 17, 23, 0.04), 0 2px 6px rgba(15, 17, 23, 0.04)",
  s3: "0 4px 16px rgba(15, 17, 23, 0.06), 0 1px 3px rgba(15, 17, 23, 0.05)",
  s4: "0 12px 40px rgba(15, 17, 23, 0.12), 0 4px 12px rgba(15, 17, 23, 0.06)",
  inset: "inset 0 0 0 1px rgba(15, 17, 23, 0.04)",
  accentGlow: "0 0 0 4px rgba(14, 165, 233, 0.12)",
} as const;

export const radii = {
  r1: 4,
  r2: 6,
  r3: 8,
  r4: 12,
  r5: 16,
  full: 999,
} as const;

export const easings = {
  spring: "cubic-bezier(.2,.9,.3,1)",
  springBounce: "cubic-bezier(.2,.9,.3,1.1)",
} as const;

export type ColorToken = keyof typeof colors;
export type ShadowToken = keyof typeof shadows;
export type RadiusToken = keyof typeof radii;

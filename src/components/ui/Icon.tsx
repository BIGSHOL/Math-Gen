import { cn } from "@app/lib/tailwind";

export type IconWeight = "thin" | "light" | "regular" | "bold" | "fill" | "duotone";

export interface IconProps {
  /** Phosphor icon name (kebab-case), e.g. "house", "magnifying-glass" */
  name: string;
  /** Stroke weight variant. Defaults to "regular". */
  weight?: IconWeight;
  /** Pixel size of the icon glyph. Defaults to 16. */
  size?: number;
  /** Optional color (falls back to currentColor). */
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
}

/**
 * Phosphor Icons wrapper backed by the `@phosphor-icons/web` font.
 *
 * Why the web font (not `@phosphor-icons/react`)? It matches the design
 * handoff's `<Ico>` primitive exactly (4 weights, single API surface, no
 * tree-shaking concern since the font is loaded once at top of index.html).
 *
 * We bring in `@phosphor-icons/react` only when we need React-specific
 * behaviour (e.g. ref forwarding, dynamic stroke) elsewhere.
 */
export const Icon = ({
  name,
  weight = "regular",
  size = 16,
  color,
  className,
  style,
  "aria-label": ariaLabel,
}: IconProps) => {
  const weightClass = weight === "regular" ? "ph" : `ph-${weight}`;
  return (
    <i
      className={cn(weightClass, `ph-${name}`, "inline-flex items-center justify-center", className)}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      style={{
        fontSize: size,
        lineHeight: 1,
        color: color ?? "inherit",
        width: size,
        height: size,
        flexShrink: 0,
        ...style,
      }}
    />
  );
};

export default Icon;

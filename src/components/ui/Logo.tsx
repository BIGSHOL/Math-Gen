import { cn } from "@app/lib/tailwind";
import { Icon } from "./Icon";

export interface LogoProps {
  /** Size of the gradient square in pixels. Defaults to 22. */
  size?: number;
  className?: string;
}

/**
 * MathGen logo lockup — gradient sky-blue square with a `function` glyph
 * plus the "MathGen / 변환" wordmark. Mirrors `<Logo>` from hifi/tokens.jsx.
 */
export const Logo = ({ size = 22, className }: LogoProps) => (
  <div className={cn("flex items-center gap-2 whitespace-nowrap", className)}>
    <div
      className="grid place-items-center flex-shrink-0 rounded-r2"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #0EA5E9, #075985)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15), 0 1px 2px rgba(14, 165, 233, 0.25)",
      }}
    >
      <Icon name="function" weight="bold" size={size * 0.6} color="white" />
    </div>
    <div className="text-h3 text-ink tracking-[-0.01em]">
      MathGen<span className="text-muted font-medium"> / 변환</span>
    </div>
  </div>
);

export default Logo;

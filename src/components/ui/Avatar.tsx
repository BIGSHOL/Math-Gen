import { cn } from "@app/lib/tailwind";

export interface AvatarProps {
  /** Initial(s) to render inside the circle. Defaults to "김". */
  name?: string;
  /** Optional CSS background (e.g. a gradient). Defaults to a red gradient. */
  color?: string;
  /** Diameter in pixels. Defaults to 26. */
  size?: number;
  className?: string;
}

const DEFAULT_GRADIENT = "linear-gradient(135deg, #FCA5A5, #EF4444)";

/**
 * Circular avatar with an initial and a colored gradient background. Mirrors
 * `<Avatar>` from hifi/tokens.jsx. Used for user profile slots in the TopBar
 * and assignee chips.
 */
export const Avatar = ({ name = "김", color, size = 26, className }: AvatarProps) => (
  <div
    className={cn(
      "rounded-full grid place-items-center flex-shrink-0 text-white font-semibold",
      "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]",
      className,
    )}
    style={{
      width: size,
      height: size,
      fontSize: size * 0.42,
      background: color ?? DEFAULT_GRADIENT,
    }}
  >
    {name}
  </div>
);

export default Avatar;

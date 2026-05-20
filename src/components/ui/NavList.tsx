import { cn } from "@app/lib/tailwind";
import { Icon } from "./Icon";

export interface NavListItem<T extends string = string> {
  id: T;
  label: string;
  /** Phosphor icon shown to the left of the label. */
  icon?: string;
  /** Optional count rendered in monospace on the right. */
  count?: number;
}

export interface NavListProps<T extends string = string> {
  items: NavListItem<T>[];
  /** Currently selected item id. Omit for read-only navs (count-only displays). */
  current?: T;
  onChange?: (next: T) => void;
  className?: string;
}

/**
 * Vertical nav list used in sidebars (Library collections, Detail metadata,
 * Wizard step jumps). Mirrors `<NavList>` from hifi/library.jsx.
 *
 * Active item: surface2 background, icon switches to `fill` weight tinted
 * with accent, label weight 550. Hover non-active item lifts onto the
 * `bg-hover` surface.
 */
export const NavList = <T extends string = string>({
  items,
  current,
  onChange,
  className,
}: NavListProps<T>) => (
  <div className={cn("flex flex-col gap-px", className)} role="list">
    {items.map((it) => {
      const on = it.id === current;
      return (
        <button
          key={it.id}
          type="button"
          role="listitem"
          onClick={() => onChange?.(it.id)}
          disabled={!onChange}
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-r1 cursor-pointer transition-colors duration-[100ms]",
            "focus-visible:outline-none focus-visible:shadow-accent-glow",
            on
              ? "bg-surface2 text-text font-[550]"
              : "bg-transparent text-text2 font-normal hover:bg-hover",
            !onChange && "cursor-default",
          )}
        >
          {it.icon && (
            <Icon
              name={it.icon}
              size={14}
              weight={on ? "fill" : "regular"}
              color={on ? "#0EA5E9" : "#6B7280"}
            />
          )}
          <span className="flex-1 text-[13px] text-left truncate">{it.label}</span>
          {it.count !== undefined && (
            <span className="text-[11px] text-muted font-mono">{it.count}</span>
          )}
        </button>
      );
    })}
  </div>
);

export default NavList;

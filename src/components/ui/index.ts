/**
 * Design system primitives barrel.
 *
 * Mirrors the components in `data/design_handoff_math_gen/hifi/tokens.jsx`.
 * Phase 2+ screens should import exclusively from `@app/components/ui` —
 * no direct file imports — so we can swap implementations centrally.
 */

export { Icon, type IconProps, type IconWeight } from "./Icon";
export { Btn, type BtnProps, type BtnKind, type BtnSize } from "./Button";
export { Chip, type ChipProps, type ChipTone, type ChipSize } from "./Chip";
export { Card, type CardProps } from "./Card";
export { Kbd, ModKey, type KbdProps } from "./Kbd";
export { Divider, type DividerProps } from "./Divider";

export { Input, type InputProps, type InputSize } from "./Input";
export { Toggle, type ToggleProps, type ToggleSize } from "./Toggle";
export {
  Segmented,
  type SegmentedProps,
  type SegmentedOption,
  type SegmentedSize,
} from "./Segmented";

export { TopBar, type TopBarProps } from "./TopBar";
export { Logo, type LogoProps } from "./Logo";
export { Avatar, type AvatarProps } from "./Avatar";
export { Heading, type HeadingProps, type HeadingLevel } from "./Heading";
export { Eyebrow, type EyebrowProps } from "./Eyebrow";
export { StatCard, type StatCardProps, type StatCardTone } from "./StatCard";
export { Progress, type ProgressProps, type ProgressTone } from "./Progress";
export { Backdrop, type BackdropProps } from "./Backdrop";
export { NavList, type NavListProps, type NavListItem } from "./NavList";

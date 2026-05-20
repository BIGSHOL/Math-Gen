import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines clsx (conditional class composition) with twMerge (Tailwind class
 * deduplication) — the standard `cn()` helper used across the design system.
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

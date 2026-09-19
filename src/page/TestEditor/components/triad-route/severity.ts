/**
 * One severity palette for the whole route editor.
 *
 * Error, warning and note appear on issue cards, on section headers, on the
 * stage pills and in the save gate, and a finding that is red in one place and
 * amber in another teaches the modder nothing. Every colour is a token pair so
 * both themes stay legible, and the accents stay inside the app's existing
 * destructive / amber / muted range rather than adding a fourth hue.
 */

import { AlertTriangle, Info, XCircle, type LucideIcon } from "lucide-react";
import type { IssueSeverity } from "@/services/triadRoute/types";

export interface SeverityStyle {
  icon: LucideIcon;
  /** Icon and heading colour. */
  text: string;
  /** Surface for a card carrying this severity. */
  surface: string;
  /** Compact badge, for headers and pills. */
  badge: string;
  /** Ring for a form field this severity is about. */
  field: string;
}

export const SEVERITY_STYLE: Readonly<Record<IssueSeverity, SeverityStyle>> = Object.freeze({
  error: {
    icon: XCircle,
    text: "text-destructive",
    surface: "border-destructive/35 bg-destructive/5",
    badge: "border-destructive/35 bg-destructive/10 text-destructive",
    field: "border-destructive focus-visible:ring-destructive/40",
  },
  warning: {
    icon: AlertTriangle,
    text: "text-amber-600 dark:text-amber-400",
    surface: "border-amber-500/35 bg-amber-500/5",
    badge: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    field: "border-amber-500 focus-visible:ring-amber-500/40",
  },
  info: {
    icon: Info,
    text: "text-muted-foreground",
    surface: "border-border bg-muted/30",
    badge: "border-border bg-muted text-muted-foreground",
    field: "border-border",
  },
});

/** Worst first: the order the panel groups and the summary counts read in. */
export const SEVERITY_ORDER: readonly IssueSeverity[] = Object.freeze([
  "error",
  "warning",
  "info",
] as const);

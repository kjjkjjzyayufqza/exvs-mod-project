/** Shared sizing and overflow rules for the Scene Editor properties panel. */
export const PROP_PANEL = "min-w-0 max-w-full overflow-x-hidden";
export const PROP_INPUT =
  "h-7 min-h-7 max-h-7 min-w-0 w-full text-[11px] font-mono px-2 bg-background/60";
export const PROP_BTN = "h-7 min-h-7 max-h-7 px-2 text-[11px] shrink-0";
export const PROP_BTN_ICON = "h-7 w-7 min-h-7 min-w-7 p-0 shrink-0";
export const PROP_LABEL =
  "text-[10px] font-medium text-muted-foreground uppercase tracking-wider";
export const PROP_ROW =
  "grid grid-cols-[minmax(4.5rem,auto)_minmax(0,1fr)] items-center gap-x-2 gap-y-0 min-w-0";
export const PROP_AXIS_GRID = "grid min-w-0 grid-cols-3 gap-1";

/** Maya channel-box style transform table: row label + X/Y/Z columns. */
export const MAYA_TRANSFORM_GRID =
  "grid min-w-0 w-full grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-1 gap-y-1 items-center [&>*]:min-w-0";
export const MAYA_AXIS_HEADER =
  "truncate text-center text-[9px] font-bold uppercase tracking-wide";
export const MAYA_AXIS_INPUT =
  "h-6 min-h-6 w-full min-w-0 rounded-sm border bg-muted/25 px-1 text-right text-[10px] font-mono tabular-nums outline-none transition-colors focus:bg-background focus:ring-1";
export const MAYA_ROW_LABEL =
  "truncate text-[10px] font-medium text-muted-foreground";

/** Unreal/Unity-style inspector row: pin, label, value, trailing actions. */
export const INSPECTOR_ROW =
  "group grid min-w-0 grid-cols-[1.125rem_minmax(0,1fr)_minmax(4.25rem,5.75rem)_auto] items-center gap-x-1.5 rounded-sm px-1 py-px transition-colors hover:bg-muted/25";
export const INSPECTOR_ROW_COLOR =
  "group grid min-w-0 grid-cols-[1.125rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-x-1.5 rounded-sm px-1 py-px transition-colors hover:bg-muted/25";
export const INSPECTOR_LABEL =
  "truncate text-[10px] text-foreground/90 leading-tight";
export const INSPECTOR_VALUE =
  "h-6 min-h-6 w-full min-w-0 rounded-sm border border-border/50 bg-muted/20 px-1.5 text-right text-[10px] font-mono tabular-nums outline-none transition-colors focus:border-primary/40 focus:bg-background focus:ring-1 focus:ring-primary/20";
export const INSPECTOR_SECTION =
  "min-w-0 overflow-hidden rounded-sm border border-border/45 bg-muted/10";
export const INSPECTOR_SECTION_HEADER =
  "flex w-full items-center gap-1.5 border-b border-border/35 bg-muted/25 px-2 py-1 text-left text-[10px] font-semibold tracking-wide text-muted-foreground hover:bg-muted/40";

/** Editor-only Phase 2 control-flow fragments. Not a shipped runtime feature. */

export const RESEARCH_ONLY_KINDS = [
  "planned_branch",
  "planned_loop",
  "planned_blackboard",
  "planned_subline",
] as const;

export const NOGO_KINDS = [
  "planned_nogo_row_3c",
  "planned_nogo_steal_802",
  "planned_nogo_event_kind",
] as const;

export const PLANNED_KINDS = [...RESEARCH_ONLY_KINDS, ...NOGO_KINDS] as const;

export type ResearchOnlyKind = (typeof RESEARCH_ONLY_KINDS)[number];
export type NoGoKind = (typeof NOGO_KINDS)[number];
export type PlannedKind = (typeof PLANNED_KINDS)[number];
export type PlannedVerdict = "research_only" | "nogo";

export interface PlannedCapability {
  kind: PlannedKind;
  verdict: PlannedVerdict;
  capability: "branch" | "loop" | "blackboard" | "subline" | "row_3c" | "steal_802" | "event_kind";
  blockedReason: string;
}

export const PLANNED_CAPABILITIES: Record<PlannedKind, PlannedCapability> = {
  planned_branch: {
    kind: "planned_branch",
    verdict: "research_only",
    capability: "branch",
    blockedReason: "true/false branch has no official false-path slot; compiler stays linear",
  },
  planned_loop: {
    kind: "planned_loop",
    verdict: "research_only",
    capability: "loop",
    blockedReason: "back-edge / global20 wraparound is unowned; compiler stays linear",
  },
  planned_blackboard: {
    kind: "planned_blackboard",
    verdict: "research_only",
    capability: "blackboard",
    blockedReason: "private 0x601 rows other than 0x3c are corpus-unused; not emitted as MSC",
  },
  planned_subline: {
    kind: "planned_subline",
    verdict: "research_only",
    capability: "subline",
    blockedReason: "a third self-ending 0x802 line is unprecedented; not emitted as MSC",
  },
  planned_nogo_row_3c: {
    kind: "planned_nogo_row_3c",
    verdict: "nogo",
    capability: "row_3c",
    blockedReason: "func_19 owns blackboard row 0x3c every live tick; authors cannot take it",
  },
  planned_nogo_steal_802: {
    kind: "planned_nogo_steal_802",
    verdict: "nogo",
    capability: "steal_802",
    blockedReason: "official 0x802 lines are the event fiber (0x9de) and respawn (0x97d) only",
  },
  planned_nogo_event_kind: {
    kind: "planned_nogo_event_kind",
    verdict: "nogo",
    capability: "event_kind",
    blockedReason: "author event nodes would starve func_15; extra kinds are not authorable",
  },
};

export const PLANNED_LABELS: Record<PlannedKind, string> = {
  planned_branch: "True/false branch",
  planned_loop: "Loop / back-edge",
  planned_blackboard: "Private 0x601 row",
  planned_subline: "Third 0x802 sub-line",
  planned_nogo_row_3c: "Blackboard row 0x3c",
  planned_nogo_steal_802: "Steal event/respawn 0x802",
  planned_nogo_event_kind: "Extra event kind",
};

export const PLANNED_DESCRIPTIONS: Record<PlannedKind, string> = {
  planned_branch: "Research-only sketch of a false successor. Does not compile.",
  planned_loop: "Research-only sketch of a back-edge. Does not compile.",
  planned_blackboard: "Research-only sketch of a private 0x601 cell other than row 0x3c. Does not compile.",
  planned_subline: "Research-only sketch of a third self-ending 0x802 line. Does not compile.",
  planned_nogo_row_3c: "No-Go: retreat helper func_19 rewrites row 0x3c every live tick.",
  planned_nogo_steal_802: "No-Go: replacing the official event or respawn 0x802 line is refused.",
  planned_nogo_event_kind: "No-Go: authoring extra event kinds would starve func_15.",
};

export function isPlannedKind(kind: string): kind is PlannedKind {
  return (PLANNED_KINDS as readonly string[]).includes(kind);
}

export function isResearchOnlyKind(kind: string): kind is ResearchOnlyKind {
  return (RESEARCH_ONLY_KINDS as readonly string[]).includes(kind);
}

export function isNoGoKind(kind: string): kind is NoGoKind {
  return (NOGO_KINDS as readonly string[]).includes(kind);
}

export function plannedCapability(kind: string): PlannedCapability | null {
  return isPlannedKind(kind) ? PLANNED_CAPABILITIES[kind] : null;
}

export function plannedCompileMessage(label: string, kind: string): string {
  const capability = plannedCapability(kind);
  if (!capability) return `${label}: TODO planned control-flow cannot compile`;
  if (capability.verdict === "nogo") {
    return `${label}: TODO No-Go — ${capability.blockedReason}`;
  }
  return `${label}: TODO planned control-flow cannot compile (${capability.capability}; research only, source-unverified)`;
}

/**
 * Scrolling a section into view when the checks panel points at it.
 *
 * A finding addressed to `stage.2.briefing` is only useful if the modder can
 * get there; clicking it scrolls the section up and flashes its outline once
 * so the eye lands in the right place. The flash is short and uses opacity and
 * a ring rather than layout, so nothing reflows while it plays.
 */

import { useEffect, useRef, useState } from "react";
import type { IssueSection } from "@/services/triadRoute/issueLocation";
import { parseIssueLocation } from "@/services/triadRoute/issueLocation";

/**
 * A request to reveal one issue location.
 *
 * `token` changes on every request so clicking the same finding twice replays
 * the flash instead of doing nothing.
 */
export interface IssueFocusRequest {
  location: string;
  token: number;
}

const FLASH_MS = 1100;

/**
 * Attach to a section so it reveals itself when `request` names it.
 *
 * Returns the ref to spread onto the section element and whether the flash is
 * currently playing.
 */
export function useIssueFocus(
  section: IssueSection,
  request: IssueFocusRequest | null,
  stage?: number,
): { ref: React.RefObject<HTMLElement | null>; isFlashing: boolean } {
  const ref = useRef<HTMLElement | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    if (!request) return;
    const target = parseIssueLocation(request.location);
    if (target.section !== section) return;
    if (stage !== undefined && target.stage !== stage) return;

    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setIsFlashing(true);
    const timer = window.setTimeout(() => setIsFlashing(false), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [request, section, stage]);

  return { ref, isFlashing };
}

/** Ring applied while a section is flashing. Opacity and ring only. */
export const FOCUS_FLASH_CLASS =
  "ring-2 ring-primary/70 ring-offset-2 ring-offset-background";

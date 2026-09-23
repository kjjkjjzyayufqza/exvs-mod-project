/**
 * Helpers for filling the missing stages of an A-E course.
 *
 * F-class courses play one stage and are left alone. Names follow the first
 * stage's official scene name so the new fights stay in the same course number.
 */

import { nextFreeSceneNumber } from "@/services/triadRoute/routeDraft";
import {
  MAX_STAGES_PER_COURSE,
  type CreatedScene,
  type BriefingDraft,
  type StageDraft,
  type TriadRouteDocument,
} from "@/services/triadRoute/types";
import { officialSceneName, parseTriadSceneName } from "./sceneNames";

/** Category 6 is F: one stage, no extend control. */
export const CATEGORY_F = 6;

export function canExtendStages(category: number, stageCount: number): boolean {
  return category !== CATEGORY_F && stageCount >= 1 && stageCount < MAX_STAGES_PER_COURSE;
}

/** 1-based stage indexes this A-E course still needs. */
export function missingStageIndexes(stageCount: number, category: number): number[] {
  if (!canExtendStages(category, stageCount)) return [];
  const missing: number[] = [];
  for (let index = stageCount + 1; index <= MAX_STAGES_PER_COURSE; index += 1) {
    missing.push(index);
  }
  return missing;
}

export function defaultSceneNameForSlot(draft: TriadRouteDocument, stageIndex: number): string {
  const first = draft.stages.find((stage) => stage.index === 1) ?? draft.stages[0];
  const parsed = parseTriadSceneName(first?.sceneName);
  if (parsed) {
    const category = parsed.letter.charCodeAt(0) - "a".charCodeAt(0) + 1;
    return officialSceneName(category, parsed.courseNumber, stageIndex);
  }
  return officialSceneName(draft.course.category, draft.course.numberInCategory, stageIndex);
}

export function defaultSceneNumberForSlot(
  draft: TriadRouteDocument,
  stageIndex: number,
  usedSceneNumbers: number[],
): number {
  const first = draft.stages.find((stage) => stage.index === 1) ?? draft.stages[0];
  const preferred = (first?.sceneNo ?? 0) + (stageIndex - 1);
  if (preferred > 0 && !usedSceneNumbers.includes(preferred)) return preferred;
  return nextFreeSceneNumber(usedSceneNumbers, Math.max(1, preferred));
}

export type ClonedStageAddition = {
  index: number;
  created: CreatedScene;
  briefing: BriefingDraft;
  sceneNo: number;
};

/**
 * Append freshly cloned scenes onto an open course.
 *
 * Indexes are the course slots (2, 3). Existing stages are not reordered.
 */
export function appendClonedStages(
  draft: TriadRouteDocument,
  additions: ClonedStageAddition[],
): TriadRouteDocument {
  if (additions.length < 1) {
    throw new Error("at least one stage to add is required");
  }
  const used = new Set(draft.stages.map((stage) => stage.index));
  const extra: StageDraft[] = additions.map((addition) => {
    if (addition.index < 1 || addition.index > MAX_STAGES_PER_COURSE) {
      throw new Error(`stage index must be 1..=${MAX_STAGES_PER_COURSE}, got ${addition.index}`);
    }
    if (used.has(addition.index)) {
      throw new Error(`stage ${addition.index} is already on this course`);
    }
    used.add(addition.index);
    return {
      index: addition.index,
      sceneKey: addition.created.sceneKey,
      sceneName: addition.created.sceneName,
      sceneNo: addition.sceneNo,
      scriptPackageHash: addition.created.packageHash,
      briefing: addition.briefing,
      script: null,
      origin: "cloned",
    };
  });
  if (used.size > MAX_STAGES_PER_COURSE) {
    throw new Error(`a course plays at most ${MAX_STAGES_PER_COURSE} stages`);
  }
  return {
    ...draft,
    stages: [...draft.stages, ...extra].sort((a, b) => a.index - b.index),
  };
}

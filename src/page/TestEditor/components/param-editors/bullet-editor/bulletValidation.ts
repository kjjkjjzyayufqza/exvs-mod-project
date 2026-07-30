/**
 * Pure validation helpers for bulletparam entries.
 *
 * RE-verified constraints (see src/lib/gameAlgorithms/moveTypes.ts):
 *   - moveType uses values 0-7 and 255. The 513-595 range from the original
 *     plan is invalidated by IDA analysis: those are entity command IDs
 *     dispatched by sub_14043C200, not moveType values.
 *   - No initial_speed engine clamp is substantiated in
 *     docs/agent-sessions/param-editor-rewrite/process.md ("max 640" only
 *     appears in the outdated plan), so no speed limit message is emitted.
 */

import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { ValidationMessage } from "../shared/types";
import {
  MOVE_TYPE_DEFINITIONS,
  getMoveTypeDefinition,
} from "@/lib/gameAlgorithms/moveTypes";

const RE_VERIFIED_MOVE_TYPE_IDS = MOVE_TYPE_DEFINITIONS.map((d) => d.id).join(
  ", ",
);

export function validateBulletEntry(
  entry: TypedParamEntry,
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];

  if (typeof entry.moveType !== "number") {
    messages.push({
      field: "moveType",
      level: "warning",
      message: "moveType field is missing or non-numeric",
    });
  } else {
    const moveType = Math.trunc(entry.moveType);
    if (!getMoveTypeDefinition(moveType)) {
      messages.push({
        field: "moveType",
        level: "warning",
        message: `Unknown move type ${moveType} (RE-verified values: ${RE_VERIFIED_MOVE_TYPE_IDS})`,
      });
    }
  }

  const lifetime = typeof entry.lifetime === "number" ? entry.lifetime : 0;
  if (lifetime < 0) {
    messages.push({
      field: "lifetime",
      level: "info",
      message: "Negative lifetime = absolute duration mode",
    });
  }

  return messages;
}

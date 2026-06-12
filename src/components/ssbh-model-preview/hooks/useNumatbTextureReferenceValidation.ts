import { useEffect, useMemo, useRef, useState } from "react";
import { sceneValidateImportTextureRefs } from "@/page/SceneEdit/utils/sceneSessionService";
import type { MissingTexturePathSlotRef } from "../store/numatbTemplateStoreHelpers";

export type NumatbTextureReferenceIssue = {
  slot: MissingTexturePathSlotRef;
  message: string;
};

type ValidationState = {
  signature: string;
  validating: boolean;
  issues: NumatbTextureReferenceIssue[];
  error: string | null;
};

function normalizeReference(value: string): string {
  return value.trim().replace(/\.nutexb$/i, "").toLowerCase();
}

export function mapUnresolvedTextureReferenceIssues(
  slots: MissingTexturePathSlotRef[],
  unresolvedReferences: readonly string[],
): NumatbTextureReferenceIssue[] {
  const unresolved = new Set(unresolvedReferences.map(normalizeReference));
  return slots
    .filter((slot) => slot.value.trim() && unresolved.has(normalizeReference(slot.value)))
    .map((slot) => {
      const value = slot.value.trim();
      return {
        slot,
        message: `Not found: ${/\.nutexb$/i.test(value) ? value : `${value}.nutexb`}`,
      };
    });
}

export function useNumatbTextureReferenceValidation(options: {
  enabled: boolean;
  sourcePath: string | null;
  stageRoot: string | null;
  slots: MissingTexturePathSlotRef[];
}) {
  const requestIdRef = useRef(0);
  const references = useMemo(
    () =>
      Array.from(
        new Map(
          options.slots
            .map((slot) => slot.value.trim())
            .filter(Boolean)
            .map((reference) => [normalizeReference(reference), reference]),
        ).values(),
      ),
    [options.slots],
  );
  const signature = useMemo(
    () =>
      JSON.stringify({
        enabled: options.enabled,
        sourcePath: options.sourcePath,
        stageRoot: options.stageRoot,
        references,
      }),
    [options.enabled, options.sourcePath, options.stageRoot, references],
  );
  const [state, setState] = useState<ValidationState>({
    signature: "",
    validating: false,
    issues: [],
    error: null,
  });

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!options.enabled || references.length === 0) {
      setState({
        signature,
        validating: false,
        issues: [],
        error: null,
      });
      return;
    }

    setState({
      signature,
      validating: true,
      issues: [],
      error: null,
    });
    void sceneValidateImportTextureRefs({
      sourcePath: options.sourcePath,
      stageRoot: options.stageRoot,
      references,
    })
      .then((result) => {
        if (requestIdRef.current !== requestId) return;
        setState({
          signature,
          validating: false,
          issues: mapUnresolvedTextureReferenceIssues(
            options.slots,
            result.unresolvedReferences,
          ),
          error: null,
        });
      })
      .catch((error) => {
        if (requestIdRef.current !== requestId) return;
        setState({
          signature,
          validating: false,
          issues: [],
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, [
    options.enabled,
    options.slots,
    options.sourcePath,
    options.stageRoot,
    references,
    signature,
  ]);

  const current = state.signature === signature;
  return {
    validating: options.enabled && references.length > 0 && (!current || state.validating),
    issues: current ? state.issues : [],
    error: current ? state.error : null,
  };
}

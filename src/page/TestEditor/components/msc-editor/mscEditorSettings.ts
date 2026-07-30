/**
 * Persisted MSC workspace settings.
 *
 * Uses localStorage with an `exvs2.*` key, the same mechanism as the
 * Blender path override (`exvs2.blender51Path`) and dialog last-path memory.
 */

const MSC_EXTERNAL_EDITOR_STORAGE_KEY = "exvs2.mscExternalEditorCommand";

export const DEFAULT_MSC_EXTERNAL_EDITOR_COMMAND = "cursor";

/** Configured external editor command, falling back to the default command. */
export function getMscExternalEditorCommand(): string {
  try {
    const value = localStorage.getItem(MSC_EXTERNAL_EDITOR_STORAGE_KEY)?.trim() ?? "";
    return value.length > 0 ? value : DEFAULT_MSC_EXTERNAL_EDITOR_COMMAND;
  } catch {
    return DEFAULT_MSC_EXTERNAL_EDITOR_COMMAND;
  }
}

/** Persist the external editor command; empty/null clears back to the default. */
export function setMscExternalEditorCommand(command: string | null): void {
  try {
    const trimmed = command?.trim() ?? "";
    if (trimmed.length === 0) {
      localStorage.removeItem(MSC_EXTERNAL_EDITOR_STORAGE_KEY);
      return;
    }
    localStorage.setItem(MSC_EXTERNAL_EDITOR_STORAGE_KEY, trimmed);
  } catch {
    // localStorage may be unavailable in some test environments
  }
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;

  const editableMode = target.contentEditable;
  if (editableMode === "true" || editableMode === "plaintext-only") return true;
  if (target.isContentEditable) return true;

  return Boolean(target.closest("[contenteditable=''], [contenteditable='true']"));
}

export function hasNativeTextSelection(): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return false;
  return selection.toString().length > 0;
}

export function shouldHandleSceneCopy(selectedCount: number, target: EventTarget | null): boolean {
  if (isEditableKeyboardTarget(target)) return false;
  if (hasNativeTextSelection()) return false;
  return selectedCount > 0;
}

export function shouldHandleScenePaste(sceneClipboardCount: number, target: EventTarget | null): boolean {
  if (isEditableKeyboardTarget(target)) return false;
  return sceneClipboardCount > 0;
}

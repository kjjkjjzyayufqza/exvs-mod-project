import type { ComponentPropsWithoutRef, MouseEvent } from "react";

import { cn } from "@/lib/utils";
import { ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu";

type ContextMenuContentProps = ComponentPropsWithoutRef<typeof ContextMenuContent>;
type ContextMenuItemProps = ComponentPropsWithoutRef<typeof ContextMenuItem>;

/** Shared with TestEditor file tree and Scene / Unit Model outliner lists. */
export const editorContextMenuContentClassName = "min-w-[11rem] max-w-[20rem]";

export const editorContextMenuItemClassName = "flex items-center gap-2";

export const editorContextMenuIconClassName = "h-4 w-4 shrink-0";

export function EditorContextMenuContent({
  className,
  ...props
}: ContextMenuContentProps) {
  return (
    <ContextMenuContent
      className={cn(editorContextMenuContentClassName, className)}
      {...props}
    />
  );
}

export function EditorContextMenuItem({
  className,
  ...props
}: ContextMenuItemProps & { inset?: boolean }) {
  return (
    <ContextMenuItem
      className={cn(editorContextMenuItemClassName, className)}
      {...props}
    />
  );
}

/** Prevents a nested row menu from bubbling to a parent list background menu. */
export function stopEditorContextMenuBubble(event: MouseEvent): void {
  event.stopPropagation();
}

import { useTranslation } from "react-i18next";
import {
  Download,
  ExternalLink,
  FileBox,
  LayoutTemplate,
  Loader2,
  Replace,
  Trash2,
} from "lucide-react";

import { CopyInfoToAiButton } from "@/components/CopyInfoToAiButton";
import { Button } from "@/components/ui/button";
import {
  EditorContextMenuContent,
  EditorContextMenuItem,
  editorContextMenuIconClassName,
  stopEditorContextMenuBubble,
} from "@/components/editor/EditorContextMenu";
import { ContextMenu, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

import type { UnitModelTreeNode } from "../utils/unitModelStructureTree";

export type UnitModelModelListRowModel = {
  node: UnitModelTreeNode;
  label: string;
  fileTypes: string[];
};

type UnitModelModelListRowProps = {
  model: UnitModelModelListRowModel;
  modelIndex: number;
  isSelected: boolean;
  busy: string | null;
  canMutate: boolean;
  structureJsonPath?: string | null;
  onSelectModel?: (model: UnitModelTreeNode) => void;
  onExportModel?: (modelLabel: string) => void;
  onRevealModel?: (model: UnitModelTreeNode) => void;
  onCreateNumatbTemplate: (model: UnitModelModelListRowModel) => void;
  onOpenReplace: (label: string, index: number) => void;
  onRequestRemove: (label: string) => void;
};

export function UnitModelModelListRow({
  model,
  modelIndex,
  isSelected,
  busy,
  canMutate,
  structureJsonPath,
  onSelectModel,
  onExportModel,
  onRevealModel,
  onCreateNumatbTemplate,
  onOpenReplace,
  onRequestRemove,
}: UnitModelModelListRowProps) {
  const { t } = useTranslation("unit-inspector-manager");
  const replaceBusy = busy === `replace:${model.label}`;
  const removeBusy = busy === `remove:${model.label}`;
  const templateBusy = busy === `template:${model.label}`;
  const anyRowBusy = busy !== null;

  const row = (
    <li
      className={cn(
        "group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/60",
        isSelected && "bg-primary/10",
      )}
      onContextMenu={stopEditorContextMenuBubble}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={() => onSelectModel?.(model.node)}
      >
        <FileBox
          className={cn("h-4 w-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium leading-5">{model.label}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {model.fileTypes.join(" ") || t("manager.noDirectFiles")}
          </p>
        </div>
      </button>
      <CopyInfoToAiButton
        size="icon"
        variant="ghost"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        label={t("manager.copyModelInfoToAi", { name: model.label })}
        buildPayload={() => ({
          kind: "unit-model",
          scope: `model:${model.label}`,
          note: structureJsonPath ? `from ${structureJsonPath}` : undefined,
          data: model.node,
        })}
      />
      {onExportModel ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground opacity-0 transition-colors hover:text-primary group-hover:opacity-100 focus-visible:opacity-100"
          disabled={anyRowBusy}
          onClick={() => onExportModel(model.label)}
          title={t("manager.exportModel", { name: model.label })}
          aria-label={t("manager.exportModel", { name: model.label })}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
        </Button>
      ) : null}
      {structureJsonPath ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground opacity-0 transition-colors hover:text-primary group-hover:opacity-100 focus-visible:opacity-100"
          disabled={anyRowBusy}
          onClick={() => void onCreateNumatbTemplate(model)}
          title={t("manager.createNumatbTitle", { name: model.label })}
          aria-label={t("manager.createNumatbAria", { name: model.label })}
        >
          {templateBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
          )}
        </Button>
      ) : null}
      {canMutate ? (
        <>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground opacity-0 transition-colors hover:text-primary group-hover:opacity-100 focus-visible:opacity-100"
            disabled={anyRowBusy}
            onClick={() => onOpenReplace(model.label, modelIndex)}
            title={t("manager.replaceModel", { name: model.label })}
            aria-label={t("manager.replaceModel", { name: model.label })}
          >
            {replaceBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Replace className="h-3.5 w-3.5" aria-hidden />
            )}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground opacity-0 transition-colors hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100 dark:hover:text-red-400"
            disabled={anyRowBusy}
            onClick={() => onRequestRemove(model.label)}
            title={t("manager.removeModel", { name: model.label })}
            aria-label={t("manager.removeModel", { name: model.label })}
          >
            {removeBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            )}
          </Button>
        </>
      ) : null}
    </li>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <EditorContextMenuContent>
        {onSelectModel ? (
          <EditorContextMenuItem onSelect={() => onSelectModel(model.node)}>
            <FileBox className={editorContextMenuIconClassName} />
            <span>{t("manager.contextMenu.select")}</span>
          </EditorContextMenuItem>
        ) : null}
        {onRevealModel ? (
          <EditorContextMenuItem onSelect={() => onRevealModel(model.node)}>
            <ExternalLink className={editorContextMenuIconClassName} />
            <span>{t("manager.contextMenu.reveal")}</span>
          </EditorContextMenuItem>
        ) : null}
        {(onSelectModel || onRevealModel) && (onExportModel || structureJsonPath || canMutate) ? (
          <ContextMenuSeparator />
        ) : null}
        {onExportModel ? (
          <EditorContextMenuItem
            disabled={anyRowBusy}
            onSelect={() => onExportModel(model.label)}
          >
            <Download className={editorContextMenuIconClassName} />
            <span>{t("manager.contextMenu.export")}</span>
          </EditorContextMenuItem>
        ) : null}
        {structureJsonPath ? (
          <EditorContextMenuItem
            disabled={anyRowBusy}
            onSelect={() => void onCreateNumatbTemplate(model)}
          >
            <LayoutTemplate className={editorContextMenuIconClassName} />
            <span>{t("manager.contextMenu.numatbTemplate")}</span>
          </EditorContextMenuItem>
        ) : null}
        {canMutate ? (
          <>
            <EditorContextMenuItem
              disabled={anyRowBusy}
              onSelect={() => onOpenReplace(model.label, modelIndex)}
            >
              <Replace className={editorContextMenuIconClassName} />
              <span>{t("manager.contextMenu.replace")}</span>
            </EditorContextMenuItem>
            <ContextMenuSeparator />
            <EditorContextMenuItem
              className="text-destructive focus:text-destructive"
              disabled={anyRowBusy}
              onSelect={() => onRequestRemove(model.label)}
            >
              <Trash2 className={editorContextMenuIconClassName} />
              <span>{t("manager.contextMenu.remove")}</span>
            </EditorContextMenuItem>
          </>
        ) : null}
      </EditorContextMenuContent>
    </ContextMenu>
  );
}

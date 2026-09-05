import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Save, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { UseTestEditorWorkspaceResult } from "@/hooks/useTestEditorWorkspace";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import { parseWorkspaceDocument } from "@/services/testEditorWorkspace/validation";
import { WorkspaceRouteTable } from "./WorkspaceRouteTable";

interface WorkspaceLayoutDialogProps {
  open: boolean;
  controller: UseTestEditorWorkspaceResult;
  onOpenChange: (open: boolean) => void;
}

function cloneDocument(document: TestEditorWorkspaceDocument): TestEditorWorkspaceDocument {
  return parseWorkspaceDocument(document).document;
}

export function WorkspaceLayoutDialog({
  open,
  controller,
  onOpenChange,
}: WorkspaceLayoutDialogProps) {
  const { t } = useTranslation("test-workspace");
  const [draft, setDraft] = useState<TestEditorWorkspaceDocument>(() =>
    cloneDocument(controller.document),
  );

  useEffect(() => {
    if (!open) return;
    setDraft(cloneDocument(controller.document));
  }, [controller.document, open]);

  const parsedDraft = useMemo(() => parseWorkspaceDocument(draft), [draft]);
  const canSave = parsedDraft.issues.length === 0 && !controller.isLoading && !controller.isSaving;

  const handlePrefixChange = useCallback((routeId: string, prefix: string) => {
    setDraft((prev) => {
      const route = prev.assetRoutes[routeId];
      if (!route) return prev;
      return {
        ...prev,
        assetRoutes: {
          ...prev.assetRoutes,
          [routeId]: {
            ...route,
            prefix,
          },
        },
      };
    });
  }, []);

  const handleResetRoute = useCallback((routeId: string) => {
    const defaultRoute = DEFAULT_TEST_EDITOR_WORKSPACE.assetRoutes[routeId];
    if (!defaultRoute) return;
    setDraft((prev) => ({
      ...prev,
      assetRoutes: {
        ...prev.assetRoutes,
        [routeId]: { ...defaultRoute },
      },
    }));
  }, []);

  const handleLegacyFallbackChange = useCallback((checked: boolean) => {
    setDraft((prev) => ({
      ...prev,
      legacyReadFallback: checked,
    }));
  }, []);

  const handleReload = useCallback(async () => {
    await controller.reload();
  }, [controller]);

  const handleSave = useCallback(async () => {
    const parsed = parseWorkspaceDocument(draft);
    if (parsed.issues.length > 0) return;
    await controller.save(parsed.document);
    onOpenChange(false);
  }, [controller, draft, onOpenChange]);

  if (!open) {
    return null;
  }

  return (
    <AppRndModalShell
      title={t("layout.title")}
      subtitle={controller.workspaceRoot || t("layout.noWorkspace")}
      titleId="workspace-layout-title"
      headerIcon={<Settings2 className="h-4 w-4 text-primary" />}
      dimensions={{ width: 860, height: 620, minWidth: 680, minHeight: 460 }}
      storageKey="test-editor-workspace-layout-dialog"
      onClose={() => onOpenChange(false)}
      closeDisabled={controller.isSaving}
      footer={
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <Switch
              id="workspace-layout-legacy-fallback"
              checked={draft.legacyReadFallback}
              onCheckedChange={handleLegacyFallbackChange}
            />
            <Label htmlFor="workspace-layout-legacy-fallback" className="text-xs">
              {t("layout.legacyFallback")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReload}
              disabled={controller.isLoading || controller.isSaving}
            >
              <RefreshCw className={`h-4 w-4 ${controller.isLoading ? "animate-spin" : ""}`} />
              {t("layout.reload")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!canSave}
              aria-label={t("layout.saveLayout")}
            >
              <Save className="h-4 w-4" />
              {t("layout.saveLayout")}
            </Button>
          </div>
        </div>
      }
    >
      <WorkspaceRouteTable
        document={draft}
        issues={parsedDraft.issues}
        onPrefixChange={handlePrefixChange}
        onResetRoute={handleResetRoute}
      />
    </AppRndModalShell>
  );
}

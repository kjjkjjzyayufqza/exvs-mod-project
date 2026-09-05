import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import type {
  TestEditorWorkspaceDocument,
  WorkspaceValidationIssue,
} from "@/services/testEditorWorkspace/types";

interface WorkspaceRouteTableProps {
  document: TestEditorWorkspaceDocument;
  issues: WorkspaceValidationIssue[];
  onPrefixChange: (routeId: string, prefix: string) => void;
  onResetRoute: (routeId: string) => void;
}

function issueForRoute(issues: WorkspaceValidationIssue[], routeId: string): string | null {
  return issues.find((issue) => issue.routeId === routeId)?.message ?? null;
}

export function WorkspaceRouteTable({
  document,
  issues,
  onPrefixChange,
  onResetRoute,
}: WorkspaceRouteTableProps) {
  const { t } = useTranslation("test-workspace");
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="grid min-w-[720px] grid-cols-[minmax(170px,1fr)_minmax(160px,1fr)_minmax(240px,1.4fr)_44px] border-b bg-muted/40 px-4 py-2 text-[11px] font-medium uppercase text-muted-foreground">
        <div>{t("layout.route")}</div>
        <div data-i18n-ignore="">ID</div>
        <div>{t("layout.prefix")}</div>
        <div />
      </div>

      <div className="divide-y">
        {Object.entries(document.assetRoutes).map(([routeId, route]) => {
          const routeIssue = issueForRoute(issues, routeId);
          const defaultRoute = DEFAULT_TEST_EDITOR_WORKSPACE.assetRoutes[routeId];
          const inputId = `workspace-route-${routeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
          return (
            <div
              key={routeId}
              className="grid min-w-[720px] grid-cols-[minmax(170px,1fr)_minmax(160px,1fr)_minmax(240px,1.4fr)_44px] items-center gap-3 px-4 py-2"
            >
              <div className="min-w-0">
                <Label htmlFor={inputId} className="block truncate text-xs">
                  {route.label}
                </Label>
                <div className="mt-1 text-[11px] text-muted-foreground" data-i18n-ignore="">
                  {route.kind}
                </div>
              </div>
              <div className="truncate font-mono text-[11px] text-muted-foreground" data-i18n-ignore="">
                {routeId}
              </div>
              <div className="min-w-0">
                <Input
                  id={inputId}
                  aria-label={t("layout.prefixAria", { name: route.label })}
                  value={route.prefix}
                  onChange={(event) => onPrefixChange(routeId, event.target.value)}
                  aria-invalid={routeIssue ? true : undefined}
                  className="h-8 font-mono text-xs"
                />
                {routeIssue ? (
                  <div className="mt-1 truncate text-[11px] text-destructive" data-i18n-ignore="">
                    {routeIssue}
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onResetRoute(routeId)}
                disabled={!defaultRoute}
                aria-label={t("layout.resetPrefix", { name: route.label })}
                title={t("layout.resetPrefix", { name: route.label })}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

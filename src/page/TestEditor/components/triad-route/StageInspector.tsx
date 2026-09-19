import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, FileCode, FileSearch, FolderOpen, Info, Layers, PackageOpen } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SquadLineup } from "@/services/triadRoute/routeDraft";
import {
  issuesForSection,
  issuesForStage,
  worstSeverity,
} from "@/services/triadRoute/issueLocation";
import {
  formatHash,
  type PilotNameEntry,
  type StageDraft,
  type ValidationIssue,
} from "@/services/triadRoute/types";
import { BriefingEditor } from "./BriefingEditor";
import { SectionHeader } from "./SectionHeader";
import { SlotTableEditor } from "./SlotTableEditor";
import { SquadBuilder } from "./SquadBuilder";
import { FOCUS_FLASH_CLASS, useIssueFocus, type IssueFocusRequest } from "./issueFocus";
import { SEVERITY_STYLE } from "./severity";
import type { UnitNameMap } from "./triadRouteWorkspace";

type StageInspectorProps = {
  stage: StageDraft;
  stages: StageDraft[];
  units: UnitNameMap;
  pilots: PilotNameEntry[];
  issues: ValidationIssue[];
  focus: IssueFocusRequest | null;
  disabled?: boolean;
  onSelectStage: (index: number) => void;
  onChangeStage: (stage: StageDraft) => void;
  onGenerateLineup: (lineup: SquadLineup) => void;
  /** Unpacked mission-script folder, e.g. `…/051mission/000triad_battle_a001_001`. */
  scriptFolder?: string | null;
  scriptFolderExists?: boolean;
  onOpenScriptFolder?: (path: string) => void;
  onRevealScriptFolder?: (path: string) => void;
  onOpenScriptInMsc?: (path: string) => void;
  /** @deprecated Use onOpenScriptInMsc; kept so Fast Refresh cannot drop the binding. */
  onOpenScript?: (packageHash: number) => void;
  /** Why this stage's script could not be read, when it could not. */
  scriptError?: string | null;
  isReadingScript?: boolean;
  onReadScript?: () => void;
  onExtractScript?: () => void;
};

/** One stage: its identity, the fight it runs and the briefing it shows. */
export function StageInspector({
  stage,
  stages,
  units,
  pilots,
  issues,
  focus,
  disabled,
  onSelectStage,
  onChangeStage,
  onGenerateLineup,
  scriptFolder,
  scriptFolderExists,
  onOpenScriptFolder,
  onRevealScriptFolder,
  onOpenScriptInMsc,
  onOpenScript,
  scriptError,
  isReadingScript,
  onReadScript,
  onExtractScript,
}: StageInspectorProps) {
  const { t } = useTranslation("test-triad-route");
  const { ref, isFlashing } = useIssueFocus("stage", focus, stage.index);
  const layoutIssues = useMemo(() => issuesForSection(issues, "stages"), [issues]);
  const stageIssues = useMemo(() => issuesForStage(issues, stage.index), [issues, stage.index]);
  const [confirmReextract, setConfirmReextract] = useState(false);

  const requestExtract = () => {
    if (!onExtractScript) return;
    if (scriptFolderExists) {
      setConfirmReextract(true);
      return;
    }
    onExtractScript();
  };

  return (
    <section className="flex flex-col gap-3">
      <nav className="flex flex-wrap items-center gap-1.5" aria-label={t("stages.title")}>
        {stages.map((entry) => {
          const severity = worstSeverity(issuesForStage(issues, entry.index));
          const isActive = entry.index === stage.index;
          return (
            <button
              key={entry.index}
              type="button"
              aria-current={isActive ? "true" : undefined}
              onClick={() => onSelectStage(entry.index)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium",
                "transition-[background-color,border-color,color,transform] duration-150 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "active:translate-y-px",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {t("stages.stage", { index: entry.index })}
              {severity ? (
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    severity === "error"
                      ? "bg-destructive"
                      : severity === "warning"
                        ? "bg-amber-500"
                        : "bg-muted-foreground/50",
                    isActive && "ring-1 ring-primary-foreground/60",
                  )}
                />
              ) : null}
            </button>
          );
        })}
        {layoutIssues.length > 0 ? (
          <span
            className={cn(
              "ml-1 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium",
              SEVERITY_STYLE[worstSeverity(layoutIssues) ?? "info"].badge,
            )}
          >
            {t("stages.layoutIssues", { count: layoutIssues.length })}
          </span>
        ) : null}
      </nav>

      <div
        ref={ref as React.RefObject<HTMLDivElement>}
        className={cn(
          "flex scroll-mt-4 flex-col gap-3 rounded-lg border bg-card/40 p-3",
          "transition-[box-shadow] duration-300 ease-out",
          isFlashing && FOCUS_FLASH_CLASS,
        )}
      >
        <SectionHeader
          icon={Layers}
          title={t("stages.identityTitle", { index: stage.index })}
          description={stage.sceneName ?? t("stages.identityUnnamed")}
          issues={stageIssues}
        />

        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">{t("stages.sceneKey")}</Label>
            <Input readOnly value={formatHash(stage.sceneKey)} className="h-9 font-mono tabular-nums" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">{t("stages.sceneNumber")}</Label>
            <Input
              type="number"
              min={1}
              value={stage.sceneNo}
              disabled={disabled}
              className="h-9 tabular-nums"
              onChange={(event) =>
                onChangeStage({ ...stage, sceneNo: Number(event.target.value) || 0 })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">{t("stages.scriptPackage")}</Label>
            <Input
              readOnly
              value={formatHash(stage.scriptPackageHash)}
              className="h-9 font-mono tabular-nums"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">{t("stages.scriptFolder")}</Label>
          {scriptFolder ? (
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <Input
                readOnly
                value={scriptFolder}
                title={scriptFolder}
                className="h-9 min-w-0 font-mono text-[11px]"
              />
              <div className="flex shrink-0 flex-wrap gap-2">
                {onExtractScript ? (
                  <Button
                    type="button"
                    variant={scriptFolderExists ? "outline" : "secondary"}
                    size="sm"
                    className="h-9"
                    disabled={disabled || isReadingScript}
                    title={
                      scriptFolderExists ? t("stages.reextractScript") : t("stages.extractScript")
                    }
                    onClick={requestExtract}
                  >
                    <PackageOpen className="mr-1.5 size-3.5" />
                    {scriptFolderExists ? t("stages.reextractScript") : t("stages.extractScript")}
                  </Button>
                ) : null}
                {onOpenScriptFolder ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0"
                    disabled={!scriptFolderExists}
                    title={t("stages.openScriptFolder")}
                    aria-label={t("stages.openScriptFolder")}
                    onClick={() => onOpenScriptFolder(scriptFolder)}
                  >
                    <FolderOpen className="size-4" />
                  </Button>
                ) : null}
                {onRevealScriptFolder ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0"
                    disabled={!scriptFolderExists}
                    title={t("stages.revealScriptFolder")}
                    aria-label={t("stages.revealScriptFolder")}
                    onClick={() => onRevealScriptFolder(scriptFolder)}
                  >
                    <ExternalLink className="size-4" />
                  </Button>
                ) : null}
                {onOpenScriptInMsc || onOpenScript ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0"
                    disabled={!scriptFolderExists}
                    title={t("stages.openScript")}
                    aria-label={t("stages.openScript")}
                    onClick={() => {
                      if (onOpenScriptInMsc) {
                        onOpenScriptInMsc(scriptFolder);
                        return;
                      }
                      onOpenScript?.(stage.scriptPackageHash);
                    }}
                  >
                    <FileCode className="size-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground" style={{ textWrap: "pretty" }}>
              {t("stages.scriptFolderUnknown")}
            </p>
          )}
          {scriptFolder ? (
            <p
              className={cn(
                "text-[11px]",
                scriptFolderExists ? "text-muted-foreground" : "text-destructive",
              )}
            >
              {scriptFolderExists ? t("stages.scriptFolderUnpacked") : t("stages.scriptFolderMissing")}
            </p>
          ) : null}
        </div>
      </div>

      <SquadReplace
        units={units}
        currentMapHash={stage.briefing.mapHash}
        currentTimeLimit={stage.briefing.timeLimitSeconds}
        disabled={disabled}
        onGenerate={onGenerateLineup}
      />

      {stage.script ? (
        <SlotTableEditor
          slots={stage.script.slots}
          units={units}
          pilots={pilots}
          issues={stageIssues}
          disabled={disabled}
          onChange={(slots) =>
            onChangeStage({
              ...stage,
              script: stage.script ? { ...stage.script, slots } : null,
            })
          }
        />
      ) : (
        <ScriptNotice
          isReadingScript={isReadingScript}
          scriptError={scriptError}
          onReadScript={onReadScript}
          onExtractScript={scriptFolder ? undefined : onExtractScript}
        />
      )}

      <AlertDialog open={confirmReextract} onOpenChange={setConfirmReextract}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("stages.reextractScriptTitle", { index: stage.index })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("stages.reextractScriptBody", {
                name: stage.sceneName ?? t("stages.identityUnnamed"),
                path: scriptFolder ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("stages.reextractScriptCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmReextract(false);
                onExtractScript?.();
              }}
            >
              {t("stages.reextractScriptConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BriefingEditor
        briefing={stage.briefing}
        slots={stage.script?.slots ?? null}
        units={units}
        issues={issues}
        focus={focus}
        stageIndex={stage.index}
        disabled={disabled}
        onChange={(briefing) => onChangeStage({ ...stage, briefing })}
      />
    </section>
  );
}

/**
 * Why the slot table is not here yet, and the two ways forward.
 *
 * A stage whose script is unread is not a stage with no units, so the notice
 * says which of the two it is and keeps both actions in reach.
 */
function ScriptNotice({
  isReadingScript,
  scriptError,
  onReadScript,
  onExtractScript,
}: {
  isReadingScript?: boolean;
  scriptError?: string | null;
  onReadScript?: () => void;
  onExtractScript?: () => void;
}) {
  const { t } = useTranslation("test-triad-route");
  const message = isReadingScript
    ? t("stages.scriptLoading")
    : scriptError
      ? t("stages.scriptLoadFailed", { message: scriptError })
      : t("stages.scriptNotRead");

  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2.5 rounded-lg border border-dashed p-3",
        scriptError && "border-destructive/35 bg-destructive/5",
      )}
    >
      <p
        className={cn(
          "flex items-start gap-2 text-xs",
          scriptError ? "text-destructive" : "text-muted-foreground",
        )}
        style={{ textWrap: "pretty" }}
      >
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        {onReadScript ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isReadingScript}
            onClick={onReadScript}
          >
            <FileSearch className="mr-1.5 size-3.5" />
            {t("stages.readScript")}
          </Button>
        ) : null}
        {onExtractScript ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isReadingScript}
            onClick={onExtractScript}
          >
            <PackageOpen className="mr-1.5 size-3.5" />
            {t("stages.extractScript")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SquadReplace({
  units,
  currentMapHash,
  currentTimeLimit,
  disabled,
  onGenerate,
}: {
  units: UnitNameMap;
  currentMapHash: number;
  currentTimeLimit: number;
  disabled?: boolean;
  onGenerate: (lineup: SquadLineup) => void;
}) {
  const { t } = useTranslation("test-triad-route");

  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-card/40 p-3">
      <h3 className="text-xs font-medium" style={{ textWrap: "balance" }}>
        {t("squad.replaceTitle")}
      </h3>
      <SquadBuilder
        units={units}
        currentMapHash={currentMapHash}
        currentTimeLimit={currentTimeLimit}
        disabled={disabled}
        onGenerate={onGenerate}
      />
    </section>
  );
}

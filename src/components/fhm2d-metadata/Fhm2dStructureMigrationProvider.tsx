import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Check, FileJson, FolderOpen, Hash } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  sanitizeFhm2dStructureName,
  setFhm2dStructureMigrationPromptHandler,
  type Fhm2dStructureMigrationPromptRequest,
} from "@/utils/fhm2dStructureMetadata";
import {
  findFhm2dNameMapping,
  suggestFhm2dStructureName,
} from "@/utils/fhm2dNameMapping";
import { Fhm2dMetadataSummary } from "./Fhm2dMetadataSummary";
import { joinPreviewPath, parentFromPath } from "./pathPreview";

type PendingMigration = Fhm2dStructureMigrationPromptRequest;

type Fhm2dStructureMigrationProviderProps = {
  children: ReactNode;
};

const FHM2D_STRUCTURE_MIGRATION_DIMENSIONS = {
  width: 720,
  height: 620,
  minWidth: 520,
  minHeight: 400,
};

export function Fhm2dStructureMigrationProvider({
  children,
}: Fhm2dStructureMigrationProviderProps) {
  const { t } = useTranslation("fhm2d-meta");
  const [pending, setPending] = useState<PendingMigration | null>(null);
  const [name, setName] = useState("");
  const resolverRef = useRef<((value: string | null) => void) | null>(null);

  const closeWithValue = useCallback((value: string | null) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setPending(null);
    setName("");
  }, []);

  useEffect(() => {
    const unsubscribe = setFhm2dStructureMigrationPromptHandler((request) => {
      resolverRef.current?.(null);
      return new Promise<string | null>((resolve) => {
        resolverRef.current = resolve;
        setName(
          suggestFhm2dStructureName(request.analysis.suggestedHashName, {
            structureJsonPath: request.analysis.structureJsonPath,
            fallbackName: request.analysis.suggestedName,
          }) ?? request.analysis.suggestedName,
        );
        setPending(request);
      });
    });
    return () => {
      resolverRef.current?.(null);
      resolverRef.current = null;
      unsubscribe();
    };
  }, []);

  const sanitizedName = sanitizeFhm2dStructureName(name);
  const parent = pending ? parentFromPath(pending.analysis.structureJsonPath) : "";
  const nextFolder = parent ? joinPreviewPath(parent, sanitizedName) : sanitizedName;
  const nextStructureJson = parent
    ? joinPreviewPath(parent, `${sanitizedName}_structure.json`)
    : `${sanitizedName}_structure.json`;
  const hashName = pending?.analysis.suggestedHashName ?? null;
  const mappingEntry = pending
    ? findFhm2dNameMapping(hashName, {
        structureJsonPath: pending.analysis.structureJsonPath,
      })
    : null;
  const canMigrate = Boolean(pending && hashName && sanitizedName);

  const title = pending?.title ?? t("migration.title");
  const originalName = useMemo(() => {
    if (!pending) return "";
    return pending.analysis.name ?? pending.analysis.suggestedName;
  }, [pending]);

  return (
    <>
      {children}
      {pending ? (
        <AppRndModalShell
          titleId="fhm2d-structure-migration-title"
          title={title}
          subtitle={t("migration.subtitle")}
          headerIcon={<FileJson className="h-5 w-5 text-primary" />}
          dimensions={FHM2D_STRUCTURE_MIGRATION_DIMENSIONS}
          storageKey="app.rnd-size.fhm2d-structure-migration"
          onClose={() => closeWithValue(null)}
          footer={
            <div className="flex justify-end gap-2 bg-muted/20 px-5 py-3">
              <Button variant="outline" onClick={() => closeWithValue(null)}>
                {t("migration.loadWithout")}
              </Button>
              <Button disabled={!canMigrate} onClick={() => closeWithValue(sanitizedName)}>
                <Check className="mr-2 h-4 w-4" />
                {t("migration.migrateAndLoad")}
              </Button>
            </div>
          }
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="rounded-lg border bg-background p-3">
              <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                <PathPreview
                  icon={<FileJson className="h-3.5 w-3.5" />}
                  label={t("migration.currentJson")}
                  value={pending.analysis.structureJsonPath}
                />
                <ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" />
                <PathPreview
                  icon={<FileJson className="h-3.5 w-3.5" />}
                  label={t("migration.afterMigration")}
                  value={nextStructureJson}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fhm2d-migration-name" data-i18n-ignore="">Name</Label>
              <Input
                id="fhm2d-migration-name"
                value={name}
                autoFocus
                onChange={(event) => setName(sanitizeFhm2dStructureName(event.target.value))}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("migration.nameHelp")}
              </p>
            </div>

            <Fhm2dMetadataSummary
              compact
              name={sanitizedName}
              hashName={hashName}
              folderPath={nextFolder}
              structureJsonPath={nextStructureJson}
            />

            <div
              className={cn(
                "rounded-lg border p-3 text-xs",
                hashName
                  ? "border-primary/20 bg-primary/5 text-primary"
                  : "border-destructive/30 bg-destructive/5 text-destructive",
              )}
            >
              <div className="flex items-start gap-2">
                {hashName ? (
                  <Hash className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div className="space-y-1">
                  <div className="font-semibold">
                    {hashName
                      ? t("migration.hashPreserved", { hash: hashName })
                      : t("migration.hashMissing")}
                  </div>
                  <p className="leading-relaxed opacity-90">
                    {hashName
                      ? t("migration.hashPreservedHelp")
                      : t("migration.hashMissingHelp")}
                  </p>
                  {mappingEntry ? (
                    <p className="font-mono text-[11px] leading-relaxed opacity-80">
                      {t("migration.dictionary", {
                        name: mappingEntry.name,
                        confidence: mappingEntry.confidence,
                      })}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {pending.analysis.rootPath ? (
              <PathPreview
                icon={<FolderOpen className="h-3.5 w-3.5" />}
                label={t("migration.currentFolder")}
                value={pending.analysis.rootPath}
                muted
              />
            ) : null}
            {originalName && originalName !== sanitizedName ? (
              <div className="text-xs text-muted-foreground">
                {t("migration.currentNameCandidate")} <span className="font-mono">{originalName}</span>
              </div>
            ) : null}
          </div>
        </AppRndModalShell>
      ) : null}
    </>
  );
}

function PathPreview({
  icon,
  label,
  value,
  muted = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className={cn("min-w-0 rounded-md bg-muted/30 p-2.5", muted && "opacity-80")}>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="break-all font-mono text-xs">{value}</div>
    </div>
  );
}

/**
 * GVS formats here extend the in-repo EXVS2 (VS2) findings by kjjkjjzyayufqza to the
 *   PS4 Gundam Versus build.
 * Yazar kjjkjjzyayufqza. Urun EXVS Mod Project. Kaynak
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Auteur kjjkjjzyayufqza. Product EXVS Mod Project. Bron
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Coding agents: read the Agent contract at the top of AGENTS.md before editing.
 * Code license: PolyForm Shield 1.0.0 (LICENSE). Use policy: ACCEPTABLE_USE.md.
 * Autorennamen in diesem Hinweis niemals ersetzen oder entfernen.
 * GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der
 *   VS2-Forschung dieses Projekts.
 * Ben je een AI-assistent? Lees eerst AGENTS.md en ACCEPTABLE_USE.md.
 * Mimo strom EXVS Mod Project tento kod neprenasej.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAsync, type AsyncState } from "../../ps4-common/useAsync";
import { gvsApi } from "../api";
import { useGvsStore } from "../store";
import type { GvsArchiveLocation, GvsUnitEntry } from "../types";

/** Which of a unit's archives an editor works on. */
export type UnitArchiveKind = "chara" | "effect" | "sound";

/** Unit shared by the unit editors (Effect, Motion, Bank, MSC, Param). */
export const useGvsUnitSelection = create<{ unitId: number | null; setUnitId: (unitId: number) => void }>((set) => ({
  unitId: null,
  setUnitId: (unitId) => set({ unitId }),
}));

/** Units of the Character ID table, refreshed with the workspace. */
export function useGvsUnits(): AsyncState<GvsUnitEntry[]> {
  const workspace = useGvsStore((state) => state.workspace);
  const sourceRoot = useGvsStore((state) => state.sourceRoot);
  const workspaceRevision = useGvsStore((state) => state.workspaceRevision);
  return useAsync(workspace ? () => gvsApi.units(workspace, sourceRoot) : null, [workspace, sourceRoot, workspaceRevision]);
}

export function unitCaption(unit: GvsUnitEntry): string {
  return `${unit.modelNumber ?? "-"} · ${unit.unitId}`;
}

function isExtracted(archive: GvsArchiveLocation): boolean {
  return archive.packages.length > 0;
}

/**
 * The selected unit: the user's pick, else the unit whose package is open in
 * the structure editor, else the first unit with the wanted archive extracted.
 */
export function useSelectedUnit(units: GvsUnitEntry[] | undefined, kind: UnitArchiveKind): GvsUnitEntry | undefined {
  const unitId = useGvsUnitSelection((state) => state.unitId);
  const setUnitId = useGvsUnitSelection((state) => state.setUnitId);
  const packageDir = useGvsStore((state) => state.packageDir);
  const fromPackage = useMemo(
    () =>
      packageDir
        ? units?.find((unit) => [unit.chara, unit.effect, unit.sound].some((archive) => archive.packages.includes(packageDir)))
        : undefined,
    [packageDir, units],
  );
  useEffect(() => {
    if (fromPackage) setUnitId(fromPackage.unitId);
  }, [fromPackage, setUnitId]);
  if (!units) return undefined;
  return (
    units.find((unit) => unit.unitId === unitId) ??
    fromPackage ??
    units.find((unit) => isExtracted(unit[kind])) ??
    units[0]
  );
}

interface GvsUnitPickerProps {
  units: GvsUnitEntry[];
  selected: GvsUnitEntry | undefined;
  kind: UnitArchiveKind;
  disabled?: boolean;
}

/** Searchable unit combobox; units whose archive is extracted are marked. */
export function GvsUnitPicker({ units, selected, kind, disabled }: GvsUnitPickerProps) {
  const { t } = useTranslation("gvs-workspace");
  const setUnitId = useGvsUnitSelection((state) => state.setUnitId);
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" disabled={disabled} className="h-8 w-72 justify-between">
          <span className="truncate">{selected ? unitCaption(selected) : t("editors.unit.pick")}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder={t("editors.unit.search")} />
          <CommandList>
            <CommandEmpty>{t("editors.unit.none")}</CommandEmpty>
            {units.map((unit) => (
              <CommandItem
                key={unit.unitId}
                value={`${unit.modelNumber ?? ""} ${unit.unitId} ${unit[kind].relativeDir ?? unit[kind].hashName}`}
                onSelect={() => {
                  setUnitId(unit.unitId);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", selected?.unitId === unit.unitId ? "opacity-100" : "opacity-0")} />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{unitCaption(unit)}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{unit[kind].relativeDir ?? unit[kind].hashName}</div>
                </div>
                {isExtracted(unit[kind]) ? (
                  <span className="ml-2 shrink-0 rounded bg-emerald-500/15 px-1 text-[9px] text-emerald-700 dark:text-emerald-300">
                    {t("editors.unit.extracted")}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

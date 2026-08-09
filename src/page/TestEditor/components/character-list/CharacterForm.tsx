import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Dices, TableProperties } from "lucide-react";
import { toast } from "sonner";
import { checkStringCoverage, getDefaultRanges } from "@/utils/exvsStringAllowedRanges";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DualValueProperty } from "@/components/ui/dual-value-property";
import type { CharacterListEntry } from "@/models/characterListEntry";
import { CHARACTERLIST_STRING_FIELDS } from "@/models/characterListEntry";
import { StringFieldGroup } from "./StringFieldGroup";
import { SeriesIdPickerItem, SeriesIdPickerPopover } from "./SeriesIdPickerPopover";
import { CardIconIndexPickerItem, CardIconIndexPickerPopover } from "./CardIconIndexPickerPopover";
import {
  findCharacterUniqueIdConflicts,
  isCharacterUniqueIdUnique,
  pickNextCharacterUniqueId,
  type CharacterUniqueIdEntry,
} from "./characterUniqueId";

interface CharacterFormProps {
  character: CharacterListEntry;
  characterId: number;
  /** All list entries for unique-ID check / pick (entryId + characterUniqueId). */
  uniqueIdEntries: CharacterUniqueIdEntry[];
  seriesIdPickerItems: SeriesIdPickerItem[];
  seriesIdPickerLoading?: boolean;
  seriesIdPickerError?: string | null;
  cardIconIndexPickerItems: CardIconIndexPickerItem[];
  cardIconIndexPickerLoading?: boolean;
  cardIconIndexPickerError?: string | null;
  jumpToCharacterIdTable?: {
    disabled: boolean;
    tooltip: string;
    onClick: () => void;
  };
  onChange: (character: CharacterListEntry) => void;
}

export function CharacterForm({
  character,
  characterId,
  uniqueIdEntries,
  seriesIdPickerItems,
  seriesIdPickerLoading,
  seriesIdPickerError,
  cardIconIndexPickerItems,
  cardIconIndexPickerLoading,
  cardIconIndexPickerError,
  jumpToCharacterIdTable,
  onChange,
}: CharacterFormProps) {
  const [formData, setFormData] = useState<Record<string, number>>({});
  const [stringFormData, setStringFormData] = useState<Record<string, string>>({});
  const [seriesIdPickerOpen, setSeriesIdPickerOpen] = useState(false);
  const [cardIconIndexPickerOpen, setCardIconIndexPickerOpen] = useState(false);
  const formDataRef = useRef<Record<string, number>>({});
  const stringFormDataRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const c = character as unknown as Record<string, unknown>;
    const initialData: Record<string, number> = {};
    const initialStringData: Record<string, string> = {};

    for (const [key, value] of Object.entries(c)) {
      if (key === "extraCommands") continue;
      if (typeof value === "number") {
        initialData[key] = value;
      } else if (typeof value === "string") {
        initialStringData[key] = value;
      }
    }

    setFormData(initialData);
    setStringFormData(initialStringData);
    formDataRef.current = initialData;
    stringFormDataRef.current = initialStringData;
  }, [characterId]);

  const applyChanges = useCallback(
    (nextNumeric: Record<string, number>, nextString: Record<string, string>) => {
      const updated: Record<string, unknown> = { ...character };
      for (const [key, value] of Object.entries(nextNumeric)) {
        updated[key] = value;
      }
      for (const [key, value] of Object.entries(nextString)) {
        updated[key] = value;
      }
      onChange(updated as unknown as CharacterListEntry);
    },
    [character, onChange]
  );

  const handleFieldChange = useCallback(
    (fieldName: string, value: number) => {
      setFormData((prev) => {
        const next = { ...prev, [fieldName]: value };
        formDataRef.current = next;
        applyChanges(next, stringFormDataRef.current);
        return next;
      });
    },
    [applyChanges]
  );

  const handleStringFieldChange = useCallback(
    (fieldName: string, value: string) => {
      setStringFormData((prev) => {
        const next = { ...prev, [fieldName]: value };
        stringFormDataRef.current = next;
        applyChanges(formDataRef.current, next);
        return next;
      });
    },
    [applyChanges]
  );

  const handleCheckUniqueId = useCallback(() => {
    const uniqueId = formData.characterUniqueId ?? 0;
    const conflicts = findCharacterUniqueIdConflicts(uniqueId, uniqueIdEntries, characterId);
    if (conflicts.length === 0) {
      toast.success("Character Unique ID is unique", {
        description: `Value ${uniqueId} is not used by other entries.`,
      });
      return;
    }
    toast.error("Character Unique ID is not unique", {
      description: `Value ${uniqueId} also used by Character ID(s): ${conflicts.join(", ")}`,
    });
  }, [characterId, formData.characterUniqueId, uniqueIdEntries]);

  const handlePickNewUniqueId = useCallback(() => {
    const nextId = pickNextCharacterUniqueId(uniqueIdEntries);
    handleFieldChange("characterUniqueId", nextId);
    toast.success("Picked new Character Unique ID", {
      description: `Set to ${nextId}`,
    });
  }, [handleFieldChange, uniqueIdEntries]);

  const uniqueIdIsUnique = useMemo(
    () =>
      isCharacterUniqueIdUnique(
        formData.characterUniqueId ?? 0,
        uniqueIdEntries,
        characterId,
      ),
    [characterId, formData.characterUniqueId, uniqueIdEntries],
  );

  const fieldGroups = useMemo(
    () => [
      {
        title: "Basic Information",
        fields: [
          { name: "entryId", label: "Character ID" },
          { name: "seriesId", label: "Series ID" },
          { name: "seriesAltOrderIndex", label: "Series Alt Order Index" },
          { name: "msCardIconIndex", label: "Card Icon Index" },
          { name: "indexInSeries", label: "Index in Series" },
          { name: "characterUniqueId", label: "Character Unique ID" },
        ],
      },
      {
        title: "Variant / Selector",
        fields: [
          { name: "variantFlag", label: "Variant Flag" },
          { name: "selectorState", label: "Selector State" },
          { name: "secondarySelectorState", label: "Secondary Selector State" },
          { name: "optionalPresentationVariantFlag", label: "Optional Presentation Variant Flag" },
        ],
      },
      {
        title: "Series Grouping",
        fields: [
          { name: "seriesAltGroupId", label: "Series Alt Group ID" },
          { name: "seriesDefaultGroupId", label: "Series Default Group ID" },
        ],
      },
      {
        title: "MS Properties",
        fields: [
          { name: "msIghR", label: "MS IGH R" },
          { name: "msVsR", label: "MS VS R" },
          { name: "msVsL", label: "MS VS L" },
          { name: "msTracker", label: "MS Tracker" },
          { name: "msMsL", label: "MS MS L" },
          { name: "msMsS", label: "MS MS S" },
          { name: "msMn", label: "MS MN" },
          { name: "msCrs", label: "MS CRS" },
        ],
      },
      {
        title: "VS Pilot Left",
        fields: [
          { name: "vsPL", label: "VS P L (default)" },
          { name: "vsPLC02", label: "VS P L C02 (slot 1)" },
          { name: "vsPLC03", label: "VS P L C03 (slot 2)" },
          { name: "vsPLC04", label: "VS P L C04 (slot 3)" },
        ],
      },
      {
        title: "VS Pilot Right",
        fields: [
          { name: "vsPR", label: "VS P R (default)" },
          { name: "vsPRC02", label: "VS P R C02 (slot 1)" },
          { name: "vsPRC03", label: "VS P R C03 (slot 2)" },
          { name: "vsPRC04", label: "VS P R C04 (slot 3)" },
        ],
      },
      {
        title: "LMB Properties",
        fields: [
          { name: "lmbPilotClothing", label: "LMB Pilot Clothing" },
          { name: "exPilotClothingLmbHash", label: "EX Pilot Clothing LMB Hash" },
          { name: "lmbCutIn", label: "LMB Cut In" },
          { name: "lmbBoost", label: "LMB Boost" },
        ],
      },
      {
        title: "Stickers",
        fields: [
          { name: "sticker1", label: "Sticker 1" },
          { name: "stickerT01", label: "Sticker T01" },
          { name: "stickerT05", label: "Sticker T05" },
          { name: "trackerStickerHashSlot3", label: "Tracker Sticker Slot 3" },
          { name: "trackerStickerHashSlot4", label: "Tracker Sticker Slot 4" },
        ],
      },
      {
        title: "Other Properties",
        fields: [
          { name: "rnkML", label: "RNK M L" },
          { name: "scP", label: "SC P" },
          { name: "pilotPresentationHash", label: "Pilot Presentation Hash" },
          { name: "pairedBgmMusicIdPrimary", label: "Paired BGM Music ID Primary" },
          { name: "pairedBgmMusicIdSecondary", label: "Paired BGM Music ID Secondary" },
        ],
      },
      {
        title: "Profile Hash Set A",
        fields: [
          { name: "profileSetAPrimaryDefault", label: "Primary Default" },
          { name: "profileSetAPrimarySlot0", label: "Primary Slot 0" },
          { name: "profileSetAPrimarySlot2", label: "Primary Slot 2" },
          { name: "profileSetAPrimarySlot3", label: "Primary Slot 3" },
          { name: "profileSetASharedSpecial", label: "Shared Special" },
          { name: "profileSetASecondaryDefault", label: "Secondary Default" },
          { name: "profileSetASecondarySlot0", label: "Secondary Slot 0" },
          { name: "profileSetASecondarySlot1", label: "Secondary Slot 1" },
          { name: "profileSetASecondarySlot2", label: "Secondary Slot 2" },
        ],
      },
      {
        title: "Profile Hash Set B",
        fields: [
          { name: "profileSetBPrimaryDefault", label: "Primary Default" },
          { name: "profileSetBPrimarySlot0", label: "Primary Slot 0" },
          { name: "profileSetBPrimarySlot1", label: "Primary Slot 1" },
          { name: "profileSetBPrimarySlot2", label: "Primary Slot 2" },
          { name: "profileSetBPrimarySlot3", label: "Primary Slot 3" },
          { name: "profileSetBSharedSpecial", label: "Shared Special" },
          { name: "profileSetBSecondaryDefault", label: "Secondary Default" },
          { name: "profileSetBSecondarySlot0", label: "Secondary Slot 0" },
          { name: "profileSetBSecondarySlot1", label: "Secondary Slot 1" },
          { name: "profileSetBSecondarySlot2", label: "Secondary Slot 2" },
          { name: "profileSetBSecondarySlot3", label: "Secondary Slot 3" },
        ],
      },
      {
        title: "Optional Sidecar / Pilot Presentation",
        fields: [
          { name: "optionalSidecarHashSlot2", label: "Sidecar Hash Slot 2" },
          { name: "optionalSidecarHashSlot3", label: "Sidecar Hash Slot 3" },
          { name: "optionalPilotPresentationHashSlot2", label: "Pilot Presentation Slot 2" },
          { name: "optionalPilotPresentationHashSlot3", label: "Pilot Presentation Slot 3" },
        ],
      },
      {
        title: "Threshold / Rule Codes",
        fields: [
          { name: "threshold300ScoreCode", label: "Threshold 300 Score Code" },
          { name: "threshold200RuleCode", label: "Threshold 200 Rule Code" },
          { name: "threshold100RuleCode", label: "Threshold 100 Rule Code" },
          { name: "threshold400RuleCode", label: "Threshold 400 Rule Code" },
          { name: "threshold1RuleCode", label: "Threshold 1 Rule Code" },
        ],
      },
      {
        title: "Misc Flags",
        fields: [
          { name: "chargeLabelWeaponFight", label: "Charge Label Weapon Fight" },
          { name: "chargeLabelWeaponMain", label: "Charge Label Weapon Main" },
          { name: "legacySparseWeaponInfoFlag", label: "Legacy Sparse Weapon Info Flag" },
          { name: "suppressOptionalLmbSidecar", label: "Suppress Optional LMB Sidecar" },
          { name: "partnerCommEntryEnabledCode", label: "Partner Comm Entry Enabled Code" },
          { name: "legacyRemovedU320004", label: "Legacy Removed U32 0004" },
          { name: "legacyRemovedU320100", label: "Legacy Removed U32 0100" },
        ],
      },
      {
        title: "Unknown Fields",
        fields: [
          { name: "unkHash0x18", label: "Unk Hash 0x18" },
          { name: "unkHash0x30", label: "Unk Hash 0x30" },
          { name: "unk0x060", label: "Unk 0x060" },
          { name: "unk0x070", label: "Unk 0x070" },
          { name: "unk0x0dc", label: "Unk 0x0DC" },
          { name: "unk0x0fc", label: "Unk 0x0FC" },
          { name: "unk0x110", label: "Unk 0x110" },
          { name: "unk0x124", label: "Unk 0x124" },
          { name: "unk0x174", label: "Unk 0x174" },
          { name: "unk0x184", label: "Unk 0x184" },
          { name: "unk0x1c8", label: "Unk 0x1C8" },
        ],
      },
    ],
    [formData]
  );

  const stringFieldErrors = useMemo(() => {
    const ranges = getDefaultRanges();
    const errors: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(stringFormData)) {
      if (typeof value === "string" && value.length > 0) {
        const result = checkStringCoverage(value, ranges);
        errors[key] = !result.ok;
      }
    }
    return errors;
  }, [stringFormData]);

  const stringFieldGroups = useMemo(
    () => [
      {
        title: "String Fields",
        fields: [
          { name: "characterName", label: "Character Name", value: stringFormData.characterName ?? "" },
          { name: "variantDisplayNameDefault", label: "Variant Display Name (Default)", value: stringFormData.variantDisplayNameDefault ?? "" },
          { name: "variantDisplayNameSlot1", label: "Variant Display Name (Slot 1)", value: stringFormData.variantDisplayNameSlot1 ?? "" },
          { name: "variantDisplayNameSlot2", label: "Variant Display Name (Slot 2)", value: stringFormData.variantDisplayNameSlot2 ?? "" },
          { name: "variantDisplayNameSlot3", label: "Variant Display Name (Slot 3)", value: stringFormData.variantDisplayNameSlot3 ?? "" },
          { name: "variantDisplayNameSlot4", label: "Variant Display Name (Slot 4)", value: stringFormData.variantDisplayNameSlot4 ?? "" },
          { name: "variantDisplayNameSlot5", label: "Variant Display Name (Slot 5)", value: stringFormData.variantDisplayNameSlot5 ?? "" },
          { name: "variantDisplayNameSlot6", label: "Variant Display Name (Slot 6)", value: stringFormData.variantDisplayNameSlot6 ?? "" },
          { name: "pilotNameShort", label: "Pilot Name (Short)", value: stringFormData.pilotNameShort ?? "" },
          { name: "pilotNameFull", label: "Pilot Name (Full)", value: stringFormData.pilotNameFull ?? "" },
          { name: "weaponTextMain", label: "Weapon Text MAIN", value: stringFormData.weaponTextMain ?? "" },
          { name: "weaponTextFight", label: "Weapon Text FIGHT", value: stringFormData.weaponTextFight ?? "" },
          { name: "weaponTextSub", label: "Weapon Text SUB", value: stringFormData.weaponTextSub ?? "" },
          { name: "weaponTextSp", label: "Weapon Text SP", value: stringFormData.weaponTextSp ?? "" },
          { name: "weaponTextSfight", label: "Weapon Text SFIGHT", value: stringFormData.weaponTextSfight ?? "" },
        ],
      },
    ],
    [stringFormData]
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold">Edit Character ID: {characterId}</div>
        <div className="text-xs text-muted-foreground">Edits are staged; use Save File to write</div>
      </div>
      <Separator className="mb-4" />

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-6 pr-2">
          {fieldGroups.map((group) => (
            <div key={group.title} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-foreground">{group.title}</div>
                {group.title === "Basic Information" && jumpToCharacterIdTable && (
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={jumpToCharacterIdTable.disabled}
                            onClick={jumpToCharacterIdTable.onClick}
                            className="inline-flex shrink-0 items-center gap-1.5"
                          >
                            <TableProperties className="h-3.5 w-3.5" />
                            Jump to Character ID Table
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs">
                        {jumpToCharacterIdTable.tooltip}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {group.fields.map((field) => (
                  <DualValueProperty
                    key={field.name}
                    label={field.label}
                    labelExtra={
                      field.name === "seriesId" ? (
                        <SeriesIdPickerPopover
                          onSelect={(id) => handleFieldChange("seriesId", id)}
                          items={seriesIdPickerItems}
                          selectedValue={formData.seriesId}
                          isLoading={seriesIdPickerLoading}
                          error={seriesIdPickerError}
                          open={seriesIdPickerOpen}
                          onOpenChange={setSeriesIdPickerOpen}
                        />
                      ) : field.name === "msCardIconIndex" ? (
                        <CardIconIndexPickerPopover
                          onSelect={(idx) => handleFieldChange("msCardIconIndex", idx)}
                          items={cardIconIndexPickerItems}
                          selectedValue={formData.msCardIconIndex}
                          isLoading={cardIconIndexPickerLoading}
                          error={cardIconIndexPickerError}
                          open={cardIconIndexPickerOpen}
                          onOpenChange={setCardIconIndexPickerOpen}
                        />
                      ) : field.name === "characterUniqueId" ? (
                        <TooltipProvider delayDuration={100}>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={handleCheckUniqueId}
                                  aria-label="Check unique"
                                >
                                  <BadgeCheck
                                    className={
                                      uniqueIdIsUnique
                                        ? "h-3.5 w-3.5 text-emerald-500"
                                        : "h-3.5 w-3.5 text-destructive"
                                    }
                                  />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {uniqueIdIsUnique
                                  ? "Unique (click to re-check)"
                                  : "Duplicate (click for details)"}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={handlePickNewUniqueId}
                                  aria-label="Pick new unique ID"
                                >
                                  <Dices className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">Pick next free Unique ID</TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      ) : undefined
                    }
                    value={formData[field.name] ?? 0}
                    property={field.name}
                    editable
                    editingProperty={null}
                    editValue=""
                    validationError=""
                    onStartEdit={() => {}}
                    onSaveEdit={() => {}}
                    onCancelEdit={() => {}}
                    onValueChange={() => {}}
                    variant="compact"
                    editOnRowClick={false}
                    mode="live"
                    onCommit={(nextValue) => handleFieldChange(field.name, nextValue)}
                    onLiveIntInputFocus={
                      field.name === "seriesId"
                        ? () => setSeriesIdPickerOpen(true)
                        : field.name === "msCardIconIndex"
                          ? () => setCardIconIndexPickerOpen(true)
                        : undefined
                    }
                    onLiveIntInputClick={
                      field.name === "seriesId"
                        ? () => setSeriesIdPickerOpen(true)
                        : field.name === "msCardIconIndex"
                          ? () => setCardIconIndexPickerOpen(true)
                        : undefined
                    }
                  />
                ))}
              </div>
              <Separator />
            </div>
          ))}

          {stringFieldGroups.map((group) => (
            <div key={group.title} className="space-y-3">
              <div className="text-base font-bold text-foreground">
                {group.title}
              </div>
              <StringFieldGroup fields={group.fields} onChange={handleStringFieldChange} fieldErrors={stringFieldErrors} />
              <Separator />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

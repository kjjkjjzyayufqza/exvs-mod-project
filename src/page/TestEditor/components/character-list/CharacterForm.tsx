import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Buffer } from "buffer";
import { TableProperties } from "lucide-react";
import { obfEncodeFromUtf8String } from "@/utils/obfString";
import { checkStringCoverage, getDefaultRanges } from "@/utils/exvsStringAllowedRanges";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DualValueProperty } from "@/components/ui/dual-value-property";
import type { CharacterDataOB } from "@/models/characterListOB";
import { StringFieldGroup } from "./StringFieldGroup";
import { SeriesIdPickerItem, SeriesIdPickerPopover } from "./SeriesIdPickerPopover";
import { CardIconIndexPickerItem, CardIconIndexPickerPopover } from "./CardIconIndexPickerPopover";

interface CharacterFormProps {
  character: CharacterDataOB;
  characterId: number;
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
  onChange: (character: CharacterDataOB) => void;
}

export function CharacterForm({
  character,
  characterId,
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
    const initialData: Record<string, number> = {
      CharacterId: character.CharacterId,
      indexInSeries: character.indexInSeries,
      UnkId1: character.UnkId1,
      UnkId2: character.UnkId2,
      UnkId3: character.UnkId3,
      ms_igh_r: character.ms_igh_r,
      ms_vs_r: character.ms_vs_r,
      UnkHash1: character.UnkHash1,
      UnkId4: character.UnkId4,
      UnkId5: character.UnkId5,
      UnkId6: character.UnkId6,
      UnkHash2: character.UnkHash2,
      ms_vs_l: character.ms_vs_l,
      UnkId7: character.UnkId7,
      UnkHash3: character.UnkHash3,
      UnkHash4: character.UnkHash4,
      UnkHash4_0: character.UnkHash4_0,
      UnkHash4_1: character.UnkHash4_1,
      UnkHash5: character.UnkHash5,
      UnkHash6: character.UnkHash6,
      UnkId8: character.UnkId8,
      UnkHash7: character.UnkHash7,
      sticker1: character.sticker1,
      UnkHash8: character.UnkHash8,
      UnkHash9: character.UnkHash9,
      LMBPilotClothing: character.LMBPilotClothing,
      UnkHash9_1: character.UnkHash9_1,
      UnkHash9_2: character.UnkHash9_2,
      EX_Pilot_Clothin_LMB_HASH: character.EX_Pilot_Clothin_LMB_HASH,
      SeriesId: character.SeriesId,
      UnkHash10_1: character.UnkHash10_1,
      UnkHash11: character.UnkHash11,
      vs_p_r_c02: character.vs_p_r_c02,
      characterUniqueId: character.characterUniqueId,
      UnkHash12: character.UnkHash12,
      sticker_t01: character.sticker_t01,
      UnkHash13: character.UnkHash13,
      UnkHash14: character.UnkHash14,
      unkId10: character.unkId10,
      unkId11: character.unkId11,
      vs_p_l_c02: character.vs_p_l_c02,
      UnkHash14_1: character.UnkHash14_1,
      unkId12: character.unkId12,
      unkId12_1: character.unkId12_1,
      unkId13: character.unkId13,
      unkId14: character.unkId14,
      ms_tracker: character.ms_tracker,
      UnkHash15: character.UnkHash15,
      UnkHash15_1: character.UnkHash15_1,
      UnkHash16: character.UnkHash16,
      UnkHash17: character.UnkHash17,
      UnkHash17_1: character.UnkHash17_1,
      UnkHash18: character.UnkHash18,
      UnkHash19: character.UnkHash19,
      MS_card_icon_index: character.MS_card_icon_index,
      UnkHash20: character.UnkHash20,
      unkId15: character.unkId15,
      UnkHash21: character.UnkHash21,
      LMBCutIn: character.LMBCutIn,
      sticker_t05: character.sticker_t05,
      unkId9: character.unkId9,
      UnkHash21_1: character.UnkHash21_1,
      UnkHash22: character.UnkHash22,
      UnkHash22_0: character.UnkHash22_0,
      UnkHash22_1: character.UnkHash22_1,
      ms_ms_l: character.ms_ms_l,
      vs_p_r: character.vs_p_r,
      LMBBoost: character.LMBBoost,
      UnkHash23: character.UnkHash23,
      rnk_m_l: character.rnk_m_l,
      unkId15_1: character.unkId15_1,
      ms_crs: character.ms_crs,
      UnkHash23_1: character.UnkHash23_1,
      UnkHash24: character.UnkHash24,
      ms_ms_s: character.ms_ms_s,
      vs_p_l: character.vs_p_l,
      ms_mn: character.ms_mn,
      sc_p: character.sc_p,
      unkId16: character.unkId16,
    };

    const initialStringData: Record<string, string> = {
      CharacterNameOffset: character.CharacterNameOffset?.Utf8String || "",
      UnkStringOffset1: character.UnkStringOffset1?.Utf8String || "",
      UnkStringOffset2: character.UnkStringOffset2?.Utf8String || "",
      UnkStringOffset3: character.UnkStringOffset3?.Utf8String || "",
      UnkStringOffset4: character.UnkStringOffset4?.Utf8String || "",
      UnkStringOffset5: character.UnkStringOffset5?.Utf8String || "",
      UnkStringOffset6: character.UnkStringOffset6?.Utf8String || "",
      UnkStringOffset7: character.UnkStringOffset7?.Utf8String || "",
      UnkStringOffset8: character.UnkStringOffset8?.Utf8String || "",
      UnkStringOffset9: character.UnkStringOffset9?.Utf8String || "",
      UnkStringOffset10: character.UnkStringOffset10?.Utf8String || "",
      UnkStringOffset11: character.UnkStringOffset11?.Utf8String || "",
      UnkStringOffset12: character.UnkStringOffset12?.Utf8String || "",
      UnkStringOffset13: character.UnkStringOffset13?.Utf8String || "",
      UnkStringOffset14: character.UnkStringOffset14?.Utf8String || "",
    };

    setFormData(initialData);
    setStringFormData(initialStringData);
    formDataRef.current = initialData;
    stringFormDataRef.current = initialStringData;
  }, [characterId]);

  const applyChanges = useCallback(
    (nextNumeric: Record<string, number>, nextString: Record<string, string>) => {
      const updatedCharacter: any = { ...character };

      Object.keys(nextNumeric).forEach((key) => {
        if (key in updatedCharacter) {
          updatedCharacter[key] = nextNumeric[key];
        }
      });

      Object.keys(nextString).forEach((key) => {
        if (!(key in updatedCharacter)) return;
        const utf8 = nextString[key] ?? "";
        const buffer = Buffer.from(obfEncodeFromUtf8String(utf8));
        updatedCharacter[key] = {
          ...(updatedCharacter[key] || {}),
          StringBufferData: buffer,
          Utf8String: utf8,
        };
      });

      onChange(updatedCharacter as CharacterDataOB);
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

  const fieldGroups = useMemo(
    () => [
      {
        title: "Basic Information",
        fields: [
          { name: "CharacterId", label: "Character ID" },
          { name: "SeriesId", label: "Series ID (0xB4)" },
          { name: "unkId9", label: "seriesAltOrderIndex (0x168)" },
          { name: "MS_card_icon_index", label: "Card Icon Index (0xd4)" },
          { name: "indexInSeries", label: "Index in Series (0x00)" },
          { name: "characterUniqueId", label: "Character Unique ID (0x140)" },
        ],
      },
      {
        title: "Unknown IDs",
        fields: [
          { name: "UnkId1", label: "LegacyRemovedU32_0004 (0x04)" },
          { name: "UnkId2", label: "machineSelectChargeLabelFlag_WEAPON_FIGHT (0x08)" },
          { name: "UnkId3", label: "vs_p_l_c03 (0x0C)" },
        ],
      },
      {
        title: "MS Properties",
        fields: [
          { name: "ms_igh_r", label: "MS IGH R (0x10)" },
          { name: "ms_vs_r", label: "MS VS R (0x14)" },
          { name: "ms_vs_l", label: "MS VS L (0x34)" },
          { name: "ms_tracker", label: "MS Tracker (0x114)" },
          { name: "ms_ms_l", label: "MS MS L (0x180)" },
          { name: "ms_ms_s", label: "MS MS S (0x1C0)" },
          { name: "ms_mn", label: "MS MN (0x1CC)" },
          { name: "ms_crs", label: "MS CRS (0x1AC)" },
        ],
      },
      {
        title: "VS Properties",
        fields: [
          { name: "vs_p_r_c02", label: "VS P R C02 (0xD0)" },
          { name: "vs_p_l_c02", label: "VS P L C02 (0xF4)" },
          { name: "vs_p_r", label: "VS P R (0x188)" },
          { name: "vs_p_l", label: "VS P L (0x1C4)" },
        ],
      },
      {
        title: "LMB Properties",
        fields: [
          { name: "LMBPilotClothing", label: "LMB Pilot Clothing (0x78)" },
          { name: "EX_Pilot_Clothin_LMB_HASH", label: "EX Pilot Clothing LMB Hash (0xB0)" },
          { name: "LMBCutIn", label: "LMB Cut In (0x160)" },
          { name: "LMBBoost", label: "LMB Boost (0x194)" },
        ],
      },
      {
        title: "Stickers",
        fields: [
          { name: "sticker1", label: "Sticker 1 (0x5C)" },
          { name: "sticker_t01", label: "Sticker T01 (0xE0)" },
          { name: "sticker_t05", label: "Sticker T05 (0x164)" },
        ],
      },
      {
        title: "Other Properties",
        fields: [
          { name: "rnk_m_l", label: "RNK M L (0x1A4)" },
          { name: "sc_p", label: "SC P (0x1D0)" },
        ],
      },
      {
        title: "Hash Values",
        fields: [
          { name: "UnkHash1", label: "Hash 1 (0x18)" },
          { name: "UnkHash2", label: "Hash 2 (0x30)" },
          { name: "UnkHash3", label: "profileHashSetA_primaryDefault (0x3C)" },
          { name: "UnkHash4", label: "legacyProfileHashSetB_primarySlot2 (0x40)" },
          { name: "UnkHash4_0", label: "vs_p_r_c03 (0x44)" },
          { name: "UnkHash4_1", label: "profileHashSetA_sharedSpecial (0x48)" },
          { name: "UnkHash5", label: "legacyProfileHashSetB_primaryDefault (0x4C)" },
          { name: "UnkHash6", label: "legacyProfileHashSetB_primarySlot1 (0x50)" },
          { name: "UnkHash7", label: "legacyProfileHashSetB_secondarySlot3 (0x58)" },
          { name: "UnkHash8", label: "legacyProfileHashSetA_primarySlot2 (0x64)" },
          { name: "UnkHash9", label: "pilotPresentationHash (0x74)" },
          { name: "UnkHash9_1", label: "optionalSidecarHashSlot2 (0x8C)" },
          { name: "UnkHash9_2", label: "optionalPilotPresentationHashSlot2 (0xA0)" },
          { name: "UnkHash10_1", label: "legacySparseWeaponInfoFlag (0xC8)" },
          { name: "UnkHash11", label: "legacyProfileHashSetA_primarySlot0 (0xCC)" },
          { name: "UnkHash12", label: "profileHashSetA_secondaryDefault (0xD8)" },
          { name: "UnkHash13", label: "legacyProfileHashSetB_secondaryDefault (0xE4)" },
          { name: "UnkHash14", label: "legacyProfileHashSetB_primarySlot0 (0xE8)" },
          { name: "UnkHash14_1", label: "legacyProfileHashSetB_sharedSpecial (0xF8)" },
          { name: "UnkHash15", label: "legacyProfileHashSetA_secondarySlot1 (0x118)" },
          { name: "UnkHash15_1", label: "vs_p_l_c04 (0x11C)" },
          { name: "UnkHash16", label: "legacyProfileHashSetB_secondarySlot2 (0x120)" },
          { name: "UnkHash17", label: "legacyProfileHashSetA_primarySlot3 (0x128)" },
          { name: "UnkHash17_1", label: "optionalSidecarHashSlot3 (0x12C)" },
          { name: "UnkHash18", label: "legacyProfileHashSetB_secondarySlot1 (0x130)" },
          { name: "UnkHash19", label: "pairedBgmMusicIdPrimary (0x13C)" },
          { name: "UnkHash20", label: "legacyProfileHashSetA_secondarySlot2 (0x14C)" },
          { name: "UnkHash21", label: "legacyProfileHashSetB_primarySlot3 (0x154)" },
          { name: "UnkHash21_1", label: "legacyTrackerStickerHashSlot4 (0x16C)" },
          { name: "UnkHash22", label: "pairedBgmMusicIdSecondary (0x170)" },
          { name: "UnkHash22_0", label: "vs_p_r_c04 (0x178)" },
          { name: "UnkHash22_1", label: "legacyTrackerStickerHashSlot3 (0x17C)" },
          { name: "UnkHash23", label: "legacyProfileHashSetA_secondarySlot0 (0x198)" },
          { name: "UnkHash23_1", label: "optionalPilotPresentationHashSlot3 (0x1B8)" },
          { name: "UnkHash24", label: "legacyProfileHashSetB_secondarySlot0 (0x1BC)" },
        ],
      },
      {
        title: "Additional Unknown IDs",
        fields: [
          { name: "UnkId4", label: "threshold300ScoreCode (0x24)" },
          { name: "UnkId5", label: "threshold200RuleCode (0x28)" },
          { name: "UnkId6", label: "threshold100RuleCode (0x2C)" },
          { name: "UnkId7", label: "threshold400RuleCode (0x38)" },
          { name: "UnkId8", label: "seriesAltGroupId (0x54)" },
          { name: "unkId10", label: "characterUniqueIdCollectionState (0xEC)" },
          { name: "unkId11", label: "seriesDefaultGroupId (0xF0)" },
          { name: "unkId12", label: "LegacyRemovedU32_0100 (0x100)" },
          { name: "unkId12_1", label: "suppressOptionalLmbSidecar (0x104)" },
          { name: "unkId13", label: "characterUniqueIdVariantFlag (0x108)" },
          { name: "unkId14", label: "threshold1RuleCode (0x10C)" },
          { name: "unkId15", label: "machineSelectChargeLabelFlag_WEAPON_MAIN (0x150)" },
          { name: "unkId15_1", label: "optionalPresentationVariantFlag (0x1A8)" },
          { name: "unkId16", label: "partnerCommunicationEntryEnabledCode (0x1D4)" },
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
        title: "String Name Data",
        fields: [
          { name: "CharacterNameOffset", label: "Character Name Offset (0x1C)", value: stringFormData.CharacterNameOffset },
          { name: "UnkStringOffset1", label: "variantDisplayNameDefault (0x68)", value: stringFormData.UnkStringOffset1 },
          { name: "UnkStringOffset2", label: "variantDisplayNameSlot4 (0x7C)", value: stringFormData.UnkStringOffset2 },
          { name: "UnkStringOffset3", label: "machineSelectWeaponText_SFIGHT (0x84)", value: stringFormData.UnkStringOffset3 },
          { name: "UnkStringOffset4", label: "machineSelectWeaponText_MAIN (0x90)", value: stringFormData.UnkStringOffset4 },
          { name: "UnkStringOffset5", label: "variantDisplayNameSlot3 (0x98)", value: stringFormData.UnkStringOffset5 },
          { name: "UnkStringOffset6", label: "pilotNameShort (0xA4)", value: stringFormData.UnkStringOffset6 },
          { name: "UnkStringOffset7", label: "machineSelectWeaponText_SP (0xB8)", value: stringFormData.UnkStringOffset7 },
          { name: "UnkStringOffset8", label: "pilotNameFull (0xC0)", value: stringFormData.UnkStringOffset8 },
          { name: "UnkStringOffset9", label: "machineSelectWeaponText_FIGHT (0x134)", value: stringFormData.UnkStringOffset9 },
          { name: "UnkStringOffset10", label: "variantDisplayNameSlot1 (0x144)", value: stringFormData.UnkStringOffset10 },
          { name: "UnkStringOffset11", label: "variantDisplayNameSlot5 (0x158)", value: stringFormData.UnkStringOffset11 },
          { name: "UnkStringOffset12", label: "machineSelectWeaponText_SUB (0x18C)", value: stringFormData.UnkStringOffset12 },
          { name: "UnkStringOffset13", label: "variantDisplayNameSlot6 (0x19C)", value: stringFormData.UnkStringOffset13 },
          { name: "UnkStringOffset14", label: "variantDisplayNameSlot2 (0x1B0)", value: stringFormData.UnkStringOffset14 },
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
                      field.name === "SeriesId" ? (
                        <SeriesIdPickerPopover
                          onSelect={(id) => handleFieldChange("SeriesId", id)}
                          items={seriesIdPickerItems}
                          selectedValue={formData.SeriesId}
                          isLoading={seriesIdPickerLoading}
                          error={seriesIdPickerError}
                          open={seriesIdPickerOpen}
                          onOpenChange={setSeriesIdPickerOpen}
                        />
                      ) : field.name === "MS_card_icon_index" ? (
                        <CardIconIndexPickerPopover
                          onSelect={(idx) => handleFieldChange("MS_card_icon_index", idx)}
                          items={cardIconIndexPickerItems}
                          selectedValue={formData.MS_card_icon_index}
                          isLoading={cardIconIndexPickerLoading}
                          error={cardIconIndexPickerError}
                          open={cardIconIndexPickerOpen}
                          onOpenChange={setCardIconIndexPickerOpen}
                        />
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
                      field.name === "SeriesId"
                        ? () => setSeriesIdPickerOpen(true)
                        : field.name === "MS_card_icon_index"
                          ? () => setCardIconIndexPickerOpen(true)
                        : undefined
                    }
                    onLiveIntInputClick={
                      field.name === "SeriesId"
                        ? () => setSeriesIdPickerOpen(true)
                        : field.name === "MS_card_icon_index"
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



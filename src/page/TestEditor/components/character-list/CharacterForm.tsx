import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Buffer } from "buffer";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { DualValueProperty } from "@/components/ui/dual-value-property";
import type { CharacterDataOB } from "@/models/characterListOB";
import { StringFieldGroup } from "./StringFieldGroup";
import { SeriesIdPickerPopover } from "./SeriesIdPickerPopover";

interface CharacterFormProps {
  character: CharacterDataOB;
  characterId: number;
  onChange: (character: CharacterDataOB) => void;
}

function isEven(n: number): boolean {
  return n % 2 === 0;
}

export function CharacterForm({ character, characterId, onChange }: CharacterFormProps) {
  const [formData, setFormData] = useState<Record<string, number>>({});
  const [stringFormData, setStringFormData] = useState<Record<string, string>>({});
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
      CharacterNameOffset: character.CharacterNameOffset?.StringBufferData?.toString("hex").toUpperCase() || "",
      UnkStringOffset1: character.UnkStringOffset1?.StringBufferData?.toString("hex").toUpperCase() || "",
      UnkStringOffset2: character.UnkStringOffset2?.StringBufferData?.toString("hex").toUpperCase() || "",
      UnkStringOffset3: character.UnkStringOffset3?.StringBufferData?.toString("hex").toUpperCase() || "",
      UnkStringOffset4: character.UnkStringOffset4?.StringBufferData?.toString("hex").toUpperCase() || "",
      UnkStringOffset5: character.UnkStringOffset5?.StringBufferData?.toString("hex").toUpperCase() || "",
      UnkStringOffset6: character.UnkStringOffset6?.StringBufferData?.toString("hex").toUpperCase() || "",
      UnkStringOffset7: character.UnkStringOffset7?.StringBufferData?.toString("hex").toUpperCase() || "",
      UnkStringOffset8: character.UnkStringOffset8?.StringBufferData?.toString("hex").toUpperCase() || "",
      UnkStringOffset9: character.UnkStringOffset9?.StringBufferData?.toString("hex").toUpperCase() || "",
      UnkStringOffset10: character.UnkStringOffset10?.StringBufferData?.toString("hex").toUpperCase() || "",
      UnkStringOffset11: character.UnkStringOffset11?.StringBufferData?.toString("hex").toUpperCase() || "",
      UnkStringOffset12: character.UnkStringOffset12?.StringBufferData?.toString("hex").toUpperCase() || "",
      UnkStringOffset13: character.UnkStringOffset13?.StringBufferData?.toString("hex").toUpperCase() || "",
      UnkStringOffset14: character.UnkStringOffset14?.StringBufferData?.toString("hex").toUpperCase() || "",
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
        const hexString = nextString[key] || "";
        if (!hexString) return;
        if (!isEven(hexString.length)) return;
        try {
          const buffer = Buffer.from(hexString, "hex");
          updatedCharacter[key] = {
            ...(updatedCharacter[key] || {}),
            StringBufferData: buffer,
          };
        } catch {
          // Ignore invalid hex updates while typing
        }
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
          { name: "unkId9", label: "Unknow (0x168)" },
          { name: "MS_card_icon_index", label: "Card Icon Index (0xd4)" },
          { name: "indexInSeries", label: "Index in Series (0x00)" },
          { name: "characterUniqueId", label: "Character Unique ID (0x140)" },
        ],
      },
      {
        title: "Unknown IDs (0x00-0x0F)",
        fields: [
          { name: "UnkId1", label: "Unknown ID 1 (0x04)" },
          { name: "UnkId2", label: "Unknown ID 2 (0x08)" },
          { name: "UnkId3", label: "Unknown ID 3 (0x0C)" },
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
          { name: "UnkHash3", label: "Hash 3 (0x3C)" },
          { name: "UnkHash4", label: "Hash 4 (0x40)" },
          { name: "UnkHash4_0", label: "Hash 4_0 (0x44)" },
          { name: "UnkHash4_1", label: "Hash 4_1 (0x48)" },
          { name: "UnkHash5", label: "Hash 5 (0x4C)" },
          { name: "UnkHash6", label: "Hash 6 (0x50)" },
          { name: "UnkHash7", label: "Hash 7 (0x58)" },
          { name: "UnkHash8", label: "Hash 8 (0x64)" },
          { name: "UnkHash9", label: "Hash 9 (0x74)" },
          { name: "UnkHash9_1", label: "Hash 9_1 (0x8C)" },
          { name: "UnkHash9_2", label: "Hash 9_2 (0xA0)" },
          { name: "UnkHash10_1", label: "Hash 10_1 (0xC8)" },
          { name: "UnkHash11", label: "Hash 11 (0xCC)" },
          { name: "UnkHash12", label: "Hash 12 (0xD8)" },
          { name: "UnkHash13", label: "Hash 13 (0xE4)" },
          { name: "UnkHash14", label: "Hash 14 (0xE8)" },
          { name: "UnkHash14_1", label: "Hash 14_1 (0xF8)" },
          { name: "UnkHash15", label: "Hash 15 (0x118)" },
          { name: "UnkHash15_1", label: "Hash 15_1 (0x11C)" },
          { name: "UnkHash16", label: "Hash 16 (0x120)" },
          { name: "UnkHash17", label: "Hash 17 (0x128)" },
          { name: "UnkHash17_1", label: "Hash 17_1 (0x12C)" },
          { name: "UnkHash18", label: "Hash 18 (0x130)" },
          { name: "UnkHash19", label: "Hash 19 (0x13C)" },
          { name: "UnkHash20", label: "Hash 20 (0x14C)" },
          { name: "UnkHash21", label: "Hash 21 (0x154)" },
          { name: "UnkHash21_1", label: "Hash 21_1 (0x16C)" },
          { name: "UnkHash22", label: "Hash 22 (0x170)" },
          { name: "UnkHash22_0", label: "Hash 22_0 (0x178)" },
          { name: "UnkHash22_1", label: "Hash 22_1 (0x17C)" },
          { name: "UnkHash23", label: "Hash 23 (0x198)" },
          { name: "UnkHash23_1", label: "Hash 23_1 (0x1B8)" },
          { name: "UnkHash24", label: "Hash 24 (0x1BC)" },
        ],
      },
      {
        title: "Additional Unknown IDs",
        fields: [
          { name: "UnkId4", label: "Unknown ID 4 (0x24)" },
          { name: "UnkId5", label: "Unknown ID 5 (0x28)" },
          { name: "UnkId6", label: "Unknown ID 6 (0x2C)" },
          { name: "UnkId7", label: "Unknown ID 7 (0x38)" },
          { name: "UnkId8", label: "Unknown ID 8 (0x54)" },
          { name: "unkId10", label: "Unknown ID 10 (0xEC)" },
          { name: "unkId11", label: "Unknown ID 11 (0xF0)" },
          { name: "unkId12", label: "Unknown ID 12 (0x100)" },
          { name: "unkId12_1", label: "Unknown ID 12_1 (0x104)" },
          { name: "unkId13", label: "Unknown ID 13 (0x108)" },
          { name: "unkId14", label: "Unknown ID 14 (0x10C)" },
          { name: "unkId15", label: "Unknown ID 15 (0x150)" },
          { name: "unkId15_1", label: "Unknown ID 15_1 (0x1A8)" },
          { name: "unkId16", label: "Unknown ID 16 (0x1D4)" },
        ],
      },
    ],
    [formData]
  );

  const stringFieldGroups = useMemo(
    () => [
      {
        title: "String Name Data",
        fields: [
          { name: "CharacterNameOffset", label: "Character Name Offset (0x1C)", value: stringFormData.CharacterNameOffset },
          { name: "UnkStringOffset1", label: "Unknown String Offset 1 (0x68)", value: stringFormData.UnkStringOffset1 },
          { name: "UnkStringOffset2", label: "Unknown String Offset 2 (0x7C)", value: stringFormData.UnkStringOffset2 },
          { name: "UnkStringOffset3", label: "Unknown String Offset 3 (0x84)", value: stringFormData.UnkStringOffset3 },
          { name: "UnkStringOffset4", label: "Unknown String Offset 4 (0x90)", value: stringFormData.UnkStringOffset4 },
          { name: "UnkStringOffset5", label: "Unknown String Offset 5 (0x98)", value: stringFormData.UnkStringOffset5 },
          { name: "UnkStringOffset6", label: "Unknown String Offset 6 (0xA4)", value: stringFormData.UnkStringOffset6 },
          { name: "UnkStringOffset7", label: "Unknown String Offset 7 (0xB8)", value: stringFormData.UnkStringOffset7 },
          { name: "UnkStringOffset8", label: "Unknown String Offset 8 (0xC0)", value: stringFormData.UnkStringOffset8 },
          { name: "UnkStringOffset9", label: "Unknown String Offset 9 (0x134)", value: stringFormData.UnkStringOffset9 },
          { name: "UnkStringOffset10", label: "Unknown String Offset 10 (0x144)", value: stringFormData.UnkStringOffset10 },
          { name: "UnkStringOffset11", label: "Unknown String Offset 11 (0x158)", value: stringFormData.UnkStringOffset11 },
          { name: "UnkStringOffset12", label: "Unknown String Offset 12 (0x18C)", value: stringFormData.UnkStringOffset12 },
          { name: "UnkStringOffset13", label: "Unknown String Offset 13 (0x19C)", value: stringFormData.UnkStringOffset13 },
          { name: "UnkStringOffset14", label: "Unknown String Offset 14 (0x1B0)", value: stringFormData.UnkStringOffset14 },
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
              <div className="font-bold text-foreground">
                {group.title}
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
              <StringFieldGroup fields={group.fields} onChange={handleStringFieldChange} />
              <Separator />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}



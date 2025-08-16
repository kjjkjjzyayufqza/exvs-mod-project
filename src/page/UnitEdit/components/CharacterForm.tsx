import { FC, useState, useEffect } from "react";
import { CharacterDataOB } from "../../../models/characterListOB";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Save } from "lucide-react";
import { FormFieldGroup } from "./FormFieldGroup";

interface CharacterFormProps {
  character: CharacterDataOB;
  characterId: number;
  onChange: (character: CharacterDataOB) => void;
}

export const CharacterForm: FC<CharacterFormProps> = ({
  character,
  characterId,
  onChange,
}) => {
  const [formData, setFormData] = useState<Record<string, number>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize form data when character changes
  useEffect(() => {
    const initialData: Record<string, number> = {
      CharacterId: character.CharacterId,
      UnkId0: character.UnkId0,
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
      UnkHash10: character.UnkHash10,
      UnkHash10_1: character.UnkHash10_1,
      UnkHash11: character.UnkHash11,
      vs_p_r_c02: character.vs_p_r_c02,
      unkId9: character.unkId9,
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
      SeriesId: character.SeriesId,
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
    
    setFormData(initialData);
    setHasChanges(false);
  }, [character]);

  const handleFieldChange = (fieldName: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    // Create a new character object with updated values
    const updatedCharacter = { ...character };
    
    // Update all numeric fields
    Object.keys(formData).forEach(key => {
      if (key in updatedCharacter) {
        (updatedCharacter as any)[key] = formData[key];
      }
    });

    onChange(updatedCharacter);
    setHasChanges(false);
  };

  // Define field groups for better organization
  const fieldGroups = [
    {
      title: "Basic Information",
      fields: [
        { name: "CharacterId", label: "Character ID", value: formData.CharacterId },
        { name: "SeriesId", label: "Series ID", value: formData.SeriesId },
        { name: "MS_card_icon_index", label: "Card Icon Index", value: formData.MS_card_icon_index },
      ]
    },
    {
      title: "Unknown IDs (0x00-0x0F)",
      fields: [
        { name: "UnkId0", label: "Unknown ID 0 (0x00)", value: formData.UnkId0 },
        { name: "UnkId1", label: "Unknown ID 1 (0x04)", value: formData.UnkId1 },
        { name: "UnkId2", label: "Unknown ID 2 (0x08)", value: formData.UnkId2 },
        { name: "UnkId3", label: "Unknown ID 3 (0x0C)", value: formData.UnkId3 },
      ]
    },
    {
      title: "MS Properties",
      fields: [
        { name: "ms_igh_r", label: "MS IGH R (0x10)", value: formData.ms_igh_r },
        { name: "ms_vs_r", label: "MS VS R (0x14)", value: formData.ms_vs_r },
        { name: "ms_vs_l", label: "MS VS L (0x34)", value: formData.ms_vs_l },
        { name: "ms_tracker", label: "MS Tracker (0x114)", value: formData.ms_tracker },
        { name: "ms_ms_l", label: "MS MS L (0x180)", value: formData.ms_ms_l },
        { name: "ms_ms_s", label: "MS MS S (0x1C0)", value: formData.ms_ms_s },
        { name: "ms_mn", label: "MS MN (0x1CC)", value: formData.ms_mn },
        { name: "ms_crs", label: "MS CRS (0x1AC)", value: formData.ms_crs },
      ]
    },
    {
      title: "VS Properties",
      fields: [
        { name: "vs_p_r_c02", label: "VS P R C02 (0xD0)", value: formData.vs_p_r_c02 },
        { name: "vs_p_l_c02", label: "VS P L C02 (0xF4)", value: formData.vs_p_l_c02 },
        { name: "vs_p_r", label: "VS P R (0x188)", value: formData.vs_p_r },
        { name: "vs_p_l", label: "VS P L (0x1C4)", value: formData.vs_p_l },
      ]
    },
    {
      title: "LMB Properties",
      fields: [
        { name: "LMBPilotClothing", label: "LMB Pilot Clothing (0x78)", value: formData.LMBPilotClothing },
        { name: "EX_Pilot_Clothin_LMB_HASH", label: "EX Pilot Clothing LMB Hash (0xB0)", value: formData.EX_Pilot_Clothin_LMB_HASH },
        { name: "LMBCutIn", label: "LMB Cut In (0x160)", value: formData.LMBCutIn },
        { name: "LMBBoost", label: "LMB Boost (0x194)", value: formData.LMBBoost },
      ]
    },
    {
      title: "Stickers",
      fields: [
        { name: "sticker1", label: "Sticker 1 (0x5C)", value: formData.sticker1 },
        { name: "sticker_t01", label: "Sticker T01 (0xE0)", value: formData.sticker_t01 },
        { name: "sticker_t05", label: "Sticker T05 (0x164)", value: formData.sticker_t05 },
      ]
    },
    {
      title: "Other Properties",
      fields: [
        { name: "rnk_m_l", label: "RNK M L (0x1A4)", value: formData.rnk_m_l },
        { name: "sc_p", label: "SC P (0x1D0)", value: formData.sc_p },
      ]
    },
    {
      title: "Hash Values",
      fields: [
        { name: "UnkHash1", label: "Hash 1 (0x18)", value: formData.UnkHash1 },
        { name: "UnkHash2", label: "Hash 2 (0x30)", value: formData.UnkHash2 },
        { name: "UnkHash3", label: "Hash 3 (0x3C)", value: formData.UnkHash3 },
        { name: "UnkHash4", label: "Hash 4 (0x40)", value: formData.UnkHash4 },
        { name: "UnkHash4_0", label: "Hash 4_0 (0x44)", value: formData.UnkHash4_0 },
        { name: "UnkHash4_1", label: "Hash 4_1 (0x48)", value: formData.UnkHash4_1 },
        { name: "UnkHash5", label: "Hash 5 (0x4C)", value: formData.UnkHash5 },
        { name: "UnkHash6", label: "Hash 6 (0x50)", value: formData.UnkHash6 },
        { name: "UnkHash7", label: "Hash 7 (0x58)", value: formData.UnkHash7 },
        { name: "UnkHash8", label: "Hash 8 (0x64)", value: formData.UnkHash8 },
        { name: "UnkHash9", label: "Hash 9 (0x74)", value: formData.UnkHash9 },
        { name: "UnkHash9_1", label: "Hash 9_1 (0x8C)", value: formData.UnkHash9_1 },
        { name: "UnkHash9_2", label: "Hash 9_2 (0xA0)", value: formData.UnkHash9_2 },
        { name: "UnkHash10", label: "Hash 10 (0xB4)", value: formData.UnkHash10 },
        { name: "UnkHash10_1", label: "Hash 10_1 (0xC8)", value: formData.UnkHash10_1 },
        { name: "UnkHash11", label: "Hash 11 (0xCC)", value: formData.UnkHash11 },
        { name: "UnkHash12", label: "Hash 12 (0xD8)", value: formData.UnkHash12 },
        { name: "UnkHash13", label: "Hash 13 (0xE4)", value: formData.UnkHash13 },
        { name: "UnkHash14", label: "Hash 14 (0xE8)", value: formData.UnkHash14 },
        { name: "UnkHash14_1", label: "Hash 14_1 (0xF8)", value: formData.UnkHash14_1 },
        { name: "UnkHash15", label: "Hash 15 (0x118)", value: formData.UnkHash15 },
        { name: "UnkHash15_1", label: "Hash 15_1 (0x11C)", value: formData.UnkHash15_1 },
        { name: "UnkHash16", label: "Hash 16 (0x120)", value: formData.UnkHash16 },
        { name: "UnkHash17", label: "Hash 17 (0x128)", value: formData.UnkHash17 },
        { name: "UnkHash17_1", label: "Hash 17_1 (0x12C)", value: formData.UnkHash17_1 },
        { name: "UnkHash18", label: "Hash 18 (0x130)", value: formData.UnkHash18 },
        { name: "UnkHash19", label: "Hash 19 (0x13C)", value: formData.UnkHash19 },
        { name: "UnkHash20", label: "Hash 20 (0x14C)", value: formData.UnkHash20 },
        { name: "UnkHash21", label: "Hash 21 (0x154)", value: formData.UnkHash21 },
        { name: "UnkHash21_1", label: "Hash 21_1 (0x16C)", value: formData.UnkHash21_1 },
        { name: "UnkHash22", label: "Hash 22 (0x170)", value: formData.UnkHash22 },
        { name: "UnkHash22_0", label: "Hash 22_0 (0x178)", value: formData.UnkHash22_0 },
        { name: "UnkHash22_1", label: "Hash 22_1 (0x17C)", value: formData.UnkHash22_1 },
        { name: "UnkHash23", label: "Hash 23 (0x198)", value: formData.UnkHash23 },
        { name: "UnkHash23_1", label: "Hash 23_1 (0x1B8)", value: formData.UnkHash23_1 },
        { name: "UnkHash24", label: "Hash 24 (0x1BC)", value: formData.UnkHash24 },
      ]
    },
    {
      title: "Additional Unknown IDs",
      fields: [
        { name: "UnkId4", label: "Unknown ID 4 (0x24)", value: formData.UnkId4 },
        { name: "UnkId5", label: "Unknown ID 5 (0x28)", value: formData.UnkId5 },
        { name: "UnkId6", label: "Unknown ID 6 (0x2C)", value: formData.UnkId6 },
        { name: "UnkId7", label: "Unknown ID 7 (0x38)", value: formData.UnkId7 },
        { name: "UnkId8", label: "Unknown ID 8 (0x54)", value: formData.UnkId8 },
        { name: "unkId9", label: "Unknown ID 9 (0xD4)", value: formData.unkId9 },
        { name: "unkId10", label: "Unknown ID 10 (0xEC)", value: formData.unkId10 },
        { name: "unkId11", label: "Unknown ID 11 (0xF0)", value: formData.unkId11 },
        { name: "unkId12", label: "Unknown ID 12 (0x100)", value: formData.unkId12 },
        { name: "unkId12_1", label: "Unknown ID 12_1 (0x104)", value: formData.unkId12_1 },
        { name: "unkId13", label: "Unknown ID 13 (0x108)", value: formData.unkId13 },
        { name: "unkId14", label: "Unknown ID 14 (0x10C)", value: formData.unkId14 },
        { name: "unkId15", label: "Unknown ID 15 (0x150)", value: formData.unkId15 },
        { name: "unkId15_1", label: "Unknown ID 15_1 (0x1A8)", value: formData.unkId15_1 },
        { name: "unkId16", label: "Unknown ID 16 (0x1D4)", value: formData.unkId16 },
      ]
    }
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Character Editor - ID: {characterId}</h3>
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges}
          className="flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          Save Changes
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 pr-4">
          {fieldGroups.map((group, groupIndex) => (
            <Card key={groupIndex}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{group.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <FormFieldGroup
                  fields={group.fields}
                  onChange={handleFieldChange}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

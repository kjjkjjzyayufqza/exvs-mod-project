import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dices } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DualValueProperty } from "@/components/ui/dual-value-property";
import type { NaviListEntry } from "@/models/naviListEntry";
import { NAVI_GUI_HASH_FIELDS } from "@/models/naviListEntry";
import { GuiHashFieldExtras, GuiHashFieldPreview } from "../character-list/GuiHashFieldExtras";
import type { GuiPackPickerItem } from "../character-list/guiPackIndex";
import { SeriesIdPickerItem, SeriesIdPickerPopover } from "../character-list/SeriesIdPickerPopover";
import { countNaviRowsForUniqueId, nextNaviUniqueId } from "./naviListModel";

interface NaviFormProps {
  navi: NaviListEntry;
  naviIndex: number;
  entries: NaviListEntry[];
  seriesIdPickerItems: SeriesIdPickerItem[];
  seriesIdPickerLoading?: boolean;
  seriesIdPickerError?: string | null;
  guiPackItems?: GuiPackPickerItem[];
  guiPackLoading?: boolean;
  guiPackError?: string | null;
  onOpenGuiPackFolder?: (hash: number) => void;
  onExtractGuiPack?: (hash: number, fieldKey: string) => void;
  extractingGuiHash?: number | null;
  onChange: (navi: NaviListEntry) => void;
}

const NUMERIC_GROUPS: Array<{
  titleKey: "navi.group.identity" | "navi.group.sharedHashes" | "navi.group.costumeHashes";
  fields: Array<{ name: keyof NaviListEntry; labelKey: string }>;
}> = [
  {
    titleKey: "navi.group.identity",
    fields: [
      { name: "entryId", labelKey: "navi.field.entryId" },
      { name: "characterUniqueId", labelKey: "navi.field.characterUniqueId" },
      { name: "costumeIndex", labelKey: "navi.field.costumeIndex" },
      { name: "seriesListEntryId", labelKey: "navi.field.seriesListEntryId" },
      { name: "enabledCode", labelKey: "navi.field.enabledCode" },
    ],
  },
  {
    titleKey: "navi.group.sharedHashes",
    fields: [
      { name: "sharedResourceHashA", labelKey: "navi.field.sharedResourceHashA" },
      { name: "sharedResourceHashB", labelKey: "navi.field.sharedResourceHashB" },
      { name: "sharedResourceHashC", labelKey: "navi.field.sharedResourceHashC" },
      { name: "sharedResourceHashD", labelKey: "navi.field.sharedResourceHashD" },
      { name: "sharedResourceHashE", labelKey: "navi.field.sharedResourceHashE" },
    ],
  },
  {
    titleKey: "navi.group.costumeHashes",
    fields: [
      { name: "costumeResourceHashA", labelKey: "navi.field.costumeResourceHashA" },
      { name: "costumeResourceHashB", labelKey: "navi.field.costumeResourceHashB" },
    ],
  },
];

export function NaviForm({
  navi,
  naviIndex,
  entries,
  seriesIdPickerItems,
  seriesIdPickerLoading,
  seriesIdPickerError,
  guiPackItems = [],
  guiPackLoading,
  guiPackError,
  onOpenGuiPackFolder,
  onExtractGuiPack,
  extractingGuiHash = null,
  onChange,
}: NaviFormProps) {
  const { t } = useTranslation("test-lists");
  const [formData, setFormData] = useState<Record<string, number>>({});
  const [displayName, setDisplayName] = useState("");
  const [seriesPickerOpen, setSeriesPickerOpen] = useState(false);
  const [guiPickerField, setGuiPickerField] = useState<string | null>(null);
  const formDataRef = useRef<Record<string, number>>({});
  const displayNameRef = useRef("");

  useEffect(() => {
    const initial: Record<string, number> = {};
    for (const [key, value] of Object.entries(navi as unknown as Record<string, unknown>)) {
      if (typeof value === "number") initial[key] = value;
    }
    setFormData(initial);
    formDataRef.current = initial;
    setDisplayName(navi.displayName ?? "");
    displayNameRef.current = navi.displayName ?? "";
  }, [navi, naviIndex]);

  const applyChanges = useCallback(
    (nextNumeric: Record<string, number>, nextName: string) => {
      onChange({
        ...navi,
        ...nextNumeric,
        displayName: nextName,
      } as NaviListEntry);
    },
    [navi, onChange],
  );

  const handleFieldChange = useCallback(
    (fieldName: string, value: number) => {
      setFormData((prev) => {
        const next = { ...prev, [fieldName]: value };
        formDataRef.current = next;
        applyChanges(next, displayNameRef.current);
        return next;
      });
    },
    [applyChanges],
  );

  const sharedRowCount = useMemo(
    () =>
      countNaviRowsForUniqueId(
        entries,
        formData.characterUniqueId ?? 0,
        navi.entryId,
      ),
    [entries, formData.characterUniqueId, navi.entryId],
  );

  const handlePickNewUniqueId = useCallback(() => {
    const nextId = nextNaviUniqueId(entries);
    handleFieldChange("characterUniqueId", nextId);
    toast.success(t("navi.pickedUnique"), { description: t("navi.setTo", { id: nextId }) });
  }, [entries, handleFieldChange]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold">
          {t("navi.editTitle", { uniqueId: formData.characterUniqueId ?? 0, costume: formData.costumeIndex ?? 0 })}
        </div>
        <div className="text-xs text-muted-foreground">{t("navi.editsStaged")}</div>
      </div>
      <Separator className="mb-4" />
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-6 pr-2">
          <div className="space-y-2">
            <Label htmlFor="navi-display-name">{t("navi.displayName")}</Label>
            <Input
              id="navi-display-name"
              value={displayName}
              onChange={(event) => {
                const next = event.target.value;
                setDisplayName(next);
                displayNameRef.current = next;
                applyChanges(formDataRef.current, next);
              }}
            />
          </div>

          {NUMERIC_GROUPS.map((group) => (
            <div key={group.titleKey} className="space-y-3">
              <div className="font-bold text-foreground">{t(group.titleKey)}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {group.fields.map((field) => {
                  const fieldName = String(field.name);
                  const isHash = (NAVI_GUI_HASH_FIELDS as readonly string[]).includes(fieldName);
                  return (
                    <DualValueProperty
                      key={fieldName}
                      label={t(field.labelKey)}
                      preview={
                        isHash ? (
                          <GuiHashFieldPreview
                            value={formData[fieldName] ?? 0}
                            items={guiPackItems}
                          />
                        ) : undefined
                      }
                      labelExtra={
                        fieldName === "seriesListEntryId" ? (
                          <SeriesIdPickerPopover
                            onSelect={(id) => handleFieldChange("seriesListEntryId", id)}
                            items={seriesIdPickerItems}
                            selectedValue={formData.seriesListEntryId}
                            isLoading={seriesIdPickerLoading}
                            error={seriesIdPickerError}
                            open={seriesPickerOpen}
                            onOpenChange={setSeriesPickerOpen}
                          />
                        ) : fieldName === "characterUniqueId" ? (
                          <TooltipProvider delayDuration={100}>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {t("navi.otherCostume", { count: sharedRowCount })}
                              </span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={handlePickNewUniqueId}
                                    aria-label={t("navi.pickUniqueAria")}
                                  >
                                    <Dices className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">{t("navi.pickUniqueTooltip")}</TooltipContent>
                              </Tooltip>
                            </div>
                          </TooltipProvider>
                        ) : isHash ? (
                          <GuiHashFieldExtras
                            fieldKey={fieldName}
                            value={formData[fieldName] ?? 0}
                            items={guiPackItems}
                            isLoading={guiPackLoading}
                            error={guiPackError}
                            open={guiPickerField === fieldName}
                            onOpenChange={(open) => setGuiPickerField(open ? fieldName : null)}
                            onSelect={(hash) => handleFieldChange(fieldName, hash >>> 0)}
                            onOpenFolder={onOpenGuiPackFolder}
                            onExtract={onExtractGuiPack}
                            extractingHash={extractingGuiHash}
                          />
                        ) : undefined
                      }
                      value={formData[fieldName] ?? 0}
                      property={fieldName}
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
                      onCommit={(nextValue) => handleFieldChange(fieldName, nextValue)}
                      onLiveIntInputFocus={
                        fieldName === "seriesListEntryId" ? () => setSeriesPickerOpen(true) : undefined
                      }
                      onLiveIntInputClick={
                        fieldName === "seriesListEntryId" ? () => setSeriesPickerOpen(true) : undefined
                      }
                    />
                  );
                })}
              </div>
              <Separator />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

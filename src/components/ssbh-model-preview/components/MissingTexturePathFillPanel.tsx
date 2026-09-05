import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SceneTextureSelectPicker } from "@/page/SceneEdit/components/SceneTextureSelectPicker";
import {
  missingTexturePathSlotKey,
  type MissingTexturePathSlotRef,
} from "../store/numatbTemplateStoreHelpers";

interface MissingTexturePathFillPanelProps {
  slots: MissingTexturePathSlotRef[];
  onFillSlot: (slot: MissingTexturePathSlotRef, basename: string) => void;
  title?: string;
  className?: string;
  getSlotMessage?: (slot: MissingTexturePathSlotRef) => string | null;
}

function profileLabel(profile: MissingTexturePathSlotRef["profile"]): string {
  return profile === "maya" ? "Maya" : "Nust";
}

export function MissingTexturePathFillPanel({
  slots,
  onFillSlot,
  title,
  className,
  getSlotMessage,
}: MissingTexturePathFillPanelProps) {
  const { t } = useTranslation("ssbh-motion");
  const heading = title ?? t("missingTextures.fillAll");
  const slotEntries = useMemo(
    () =>
      slots.map((slot) => ({
        slot,
        key: missingTexturePathSlotKey(slot),
      })),
    [slots],
  );

  const slotKeySignature = useMemo(
    () => slotEntries.map(({ key }) => key).join("\0"),
    [slotEntries],
  );

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(slots.map(missingTexturePathSlotKey)),
  );
  const previousSlotKeysRef = useRef(
    new Set(slots.map(missingTexturePathSlotKey)),
  );
  const [bulkValue, setBulkValue] = useState("");

  useEffect(() => {
    const validKeys = new Set(
      slotKeySignature ? slotKeySignature.split("\0") : [],
    );
    const previousSlotKeys = previousSlotKeysRef.current;
    setSelectedKeys((prev) => {
      const next = new Set<string>();
      for (const key of validKeys) {
        if (prev.has(key) || !previousSlotKeys.has(key)) {
          next.add(key);
        }
      }
      return next;
    });
    previousSlotKeysRef.current = validKeys;
  }, [slotKeySignature]);

  if (slots.length === 0) {
    return null;
  }

  const allSelected =
    slotEntries.length > 0 && slotEntries.every(({ key }) => selectedKeys.has(key));
  const someSelected = slotEntries.some(({ key }) => selectedKeys.has(key));
  const selectedCount = slotEntries.filter(({ key }) => selectedKeys.has(key)).length;
  const bulkValueTrimmed = bulkValue.trim();
  const canApplySelected = selectedCount > 0 && bulkValueTrimmed.length > 0;

  const toggleSlotSelected = (key: string, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedKeys(
      checked ? new Set(slotEntries.map(({ key }) => key)) : new Set(),
    );
  };

  const applyBulkValueToSelected = () => {
    if (!canApplySelected) return;
    for (const { slot, key } of slotEntries) {
      if (selectedKeys.has(key)) {
        onFillSlot(slot, bulkValueTrimmed);
      }
    }
  };

  return (
    <div className={cn("space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3", className)}>
      <p className="text-[11px] text-destructive">{heading}</p>

      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2">
        <div className="min-w-0 flex-1">
          <SceneTextureSelectPicker
            value={bulkValue}
            paramId="__bulk_texture_apply__"
            onChange={setBulkValue}
            className="w-full"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 shrink-0 text-[10px]"
          disabled={!canApplySelected}
          onClick={applyBulkValueToSelected}
        >
          {t("missingTextures.applySelected", { count: selectedCount })}
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-border/60 bg-background">
        <div className="grid min-h-7 grid-cols-[auto_minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-2 border-b border-border/40 bg-muted/30 px-3 py-1">
          <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(value) => toggleSelectAll(value === true)}
            aria-label={t("missingTextures.selectAll")}
            className="h-3.5 w-3.5"
          />
          <span className="text-[10px] font-medium text-muted-foreground">{t("missingTextures.parameter")}</span>
          <span className="text-[10px] font-medium text-muted-foreground">{t("missingTextures.texture")}</span>
        </div>

        {slotEntries.map(({ slot, key }) => (
          <div
            key={key}
            className="grid min-h-8 grid-cols-[auto_minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-2 border-b border-border/40 px-3 py-1.5 last:border-b-0 hover:bg-muted/20"
          >
            <Checkbox
              checked={selectedKeys.has(key)}
              onCheckedChange={(value) => toggleSlotSelected(key, value === true)}
              aria-label={t("missingTextures.selectParam", { paramId: slot.paramId })}
              className="h-3.5 w-3.5"
            />
            <div className="min-w-0" data-i18n-ignore="">
              <Label className="font-mono text-[11px] font-normal text-foreground">{slot.paramId}</Label>
              <p className="truncate text-[9px] leading-tight text-muted-foreground">
                {profileLabel(slot.profile)} · {slot.materialLabel}
              </p>
            </div>
            <div className="min-w-0 justify-self-stretch">
              <SceneTextureSelectPicker
                value={slot.value}
                paramId={slot.paramId}
                onChange={(basename) => onFillSlot(slot, basename)}
              />
              {getSlotMessage?.(slot) ? (
                <p className="mt-1 wrap-break-word font-mono text-[9px] leading-tight text-destructive" data-i18n-ignore="">
                  {getSlotMessage(slot)}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

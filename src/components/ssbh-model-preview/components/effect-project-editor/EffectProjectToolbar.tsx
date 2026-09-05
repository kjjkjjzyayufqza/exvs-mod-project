import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Props = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  visibleCount: number;
  totalCount: number;
  onAddRow: () => void;
  disabled: boolean;
  /** Applies to all int32 / hex fields (aleo_1, aleo_2, bone_index, model_id). */
  displayEndian: "le" | "be";
  onDisplayEndianChange: (value: "le" | "be") => void;
};

export function EffectProjectToolbar({
  searchQuery,
  onSearchChange,
  visibleCount,
  totalCount,
  onAddRow,
  disabled,
  displayEndian,
  onDisplayEndianChange,
}: Props) {
  const { t } = useTranslation("ssbh-motion");
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">{t("effectProject.int32Endian")}</Label>
        <ToggleGroup
          type="single"
          value={displayEndian}
          onValueChange={(v) => {
            if (v === "le" || v === "be") onDisplayEndianChange(v);
          }}
          className="h-8 justify-start"
        >
          <ToggleGroupItem value="be" className="h-8 px-2.5 text-[10px]" aria-label={t("effectProject.showBe")}>
            BE
          </ToggleGroupItem>
          <ToggleGroupItem value="le" className="h-8 px-2.5 text-[10px]" aria-label={t("effectProject.showLe")}>
            LE
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="relative min-w-48 flex-1">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          placeholder={t("effectProject.filterPlaceholder")}
          title={t("effectProject.filterTitle")}
          className="h-8 border-border/70 pl-7 font-mono text-[10px] shadow-none"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={t("effectProject.filterAria")}
        />
      </div>
      <Badge variant="secondary" className="h-7 px-1.5 font-mono text-[9px] font-normal tabular-nums">
        {searchQuery.trim().length > 0 ? `${visibleCount}/${totalCount}` : `${totalCount}`}
      </Badge>
      <Button type="button" size="sm" className="h-8 gap-1 px-2 text-[10px]" disabled={disabled} onClick={onAddRow}>
        <Plus className="h-3 w-3" />
        {t("effectProject.addRow")}
      </Button>
    </div>
  );
}

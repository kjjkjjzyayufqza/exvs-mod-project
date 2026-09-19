import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { unitLabel, type UnitNameMap } from "./triadRouteWorkspace";
import {
  asCharacterId,
  filterCharacterListUnits,
} from "./characterListUnitCatalog";

type UnitSelectProps = {
  value: number;
  units: UnitNameMap;
  disabled?: boolean;
  placeholder: string;
  onChange: (unitId: number) => void;
};

/**
 * Suit picker keyed by Character List Character ID (`entryId`).
 *
 * Labels match the Character List cards (name + `ID: {entryId}`). Search uses
 * the same Character ID / string-field matching as that tab. A numeric field
 * remains so ids that are not in the list can still be typed.
 */
export function UnitSelect({ value, units, disabled, placeholder, onChange }: UnitSelectProps) {
  const { t } = useTranslation("test-triad-route");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedId = asCharacterId(value);

  const options = useMemo(
    () => filterCharacterListUnits(units, query),
    [units, query],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selectedId ? unitLabel(units, selectedId) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-md p-2">
        <Input
          autoFocus
          value={query}
          placeholder={placeholder}
          onChange={(event) => setQuery(event.target.value)}
          className="mb-2 h-8"
        />
        <ScrollArea className="h-56 pr-2">
          <div className="flex flex-col gap-0.5">
            {options.map((option) => {
              const selected = option.characterId === selectedId;
              return (
                <button
                  key={option.characterId}
                  type="button"
                  onClick={() => {
                    onChange(option.characterId);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent",
                    selected && "bg-accent",
                  )}
                >
                  <Check
                    className={cn("size-3 shrink-0", selected ? "opacity-100" : "opacity-0")}
                  />
                  <span className="min-w-0 truncate">{option.name}</span>
                  <span className="ml-auto shrink-0 font-mono text-muted-foreground">
                    ID: {option.characterId}
                  </span>
                </button>
              );
            })}
            {options.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">{placeholder}</p>
            ) : null}
          </div>
        </ScrollArea>
        <Input
          type="number"
          value={selectedId || ""}
          placeholder={t("common.unitId")}
          onChange={(event) => onChange(asCharacterId(Number(event.target.value) || 0))}
          className="mt-2 h-8"
        />
      </PopoverContent>
    </Popover>
  );
}

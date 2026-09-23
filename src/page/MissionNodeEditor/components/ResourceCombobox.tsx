import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AliasKind, MissionGraph } from "@/services/missionGraph/graph";
import { describeHash, formatHash, parseHashInput, resourceOptions, type ResourceCatalog } from "@/services/missionGraph/resources";

const controlClass = "h-8 text-xs shadow-none";

function formatResourceId(kind: AliasKind, value: number): string {
  if (kind === "unit") return String(value >>> 0);
  return formatHash(value);
}

export function ResourceCombobox({
  label, kind, value, graph, catalog, onChange, onAlias,
}: {
  label: string;
  kind: AliasKind;
  value: number;
  graph: MissionGraph;
  catalog: ResourceCatalog;
  onChange: (value: number) => void;
  onAlias?: (alias: string) => void;
}) {
  const { t } = useTranslation("mission-node-editor");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const picked = useRef(false);
  const current = describeHash(graph, kind, value, catalog);
  const idText = formatResourceId(kind, current.value);
  const hasName = current.evidence === "named" && current.label !== idText && current.label !== formatHash(current.value);
  const parsed = parseHashInput(query);
  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return resourceOptions(graph, kind, catalog).filter((option) => {
      if (!needle) return true;
      return option.label.toLowerCase().includes(needle)
        || (option.keywords?.toLowerCase().includes(needle) ?? false)
        || formatHash(option.value).includes(needle)
        || String(option.value).includes(needle);
    });
  }, [catalog, graph, kind, query]);
  const typedHash = parsed !== null && !options.some((option) => option.value === (parsed >>> 0)) ? parsed >>> 0 : null;

  function pick(next: number) {
    picked.current = true;
    onChange(next >>> 0);
    setOpen(false);
  }

  function onOpenChange(next: boolean) {
    if (!next && !picked.current) {
      const committed = parseHashInput(query);
      if (committed !== null) onChange(committed >>> 0);
    }
    if (!next) {
      picked.current = false;
      setQuery("");
    }
    setOpen(next);
  }

  return <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
    <span>{label}</span>
    <div className="flex flex-col gap-1">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            className="h-auto min-h-8 w-full items-start justify-between gap-2 px-2 py-1.5 text-left text-xs font-normal shadow-none"
            title={hasName ? `${current.label} (${idText})` : idText}
            onFocus={() => setOpen(true)}
          >
            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
              {hasName && <span className="w-full whitespace-normal break-words leading-snug text-foreground">{current.label}</span>}
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{idText}</span>
            </span>
            <ChevronsUpDown className="mt-0.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(32rem,calc(100vw-1.5rem))] min-w-[var(--radix-popover-trigger-width)] p-0"
          align="end"
          collisionPadding={8}
        >
          <Command shouldFilter={false}>
            <CommandInput
              aria-label={t(kind === "unit" ? "resource.searchUnit" : "resource.search")}
              placeholder={t(kind === "unit" ? "resource.searchUnit" : "resource.search")}
              className="h-8 text-xs"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-72">
              <CommandEmpty className="py-3 text-xs">{t("resource.noMatches")}</CommandEmpty>
              <CommandGroup>
                {typedHash !== null && <CommandItem value={`typed-${typedHash}`} className="text-xs" onSelect={() => pick(typedHash)}>
                  <Check className="opacity-0" />
                  <span className="font-mono tabular-nums">{formatResourceId(kind, typedHash)}</span>
                </CommandItem>}
                {options.map((option) => <CommandItem
                  key={`${option.kind}-${option.value}`}
                  value={`${option.label} ${formatResourceId(kind, option.value)}`}
                  className="items-start py-1.5 text-xs"
                  onSelect={() => pick(option.value)}
                >
                  <Check className={cn("mt-0.5", option.value === (value >>> 0) ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{option.label}</span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{formatResourceId(kind, option.value)}</span>
                </CommandItem>)}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Badge
        variant="outline"
        className={cn(
          "h-5 w-fit px-1.5 text-[10px] font-normal",
          current.evidence === "named" ? "border-chart-2/40 text-chart-2" : "text-muted-foreground",
        )}
      >
        {current.evidence === "named" ? t("resource.named") : t("resource.notChecked")}
      </Badge>
      {onAlias && <Input
        className={cn(controlClass, "mt-1")}
        aria-label={t("resource.alias")}
        placeholder={t("resource.aliasPlaceholder")}
        defaultValue={current.source === "alias" ? current.label : ""}
        onBlur={(event) => onAlias(event.target.value)}
      />}
    </div>
  </div>;
}

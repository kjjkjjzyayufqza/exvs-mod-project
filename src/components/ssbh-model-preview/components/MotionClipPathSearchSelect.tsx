import {
  useDeferredValue,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
  type RefObject,
} from "react";
import { Check, ChevronDown, FolderOpen, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  buildMotionClipCatalog,
  filterMotionClipCatalog,
  findMotionClipGroup,
  formatMotionClipTrigger,
  type MotionClipEntry,
  type MotionClipFolderGroup,
} from "./motionClipPathGroups";

type MotionClipPathSearchSelectProps = {
  paths: readonly string[];
  value: string | null;
  onChange: (path: string) => void;
  disabled?: boolean;
  className?: string;
};

export function MotionClipPathSearchSelect({
  paths,
  value,
  onChange,
  disabled = false,
  className,
}: MotionClipPathSearchSelectProps) {
  const { t } = useTranslation("ssbh-motion");
  const reactId = useId();
  const instanceId = `motion-clip-${reactId.replace(/:/g, "")}`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  const searchInputId = `${instanceId}-search`;
  const triggerId = `${instanceId}-trigger`;
  const selectedOptionRef = useRef<HTMLButtonElement | null>(null);
  const selectedFolderRef = useRef<HTMLButtonElement | null>(null);

  const catalog = useMemo(() => buildMotionClipCatalog(paths), [paths]);
  const visibleGroups = useMemo(
    () => filterMotionClipCatalog(catalog, deferredQuery),
    [catalog, deferredQuery],
  );
  const qTrim = deferredQuery.trim();
  const searching = qTrim.length > 0;

  const activeGroup = useMemo(
    () => findMotionClipGroup(catalog.groups, value),
    [catalog.groups, value],
  );
  const trigger = useMemo(
    () => formatMotionClipTrigger({ groups: catalog.groups, path: value }),
    [catalog.groups, value],
  );

  useLayoutEffect(() => {
    if (!open) return;
    if (searching) {
      setExpandedId(visibleGroups[0]?.id ?? null);
      return;
    }
    setExpandedId(activeGroup?.id ?? visibleGroups[0]?.id ?? null);
    // Only re-sync expansion when the popover opens or the search text changes.
    // visibleGroups / value updates must not yank the user back to the selected folder.
  }, [open, qTrim, searching]);

  useLayoutEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      selectedOptionRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
    return () => cancelAnimationFrame(id);
  }, [open, deferredQuery]);

  const pickClip = (path: string) => {
    onChange(path);
    setOpen(false);
    setQuery("");
  };

  const toggleFolder = (group: MotionClipFolderGroup) => {
    setExpandedId((current) => (current === group.id ? null : group.id));
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={triggerId}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? `${instanceId}-listbox` : undefined}
          disabled={disabled}
          title={value ?? undefined}
          className={cn(
            "h-auto min-h-8 w-full items-center justify-between gap-2 px-2 py-1 text-left transition-colors duration-200",
            "hover:bg-accent/70 active:scale-[0.99] focus-visible:ring-1",
            className,
          )}
        >
          <span className="flex min-w-0 flex-1 items-start gap-1.5">
            <FolderOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block break-all font-mono text-[10px] font-medium leading-snug" data-i18n-ignore="">
                {trigger.title}
              </span>
              {trigger.subtitle ? (
                <span className="mt-0.5 block truncate font-mono text-[9px] tabular-nums text-muted-foreground" data-i18n-ignore="">
                  {trigger.subtitle}
                </span>
              ) : null}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[min(100vw-24px,20rem)] overflow-hidden p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(searchInputId)?.focus();
        }}
      >
        <div className="flex items-center gap-1.5 border-b border-border/70 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Label htmlFor={searchInputId} className="sr-only">
            {t("clipSearch.searchLabel")}
          </Label>
          <Input
            id={searchInputId}
            name={`${instanceId}-search`}
            placeholder={t("clipSearch.searchPlaceholder", {
              clips: paths.length,
              folders: catalog.groups.length,
            })}
            className="h-7 border-0 bg-transparent px-0 text-[11px] shadow-none focus-visible:ring-0"
            value={query}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const first = visibleGroups[0]?.clips[0];
              if (!first) return;
              event.preventDefault();
              pickClip(first.path);
            }}
          />
        </div>
        <ScrollArea className="h-[min(22rem,50vh)]">
          <div id={`${instanceId}-listbox`} className="p-1" role="listbox" aria-label={t("clipSearch.listLabel")}>
            {visibleGroups.length === 0 ? (
              <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">{t("clipSearch.noMatch")}</p>
            ) : (
              visibleGroups.map((group) => {
                const expanded = searching || expandedId === group.id;
                return (
                  <FolderBlock
                    key={group.id || group.label}
                    group={group}
                    expanded={expanded}
                    selectedPath={value}
                    selectedFolderRef={group.id === activeGroup?.id ? selectedFolderRef : undefined}
                    selectedOptionRef={selectedOptionRef}
                    onToggle={() => toggleFolder(group)}
                    onPick={pickClip}
                  />
                );
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function FolderBlock({
  group,
  expanded,
  selectedPath,
  selectedFolderRef,
  selectedOptionRef,
  onToggle,
  onPick,
}: {
  group: MotionClipFolderGroup;
  expanded: boolean;
  selectedPath: string | null;
  selectedFolderRef?: Ref<HTMLButtonElement>;
  selectedOptionRef: RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
  onPick: (path: string) => void;
}) {
  const { t } = useTranslation("ssbh-motion");
  const containsSelected = group.clips.some((clip) => clip.path === selectedPath);

  return (
    <section className="mb-0.5">
      <button
        ref={selectedFolderRef}
        type="button"
        aria-expanded={expanded}
        aria-label={t("clipSearch.folderAria", { label: group.label, count: group.clips.length })}
        className={cn(
          "flex w-full items-center gap-1 rounded-sm px-1.5 py-1 text-left transition-colors duration-200",
          "hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          containsSelected && "bg-primary/10",
        )}
        style={{ paddingLeft: `${6 + group.depth * 10}px` }}
        onClick={onToggle}
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200",
            !expanded && "-rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] tabular-nums" data-i18n-ignore="">
          {group.label}
        </span>
        <span className="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground">{group.clips.length}</span>
      </button>
      {expanded
        ? group.clips.map((clip) => (
            <ClipRow
              key={clip.path}
              clip={clip}
              group={group}
              selected={clip.path === selectedPath}
              optionRef={clip.path === selectedPath ? selectedOptionRef : undefined}
              onPick={onPick}
            />
          ))
        : null}
    </section>
  );
}

function ClipRow({
  clip,
  group,
  selected,
  optionRef,
  onPick,
}: {
  clip: MotionClipEntry;
  group: MotionClipFolderGroup;
  selected: boolean;
  optionRef?: Ref<HTMLButtonElement>;
  onPick: (path: string) => void;
}) {
  return (
    <button
      ref={optionRef}
      type="button"
      role="option"
      aria-selected={selected}
      title={clip.path}
      className={cn(
        "flex w-full items-start gap-1.5 rounded-sm px-2 py-1 text-left transition-colors duration-200",
        "hover:bg-accent/80 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        selected && "bg-accent",
      )}
      style={{ paddingLeft: `${18 + group.depth * 10}px` }}
      onClick={() => onPick(clip.path)}
    >
      <Check className={cn("mt-0.5 h-3 w-3 shrink-0", selected ? "opacity-100" : "opacity-0")} />
      <span className="min-w-0 break-all font-mono text-[10px] leading-snug" data-i18n-ignore="">
        {clip.fileName}
      </span>
    </button>
  );
}

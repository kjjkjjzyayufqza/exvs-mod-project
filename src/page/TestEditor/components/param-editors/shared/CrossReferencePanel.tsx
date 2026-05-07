import { ExternalLink, Link2, ChevronRight, AlertCircle } from "lucide-react";
import { formatHash } from "@/models/commandTable";
import type { CrossReference, ParamKind } from "@/lib/gameAlgorithms/crossParamResolver";
import { PARAM_KIND_LABELS } from "@/lib/gameAlgorithms/crossParamResolver";
import { PropertyGroup } from "./PropertyGroup";

interface CrossReferencePanelProps {
  references: CrossReference[];
  onNavigateToEntry?: (kind: ParamKind, hash: number) => void;
  className?: string;
}

export function CrossReferencePanel({
  references,
  onNavigateToEntry,
  className,
}: CrossReferencePanelProps) {
  if (references.length === 0) {
    return (
      <div
        className={`rounded-md border bg-card p-3 text-center text-[11px] text-muted-foreground ${className ?? ""}`}
      >
        No cross-references
      </div>
    );
  }

  const grouped = new Map<ParamKind, CrossReference[]>();
  for (const ref of references) {
    if (!grouped.has(ref.targetKind)) {
      grouped.set(ref.targetKind, []);
    }
    grouped.get(ref.targetKind)!.push(ref);
  }

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {Array.from(grouped.entries()).map(([kind, refs]) => (
        <PropertyGroup
          key={kind}
          label={`${PARAM_KIND_LABELS[kind]} (${refs.length})`}
          defaultOpen
        >
          {refs.map((ref) => (
            <CrossReferenceRow
              key={`${ref.sourceField}-${ref.targetHash}`}
              reference={ref}
              onNavigate={onNavigateToEntry}
            />
          ))}
        </PropertyGroup>
      ))}
    </div>
  );
}

interface CrossReferenceRowProps {
  reference: CrossReference;
  onNavigate?: (kind: ParamKind, hash: number) => void;
}

function camelToLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function CrossReferenceRow({ reference, onNavigate }: CrossReferenceRowProps) {
  const resolved = reference.targetEntry !== undefined;

  return (
    <div className="flex items-center gap-2 rounded border bg-muted/10 px-2 py-1.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          {resolved ? (
            <Link2 className="h-3 w-3 shrink-0 text-green-400" />
          ) : (
            <AlertCircle className="h-3 w-3 shrink-0 text-yellow-500" />
          )}
          <span className="truncate text-[10px] text-muted-foreground">
            {camelToLabel(reference.sourceField)}
          </span>
        </div>
        <div className="mt-0.5 font-mono text-[11px]">
          {formatHash(reference.targetHash)}
        </div>
      </div>
      {resolved && onNavigate && (
        <button
          type="button"
          className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-blue-400 hover:bg-blue-500/10"
          onClick={() => onNavigate(reference.targetKind, reference.targetHash)}
        >
          Open
          <ChevronRight className="h-3 w-3" />
        </button>
      )}
      {!resolved && (
        <span className="text-[9px] text-yellow-500/80">Not loaded</span>
      )}
    </div>
  );
}

interface ReverseReferencePanelProps {
  label: string;
  references: Array<{ index: number; entryId: number }>;
  onNavigateToEntry?: (index: number) => void;
  className?: string;
}

export function ReverseReferencePanel({
  label,
  references,
  onNavigateToEntry,
  className,
}: ReverseReferencePanelProps) {
  if (references.length === 0) return null;

  return (
    <PropertyGroup
      label={`${label} (${references.length})`}
      defaultOpen={references.length <= 10}
      className={className}
    >
      {references.map((ref) => (
        <div
          key={ref.index}
          className="flex items-center justify-between gap-2 rounded border bg-muted/10 px-2 py-1"
        >
          <span className="font-mono text-[11px]">
            [{ref.index}] {formatHash(ref.entryId)}
          </span>
          {onNavigateToEntry && (
            <button
              type="button"
              className="text-[10px] text-blue-400 hover:underline"
              onClick={() => onNavigateToEntry(ref.index)}
            >
              Go to
            </button>
          )}
        </div>
      ))}
    </PropertyGroup>
  );
}

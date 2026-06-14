import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpToLine,
  Copy,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MergedRegistryEntry } from "@/services/resourceRegistry/types";
import { cn } from "@/lib/utils";

export interface ResourceRegistryTableActions {
  onCopySeed: (seed: string) => void;
  onCopyHash: (hashHex: string) => void;
  onEdit: (entry: MergedRegistryEntry) => void;
  onDelete: (id: string) => void;
  onPromote: (id: string) => void;
}

interface ResourceRegistryDataTableProps {
  rows: MergedRegistryEntry[];
  actions: ResourceRegistryTableActions;
}

const VIRTUALIZE_ROW_THRESHOLD = 80;
const ROW_HEIGHT_ESTIMATE = 40;

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ArrowUp className="ml-1 h-3 w-3" />;
  if (sorted === "desc") return <ArrowDown className="ml-1 h-3 w-3" />;
  return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
}

export function ResourceRegistryDataTable({ rows, actions }: ResourceRegistryDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "category", desc: false }]);

  const columns = useMemo<ColumnDef<MergedRegistryEntry>[]>(
    () => [
      {
        id: "source",
        accessorKey: "sourceLayer",
        header: "Src",
        size: 52,
        cell: ({ row }) => (
          <Badge
            variant={row.original.sourceLayer === "workspace" ? "default" : "secondary"}
            className="text-[10px] px-1.5"
          >
            {row.original.sourceLayer === "workspace" ? "WS" : "G"}
          </Badge>
        ),
      },
      {
        id: "category",
        accessorKey: "category",
        header: "Category",
        size: 88,
        cell: ({ row }) => (
          <span className="text-xs font-mono">{row.original.category}</span>
        ),
      },
      {
        id: "slot",
        accessorKey: "slot",
        header: "Slot",
        size: 100,
        cell: ({ row }) => (
          <span className="text-xs font-mono">{row.original.slot}</span>
        ),
      },
      {
        id: "displayName",
        accessorFn: (row) => row.displayName ?? "",
        header: "Name",
        size: 140,
        cell: ({ row }) => (
          <span className="text-xs truncate max-w-[160px] block">
            {row.original.displayName ?? "-"}
          </span>
        ),
      },
      {
        id: "seed",
        accessorKey: "seed",
        header: "Seed",
        cell: ({ row }) => (
          <span className="font-mono text-xs break-all">{row.original.seed}</span>
        ),
      },
      {
        id: "hashHex",
        accessorKey: "hashHex",
        header: "Hash",
        size: 100,
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-muted-foreground">
            {row.original.hashHex}
          </span>
        ),
      },
      {
        id: "hashInt32",
        accessorKey: "hashInt32",
        header: "int32",
        size: 110,
        cell: ({ row }) => (
          <span className="font-mono text-[11px] tabular-nums">{row.original.hashInt32}</span>
        ),
      },
      {
        id: "notes",
        accessorFn: (row) => row.notes ?? "",
        header: "Notes",
        size: 160,
        cell: ({ row }) => (
          <span className="text-[10px] text-muted-foreground line-clamp-2 max-w-[180px]">
            {row.original.notes ?? ""}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        size: 140,
        enableSorting: false,
        cell: ({ row }) => {
          const entry = row.original;
          const isWorkspace = entry.sourceLayer === "workspace";
          return (
            <div className="flex items-center justify-end gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Copy seed"
                onClick={() => actions.onCopySeed(entry.seed)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Copy hash"
                onClick={() => actions.onCopyHash(entry.hashHex)}
              >
                <span className="text-[9px] font-mono">0x</span>
              </Button>
              {isWorkspace ? (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Promote to global"
                    onClick={() => actions.onPromote(entry.id)}
                  >
                    <ArrowUpToLine className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Edit"
                    onClick={() => actions.onEdit(entry)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    title="Delete"
                    onClick={() => actions.onDelete(entry.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="View global entry"
                  onClick={() => actions.onEdit(entry)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [actions],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => `${row.sourceLayer}-${row.id}`,
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const getScrollElement = useCallback(() => scrollRef.current, []);
  const tableRows = table.getRowModel().rows;
  const shouldVirtualize = tableRows.length > VIRTUALIZE_ROW_THRESHOLD;
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 12,
  });
  const virtualRows = shouldVirtualize ? rowVirtualizer.getVirtualItems() : [];
  const firstVirtualRow = virtualRows[0];
  const lastVirtualRow = virtualRows[virtualRows.length - 1];
  const paddingTop = firstVirtualRow?.start ?? 0;
  const paddingBottom =
    lastVirtualRow === undefined
      ? 0
      : Math.max(0, rowVirtualizer.getTotalSize() - lastVirtualRow.end);
  const renderedRows = shouldVirtualize
    ? virtualRows
        .map((virtualRow) => tableRows[virtualRow.index])
        .filter((row): row is (typeof tableRows)[number] => row !== undefined)
    : tableRows;

  return (
    <div ref={scrollRef} className="h-full min-h-[240px] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                  className="h-8 px-2 text-[11px]"
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      type="button"
                      className={cn(
                        "flex cursor-pointer items-center font-medium hover:text-foreground",
                        header.column.getIsSorted() ? "text-foreground" : "",
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <SortIcon sorted={header.column.getIsSorted()} />
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {tableRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                No entries match the current filters.
              </TableCell>
            </TableRow>
          ) : (
            <>
              {paddingTop > 0 ? (
                <TableRow aria-hidden="true">
                  <TableCell colSpan={columns.length} className="p-0" style={{ height: paddingTop }} />
                </TableRow>
              ) : null}
              {renderedRows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/30">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-1.5 px-2 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {paddingBottom > 0 ? (
                <TableRow aria-hidden="true">
                  <TableCell colSpan={columns.length} className="p-0" style={{ height: paddingBottom }} />
                </TableRow>
              ) : null}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

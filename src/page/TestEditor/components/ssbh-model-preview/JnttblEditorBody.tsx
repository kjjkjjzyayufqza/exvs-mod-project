import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bug, FolderOpen, Plus, Trash2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { JnttblEditorDocument } from "./jnttblIoService";
import { ssbhReadNusktbBoneNames } from "./jnttblIoService";
import { BoneIndexSearchSelect } from "./components/BoneIndexSearchSelect";
import { debugFillMissingJnttblEntries } from "./jnttblDebugFill";

function formatHashHex32(v: number): string {
  return (v >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function parseHashHex32(s: string): number {
  const t = s.trim().replace(/^0x/i, "");
  if (!t) {
    throw new Error("Hash id is empty");
  }
  if (!/^[0-9a-fA-F]{1,8}$/.test(t)) {
    throw new Error("Hash id must be 1-8 hex digits");
  }
  return Number.parseInt(t, 16) >>> 0;
}

function JnttblHashField({
  hashId,
  disabled,
  id,
  name,
  onCommit,
}: {
  hashId: number;
  disabled: boolean;
  id: string;
  name: string;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(() => formatHashHex32(hashId));
  useEffect(() => {
    setText(formatHashHex32(hashId));
  }, [hashId]);

  return (
    <Input
      id={id}
      name={name}
      className="h-8 font-mono text-[11px]"
      disabled={disabled}
      autoComplete="off"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        try {
          const parsed = parseHashHex32(text);
          onCommit(parsed);
        } catch (err) {
          toast.error(String(err));
          setText(formatHashHex32(hashId));
        }
      }}
    />
  );
}

type JnttblEditorBodyProps = {
  data: JnttblEditorDocument;
  onChange: (next: JnttblEditorDocument) => void;
  disabled?: boolean;
};

function formIdPart(reactId: string): string {
  return reactId.replace(/:/g, "");
}

export function JnttblEditorBody({
  data,
  onChange,
  disabled = false,
}: JnttblEditorBodyProps) {
  const reactId = useId();
  const fid = formIdPart(reactId);
  const dataRef = useRef(data);
  dataRef.current = data;

  const pickNusktb = useCallback(async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "NUsktb", extensions: ["nusktb"] }],
    });
    if (typeof selected !== "string" || !selected.trim()) return;
    const path = selected.trim();
    const d = dataRef.current;
    try {
      const names = await ssbhReadNusktbBoneNames(path);
      const boneCount = Math.min(0xffffffff, names.length) >>> 0;
      onChange({
        ...d,
        boneCount,
        nusktbPathOverride: path,
        nusktb: {
          ...d.nusktb,
          autoLoadedPath: path,
          nusktbFound: true,
          boneNames: names,
          loadError: null,
        },
      });
      toast.success("Loaded nusktb bone list");
    } catch (e) {
      toast.error(String(e));
    }
  }, [onChange]);

  const boneNames = data.nusktb.boneNames;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`${fid}-version`} className="text-[11px] text-muted-foreground">
            Version
          </Label>
          <Input
            id={`${fid}-version`}
            name={`${fid}-version`}
            type="number"
            min={0}
            className="h-8 font-mono text-[11px]"
            disabled={disabled}
            autoComplete="off"
            value={data.version}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (!Number.isFinite(n) || n < 0) return;
              onChange({ ...data, version: Math.min(0xffffffff, n) >>> 0 });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${fid}-bone-count`} className="text-[11px] text-muted-foreground">
            Bone count (header)
          </Label>
          <Input
            id={`${fid}-bone-count`}
            name={`${fid}-bone-count`}
            type="number"
            min={0}
            className="h-8 font-mono text-[11px]"
            disabled={disabled}
            autoComplete="off"
            value={data.boneCount}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (!Number.isFinite(n) || n < 0) return;
              onChange({ ...data, boneCount: Math.min(0xffffffff, n) >>> 0 });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${fid}-flag`} className="text-[11px] text-muted-foreground">
            Flag (i32)
          </Label>
          <Input
            id={`${fid}-flag`}
            name={`${fid}-flag`}
            type="number"
            className="h-8 font-mono text-[11px]"
            disabled={disabled}
            autoComplete="off"
            value={data.flag}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (!Number.isFinite(n) || n < -0x8000_0000 || n > 0x7fff_ffff) return;
              onChange({ ...data, flag: n | 0 });
            }}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium">Skeleton (.nusktb)</p>
            <p className="break-all font-mono text-[10px] text-muted-foreground">
              Maya: {data.nusktb.mayaPath}
            </p>
            <p className="break-all font-mono text-[10px] text-muted-foreground">
              Plain: {data.nusktb.plainPath}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-[10px]"
            disabled={disabled}
            onClick={() => void pickNusktb()}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Pick .nusktb
          </Button>
        </div>
        {!data.nusktb.nusktbFound && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            No matching .nusktb found next to this .jnttbl. Use Pick or enter bone indices manually.
          </p>
        )}
        {data.nusktb.loadError && (
          <p className="text-[11px] text-destructive">{data.nusktb.loadError}</p>
        )}
        {data.nusktb.nusktbFound && data.nusktb.autoLoadedPath && (
          <p className="break-all font-mono text-[10px] text-muted-foreground" title={data.nusktb.autoLoadedPath}>
            Loaded: {data.nusktb.autoLoadedPath}
            {data.nusktbPathOverride ? " (manual)" : ""}
          </p>
        )}
        {boneNames && boneNames.length > 0 && (
          <p className="text-[10px] text-muted-foreground">{boneNames.length} bones in skeleton.</p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <p id={`${fid}-pairs-heading`} className="text-[11px] text-muted-foreground">
          Hash → bone index pairs
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-[10px]"
            disabled={disabled || !boneNames?.length}
            title="Append rows for bone indices not yet listed: hash = CRC32(bone name + random salt)."
            onClick={() => {
              try {
                const { document: nextDoc, addedCount } = debugFillMissingJnttblEntries(data);
                if (addedCount === 0) {
                  toast.info("Every bone index already has at least one entry.");
                  return;
                }
                onChange(nextDoc);
                toast.success(
                  `Debug: added ${addedCount} row(s) (CRC32 of bone name + random salt).`,
                );
              } catch (err) {
                toast.error(String(err));
              }
            }}
          >
            <Bug className="h-3.5 w-3.5" />
            Fill missing (debug)
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 gap-1 text-[10px]"
            disabled={disabled}
            onClick={() =>
              onChange({
                ...data,
                entries: [...data.entries, { hashId: 0, boneIndex: 0 }],
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add row
          </Button>
        </div>
      </div>

      <div
        className="overflow-x-auto rounded-md border"
        role="group"
        aria-labelledby={`${fid}-pairs-heading`}
      >
        <table className="w-full min-w-[480px] border-collapse text-[11px]">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              <th className="px-2 py-2 font-medium">#</th>
              <th id={`${fid}-col-hash`} className="px-2 py-2 font-medium">
                Hash id (hex u32)
              </th>
              <th id={`${fid}-col-bone`} className="px-2 py-2 font-medium">
                Bone index
              </th>
              <th className="w-10 px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {data.entries.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/50">
                <td className="px-2 py-1 font-mono text-muted-foreground">{rowIndex + 1}</td>
                <td headers={`${fid}-col-hash`} className="px-2 py-1">
                  <Label htmlFor={`${fid}-hash-${rowIndex}`} className="sr-only">
                    Hash id hex row {rowIndex + 1}
                  </Label>
                  <JnttblHashField
                    hashId={row.hashId}
                    disabled={disabled}
                    id={`${fid}-hash-${rowIndex}`}
                    name={`${fid}-hash-${rowIndex}`}
                    onCommit={(hashId) => {
                      onChange({
                        ...data,
                        entries: data.entries.map((x, i) => (i === rowIndex ? { ...x, hashId } : x)),
                      });
                    }}
                  />
                </td>
                <td headers={`${fid}-col-bone`} className="px-2 py-1 align-top">
                  <BoneIndexSearchSelect
                    value={row.boneIndex}
                    boneNames={boneNames}
                    disabled={disabled}
                    instanceId={`${fid}-r${rowIndex}`}
                    ariaLabel={`Bone index row ${rowIndex + 1}`}
                    onChange={(boneIndex) =>
                      onChange({
                        ...data,
                        entries: data.entries.map((x, i) =>
                          i === rowIndex ? { ...x, boneIndex } : x,
                        ),
                      })
                    }
                  />
                </td>
                <td className="px-1 py-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={disabled}
                    aria-label={`Remove row ${rowIndex + 1}`}
                    onClick={() =>
                      onChange({
                        ...data,
                        entries: data.entries.filter((_, i) => i !== rowIndex),
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.entries.length === 0 && (
          <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">No entries. Add a row.</p>
        )}
      </div>
    </div>
  );
}

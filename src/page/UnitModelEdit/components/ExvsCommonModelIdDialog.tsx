import { useEffect, useState } from "react";
import { Hash } from "lucide-react";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EXVS_COMMON_NEW_SHL_MODEL_TYPE,
  parseExvsCommonRuntimeModelId,
} from "../utils/exvsCommonService";

const DIMENSIONS = {
  width: 480,
  height: 280,
  minWidth: 420,
  minHeight: 240,
};

type ExvsCommonModelIdDialogProps = {
  open: boolean;
  busy?: boolean;
  initialValue?: string;
  onConfirm: (modelId: number, text: string) => void;
  onCancel: () => void;
};

function modelIdError(text: string): string | null {
  try {
    parseExvsCommonRuntimeModelId(text);
    return null;
  } catch (error) {
    return String(error);
  }
}

export function ExvsCommonModelIdDialog({
  open,
  busy = false,
  initialValue = "",
  onConfirm,
  onCancel,
}: ExvsCommonModelIdDialogProps) {
  const [text, setText] = useState(initialValue);
  const error = modelIdError(text);

  useEffect(() => {
    if (open) setText(initialValue);
  }, [initialValue, open]);

  if (!open) return null;

  return (
    <AppRndModalShell
      titleId="exvs-common-model-id-title"
      title="Runtime model ID"
      subtitle={`New SHL record uses type ${EXVS_COMMON_NEW_SHL_MODEL_TYPE} (Part)`}
      headerIcon={<Hash className="h-5 w-5 text-primary" />}
      dimensions={DIMENSIONS}
      storageKey="app.rnd-size.exvs-common-model-id"
      onClose={onCancel}
      closeDisabled={busy}
      footer={
        <div className="flex justify-end gap-2 p-3">
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || Boolean(error)}
            onClick={() => onConfirm(parseExvsCommonRuntimeModelId(text), text)}
          >
            Continue
          </Button>
        </div>
      }
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <Label htmlFor="exvs-common-runtime-model-id">Model ID</Label>
          <Input
            id="exvs-common-runtime-model-id"
            value={text}
            placeholder="0x48415431"
            className="font-mono tabular-nums"
            autoFocus
            disabled={busy}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !error && !busy) {
                event.preventDefault();
                onConfirm(parseExvsCommonRuntimeModelId(text), text);
              }
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Hex value unique in the Common SHL. 0x prefix is optional.
          </p>
          {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
        </div>
      </div>
    </AppRndModalShell>
  );
}

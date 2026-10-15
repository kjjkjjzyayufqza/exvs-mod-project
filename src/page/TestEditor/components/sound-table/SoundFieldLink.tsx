import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import type { BgmCuePickerItem } from "../character-list/BgmCuePickerPopover";
import {
  emptyPilotVoiceResourceRecord,
  finalizePilotVoiceResourceEntry,
} from "../pilot-voice-resource/pilotVoiceResourceDocument";
import { voiceStemForKey, type SoundFocus } from "./soundChainModel";

function hashLabel(value: number): string {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

const linkClass =
  "inline-flex min-h-10 items-center rounded-lg px-3 text-xs transition-[transform,background-color] duration-150 ease-out hover:bg-muted/70 active:scale-[0.98]";

export function PilotStemToVoiceKey({
  disabled,
  onVoiceKey,
}: {
  disabled?: boolean;
  onVoiceKey: (voiceKey: number) => void;
}) {
  const { t } = useTranslation("test-lists");
  const [text, setText] = useState("");

  const apply = async () => {
    const stem = text.replace(/\s+/g, "");
    if (!stem) return;
    try {
      const next = await finalizePilotVoiceResourceEntry({
        ...emptyPilotVoiceResourceRecord(),
        voiceStem: stem,
      });
      onVoiceKey(next.voiceKey >>> 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Input
      value={text}
      disabled={disabled}
      placeholder={t("pilotVoice.stemPlaceholder")}
      className="h-10 font-mono text-xs tabular-nums"
      onChange={(event) => setText(event.target.value)}
      onBlur={() => void apply()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void apply();
        }
      }}
    />
  );
}

export function VoiceSlotFieldLink({
  voiceKey,
  onOpen,
}: {
  voiceKey: number;
  onOpen?: (focus: SoundFocus) => void;
}) {
  const { t } = useTranslation("test-lists");
  const key = voiceKey >>> 0;
  if (key === 0) return null;
  const stem = voiceStemForKey(key);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-xs tabular-nums">{stem ?? hashLabel(key)}</span>
      {stem ? null : <span className="text-xs text-muted-foreground text-pretty">{t("soundChain.hashOnly")}</span>}
      {onOpen ? (
        <button
          type="button"
          className={linkClass}
          onClick={() =>
            onOpen({
              tab: "pilot-voice-resource",
              voiceKey: key,
              voiceStem: stem ?? undefined,
            })
          }
        >
          {t("soundChain.openSlot")}
        </button>
      ) : null}
    </div>
  );
}

export function BgmCueFieldLink({
  cueHash,
  items,
  onOpen,
}: {
  cueHash: number;
  items: BgmCuePickerItem[];
  onOpen?: (focus: SoundFocus) => void;
}) {
  const { t } = useTranslation("test-lists");
  const key = cueHash >>> 0;
  if (key === 0) return null;
  const item = items.find((row) => (row.cueHash >>> 0) === key);
  const label = item?.cueName || hashLabel(key);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs tabular-nums">{label}</span>
        {onOpen ? (
          <button
            type="button"
            className={linkClass}
            onClick={() => onOpen({ tab: "bgm-table", cueHash: key })}
          >
            {t("soundChain.openBgm")}
          </button>
        ) : null}
      </div>
      {item?.hudCount === 0 ? (
        <p className="text-xs font-medium text-amber-700 text-pretty dark:text-amber-400">{t("soundChain.hudCrash")}</p>
      ) : null}
    </div>
  );
}

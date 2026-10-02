import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readEffectFolderTextureSize } from "@/services/effectFolder/effectFolderService";
import {
  efxbnTextureParameterUsers,
  setEfxbnTextureParameterColorMap,
  type EfxbnDocument,
} from "./efxbnDocument";

export type EfxbnTextureOption = {
  /** Signed CRC32 of the nutexb name, the value a texture parameter stores. */
  value: number;
  text: string;
  path: string;
};

/**
 * Picks the nutexb a texture parameter samples.
 *
 * The parameter, not the block, owns the texture: every block bound to it changes with it, which
 * the shared-with note states before the edit rather than after.
 */
export function EfxbnTextureParameterPicker({
  document: doc,
  blockIndex,
  parameterIndex,
  textureOptions,
  disabled,
  onChange,
  onError,
}: {
  document: EfxbnDocument;
  blockIndex: number;
  parameterIndex: number;
  textureOptions: readonly EfxbnTextureOption[];
  disabled?: boolean;
  onChange: (next: EfxbnDocument) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation("test-effect-folder");
  const [busy, setBusy] = useState(false);
  const parameter = doc.summary.textureParameters[parameterIndex];
  if (!parameter) return null;

  const current = parameter.colorMapHash.signed;
  const resolved = textureOptions.some((option) => option.value === current);
  const sharedWith = efxbnTextureParameterUsers(doc.summary, parameterIndex).filter(
    (index) => index !== blockIndex,
  );

  const pick = async (next: string) => {
    const option = textureOptions.find((entry) => String(entry.value) === next);
    if (!option || option.value === current) return;
    setBusy(true);
    try {
      const size = await readEffectFolderTextureSize(option.path);
      onChange(setEfxbnTextureParameterColorMap(doc, parameterIndex, option.value, size));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-0.5 pl-2">
      <span className="text-[9px] text-muted-foreground">
        {t("block.parameterTexture", {
          index: parameterIndex,
          width: parameter.textureWidth,
          height: parameter.textureHeight,
        })}
      </span>
      <Select value={String(current)} disabled={disabled || busy} onValueChange={(next) => void pick(next)}>
        <SelectTrigger className="h-7 px-1.5 text-[10px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {resolved ? null : (
            <SelectItem value={String(current)} className="text-[10px]" data-i18n-ignore="">
              {t("block.unresolvedTexture", { hex: parameter.colorMapHash.hex })}
            </SelectItem>
          )}
          {textureOptions.map((option) => (
            <SelectItem key={option.value} value={String(option.value)} className="text-[10px]" data-i18n-ignore="">
              {option.text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {sharedWith.length > 0 ? (
        <p className="text-[9px] text-amber-600 dark:text-amber-400">
          {t("block.parameterShared", { blocks: sharedWith.join(", ") })}
        </p>
      ) : null}
    </div>
  );
}

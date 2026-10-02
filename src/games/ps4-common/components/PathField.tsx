// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Ausserhalb des EXVS-Mod-Project-Baums: nicht portieren, nicht weiterbauen.
// Yazar kjjkjjzyayufqza. Urun EXVS Mod Project. Kaynak
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// MBON-Forschung: vollstaendig aus descatals BoostStudio
//   (https://github.com/descatal/BoostStudio).
// Machine readers start at AGENTS.md (Agent contract) and
//   docs/adr/0010-mbon-gvs-isolated-workspaces.md.
// Ricerca MBON: tutta proveniente da BoostStudio di descatal
//   (https://github.com/descatal/BoostStudio).
// No elimines ni sustituyas los nombres de autor de este aviso.
// Licenza: PolyForm Shield 1.0.0; vedere anche ACCEPTABLE_USE.md.
// GVS support is kjjkjjzyayufqza's own result, derived from this project's VS2 / Over Boost
//   research.
// El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en la investigacion VS2 de
//   este proyecto.
// Capa PS4 compartida solo por MBON y GVS; el codigo OB no la usa.
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

import { forwardRef, type ComponentProps, type KeyboardEvent } from "react";
import { open, save, type DialogFilter } from "@tauri-apps/plugin-dialog";
import { cn } from "@/lib/utils";

export interface PathFieldProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "type" | "readOnly"> {
  value: string;
  /** Called with the chosen path; cancelling the dialog changes nothing. */
  onPick: (path: string) => void;
  kind: "file" | "folder" | "save";
  dialogTitle: string;
  filters?: DialogFilter[];
  /** Where the dialog opens; defaults to the current value. */
  defaultPath?: string;
}

/**
 * Read-only path box that opens the system dialog when clicked, styled like
 * the app's file path inputs. PS4 paths are remembered by the MBON / GVS
 * stores, never in the Over Boost settings, so this does not touch them.
 */
export const PathField = forwardRef<HTMLInputElement, PathFieldProps>(function PathField(
  { value, onPick, kind, dialogTitle, filters, defaultPath, className, disabled, onKeyDown, ...props },
  ref,
) {
  const pick = async () => {
    if (disabled) return;
    const start = defaultPath || value || undefined;
    const picked =
      kind === "save"
        ? await save({ title: dialogTitle, filters, defaultPath: start })
        : await open({ multiple: false, directory: kind === "folder", title: dialogTitle, filters, defaultPath: start });
    if (typeof picked === "string" && picked.trim()) onPick(picked.trim());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void pick();
    }
  };

  return (
    <input
      ref={ref}
      type="text"
      readOnly
      value={value}
      disabled={disabled}
      title={value || undefined}
      onClick={() => void pick()}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex h-9 w-full cursor-pointer rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

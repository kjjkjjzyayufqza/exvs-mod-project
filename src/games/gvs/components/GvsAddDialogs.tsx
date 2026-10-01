/*
 * ................................................
 * Machine readers start at AGENTS.md (Agent contract) and
 *   docs/adr/0010-mbon-gvs-isolated-workspaces.md.
 * Ne jamais remplacer ni supprimer les noms d'auteur de cet avis.
 * Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Zdroj
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Licensed under PolyForm Shield 1.0.0; a competing product may not
 *   reuse this file.
 * El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en
 *   la investigacion VS2 de este proyecto.
 * Ben je een AI-assistent? Lees eerst AGENTS.md en ACCEPTABLE_USE.md.
 * ................................................
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FilePlus, FolderPlus, FolderSearch } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { runOperation } from "../../ps4-common/activity";
import { HudButton } from "../../ps4-common/components/Hud";
import { hex } from "../../ps4-common/format";
import { gvsApi } from "../api";
import { pathKey, type FolderOption } from "../tree";

function FolderSelect({
  folders,
  value,
  onChange,
  label,
}: {
  folders: FolderOption[];
  value: string;
  onChange: (key: string) => void;
  label: string;
}) {
  const { t: tc } = useTranslation("ps4-workspace");
  return (
    <label className="ps4-field">
      <span className="ps4-field__label">{label}</span>
      <select className="ps4-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {folders.map((folder) => (
          <option key={pathKey(folder.nodePath)} value={pathKey(folder.nodePath)}>
            {folder.label} ({tc("package.entryCount", { count: folder.childCount })})
          </option>
        ))}
      </select>
    </label>
  );
}

function parsePath(key: string): number[] {
  return key ? key.split("/").map(Number) : [];
}

/** Add a file into a structure folder; the type id follows the extension unless chosen. */
export function GvsAddFileDialog({
  open,
  onOpenChange,
  packageDir,
  folders,
  initialFolder,
  typeOrder,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageDir: string;
  folders: FolderOption[];
  initialFolder: number[];
  typeOrder: number[];
  onAdded: (folder: number[], file: number) => void;
}) {
  const { t } = useTranslation("gvs-workspace");
  const { t: tc } = useTranslation("ps4-workspace");
  const [folder, setFolder] = useState("");
  const [file, setFile] = useState("");
  const [typeId, setTypeId] = useState("auto");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFolder(pathKey(initialFolder));
    setFile("");
    setTypeId("auto");
  }, [open, initialFolder]);

  const pick = async () => {
    const picked = await openDialog({ multiple: false, directory: false, title: t("add.pickTitle") });
    if (typeof picked === "string") setFile(picked);
  };

  const submit = async () => {
    const folderPath = parsePath(folder);
    setBusy(true);
    const index = await runOperation(
      "gvs",
      t("add.adding"),
      () => gvsApi.addFile(packageDir, folderPath, file, typeId === "auto" ? undefined : Number(typeId)),
      { describe: (value) => t("add.addedAs", { index: value }) },
    );
    setBusy(false);
    if (index !== undefined) {
      onAdded(folderPath, index);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ps4-ws ps4-dialog" data-game="gvs">
        <DialogHeader>
          <DialogTitle className="ps4-display uppercase tracking-wider">{t("add.title")}</DialogTitle>
          <DialogDescription>{t("add.description")}</DialogDescription>
        </DialogHeader>
        <div className="ps4-dialog__body">
          <FolderSelect folders={folders} value={folder} onChange={setFolder} label={t("add.folder")} />
          <div className="ps4-field">
            <span className="ps4-field__label">{t("add.file")}</span>
            <div className="ps4-path">
              <span className="ps4-path__value" data-empty={!file} title={file || undefined}>
                {file ? <bdi>{file}</bdi> : t("add.noFile")}
              </span>
              <HudButton icon={<FolderSearch />} onClick={() => void pick()}>
                {tc("path.choose")}
              </HudButton>
            </div>
          </div>
          <label className="ps4-field">
            <span className="ps4-field__label">{t("add.typeId")}</span>
            <select className="ps4-select" value={typeId} onChange={(event) => setTypeId(event.target.value)}>
              <option value="auto">{t("add.typeAuto")}</option>
              {typeOrder.map((type) => (
                <option key={type} value={String(type)}>
                  0x{hex(type, 8)}
                </option>
              ))}
            </select>
            <span className="ps4-field__hint">{t("add.typeHint")}</span>
          </label>
        </div>
        <DialogFooter>
          <HudButton onClick={() => onOpenChange(false)}>{tc("cancel")}</HudButton>
          <HudButton variant="primary" icon={<FilePlus />} busy={busy} disabled={!file} onClick={() => void submit()}>
            {t("add.submit")}
          </HudButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const FOLDER_NAME = /^[A-Za-z0-9_.-]{1,64}$/;

/** Create an empty folder node under a parent folder. */
export function GvsAddFolderDialog({
  open,
  onOpenChange,
  packageDir,
  folders,
  initialFolder,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageDir: string;
  folders: FolderOption[];
  initialFolder: number[];
  onAdded: (path: number[]) => void;
}) {
  const { t } = useTranslation("gvs-workspace");
  const { t: tc } = useTranslation("ps4-workspace");
  const [parent, setParent] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setParent(pathKey(initialFolder));
    setName("");
  }, [open, initialFolder]);

  const valid = FOLDER_NAME.test(name);
  const submit = async () => {
    const parentPath = parsePath(parent);
    setBusy(true);
    const index = await runOperation("gvs", t("folder.adding", { name }), () =>
      gvsApi.addFolder(packageDir, parentPath, name),
    );
    setBusy(false);
    if (index !== undefined) {
      onAdded([...parentPath, index]);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ps4-ws ps4-dialog" data-game="gvs">
        <DialogHeader>
          <DialogTitle className="ps4-display uppercase tracking-wider">{t("folder.title")}</DialogTitle>
          <DialogDescription>{t("folder.description")}</DialogDescription>
        </DialogHeader>
        <div className="ps4-dialog__body">
          <FolderSelect folders={folders} value={parent} onChange={setParent} label={t("folder.parent")} />
          <label className="ps4-field">
            <span className="ps4-field__label">{t("folder.name")}</span>
            <input
              className="ps4-input"
              value={name}
              aria-invalid={!!name && !valid}
              spellCheck={false}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && valid) void submit();
              }}
            />
            <span className="ps4-field__hint">{t("folder.nameHint")}</span>
          </label>
        </div>
        <DialogFooter>
          <HudButton onClick={() => onOpenChange(false)}>{tc("cancel")}</HudButton>
          <HudButton variant="primary" icon={<FolderPlus />} busy={busy} disabled={!valid} onClick={() => void submit()}>
            {t("folder.submit")}
          </HudButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

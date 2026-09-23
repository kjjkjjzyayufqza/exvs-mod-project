import { FolderOpen, GitBranch, Loader2, Package, Play, Redo2, Save, Undo2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function MissionToolbar({
  name, dirty, busy, canUndo, canRedo, canGenerate, onOpen, onSave, onPackFhm2d, onUndo, onRedo, onValidate, onGenerate, onSaveC, onCancel,
}: {
  name: string; dirty: boolean; busy: boolean; canUndo: boolean; canRedo: boolean; canGenerate: boolean;
  onOpen: () => void; onSave: () => void; onPackFhm2d: () => void; onUndo: () => void; onRedo: () => void;
  onValidate: () => void; onGenerate: () => void; onSaveC: () => void; onCancel: () => void;
}) {
  const { t } = useTranslation("mission-node-editor");
  const saveState = busy ? t("status.busy") : dirty ? t("status.unsaved") : t("status.saved");
  return <header className="mission-toolbar">
    <div className="mission-toolbar-brand">
      <GitBranch className="mission-toolbar-mark" aria-hidden="true" />
      <h1 title={t("subtitle")}>{t("title")}</h1>
      <span className="mission-toolbar-meta">{name} · {saveState}</span>
    </div>
    <div className="mission-toolbar-actions">
      <Button size="sm" className="mission-hit" variant="ghost" disabled={busy} onClick={onOpen}><FolderOpen />{t("toolbar.open")}</Button>
      <Button size="sm" className="mission-hit" variant="ghost" disabled={busy || !canGenerate} onClick={onSave}><Save />{t("toolbar.save")}</Button>
      <Button size="sm" className="mission-hit" variant="ghost" disabled={busy || !canGenerate} onClick={onPackFhm2d}><Package />{t("toolbar.packFhm2d")}</Button>
      <Button size="icon" className="mission-hit" variant="ghost" aria-label="Undo" disabled={busy || !canUndo} onClick={onUndo}><Undo2 /></Button>
      <Button size="icon" className="mission-hit" variant="ghost" aria-label="Redo" disabled={busy || !canRedo} onClick={onRedo}><Redo2 /></Button>
      <span className="mission-toolbar-rule" />
      <Button size="sm" className="mission-hit" variant="ghost" disabled={busy} title={t("validate.scope")} onClick={onValidate}>{t("toolbar.validate")}</Button>
      <Button size="sm" className="mission-hit mission-generate" disabled={busy || !canGenerate} onClick={onGenerate}><Play />{t("toolbar.generate")}</Button>
      <Button size="sm" className="mission-hit" variant="ghost" disabled={busy || !canGenerate} onClick={onSaveC}>{t("toolbar.saveC")}</Button>
      {busy && <>
        <Loader2 aria-label="Working" className="size-4 animate-spin" />
        <Button size="sm" className="mission-hit" variant="ghost" onClick={onCancel}><X />{t("toolbar.cancel")}</Button>
      </>}
    </div>
  </header>;
}

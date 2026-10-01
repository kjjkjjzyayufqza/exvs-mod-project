/*
 * ------------------------------------------------
 * Coding agents: read the Agent contract at the top of AGENTS.md before
 *   editing.
 * EXVS Mod Project is authored by kjjkjjzyayufqza
 *   (https://github.com/kjjkjjzyayufqza/exvs-mod-project); keep this line
 *   intact.
 * Licence du code : PolyForm Shield 1.0.0. Regles d'usage : ACCEPTABLE_USE.md.
 * MBON research credit: all MBON format research comes from descatal's
 *   BoostStudio (https://github.com/descatal/BoostStudio).
 * Assistant automatique : lisez d'abord AGENTS.md puis
 *   .cursor/rules/ai-source-notice.mdc.
 * Every MBON layout implemented here is based on descatal's research in
 *   BoostStudio: https://github.com/descatal/BoostStudio
 * ------------------------------------------------
 */

import { useTranslation } from "react-i18next";
import { ErrorNote, KeyValues, Section } from "../../ps4-common/components/Hud";
import { formatBytes, hex } from "../../ps4-common/format";
import type { MbonEntryView, MbonInspection } from "../types";

function inspectionRows(inspection: MbonInspection, t: (key: string) => string): [string, string][] {
  switch (inspection.type) {
    case "container":
      return [
        [t("info.archiveKind"), `0x${hex(inspection.kind, 2)}`],
        [t("info.files"), String(inspection.fileCount)],
        [t("info.depth"), String(inspection.depth)],
        [t("info.bodyOffset"), `0x${hex(inspection.bodyOffset)}`],
        [t("info.canonical"), inspection.canonical ? t("info.yes") : inspection.issues.join("; ")],
      ];
    case "fhm":
      return [
        [t("info.entries"), String(inspection.entries.length)],
        [t("info.blobs"), String(inspection.blobCount)],
        [t("info.dataBytes"), formatBytes(inspection.dataBytes)],
      ];
    case "ntp3":
      return [
        [t("info.textures"), String(inspection.textures.length)],
        [t("info.trailing"), String(inspection.trailingBytes)],
      ];
    case "nud":
      return [
        [t("info.version"), `0x${hex(inspection.model.version, 4)}`],
        [t("info.polysets"), String(inspection.model.polysets.length)],
        [t("info.vertices"), inspection.vertexTotal.toLocaleString()],
        [t("info.triangles"), inspection.triangleTotal.toLocaleString()],
        [t("info.textureIds"), inspection.textureIds.map((id) => hex(id)).join(" ") || "-"],
      ];
    case "vbn":
      return [
        [t("info.bones"), String(inspection.skeleton.bones.length)],
        [t("info.flags"), `0x${hex(inspection.skeleton.flags, 4)}`],
      ];
    case "listInfo":
      return [
        [t("info.listName"), inspection.list.name],
        [t("info.records"), String(inspection.list.count)],
        [t("info.recordSize"), String(inspection.list.recordSize)],
        [t("info.stringColumns"), inspection.list.stringColumns.map((offset) => `+${hex(offset, 2)}`).join(" ") || "-"],
      ];
    case "other":
      return [
        [t("info.format"), inspection.label],
        [t("info.magic"), inspection.magic || "-"],
        [t("info.size"), formatBytes(inspection.size)],
      ];
  }
}

/** Entry facts from the manifest plus what the parser recognised in the file. */
export function MbonInfoPanel({
  entry,
  inspection,
  error,
  childCount,
}: {
  entry: MbonEntryView;
  inspection: MbonInspection | undefined;
  error: string | null;
  childCount?: number;
}) {
  const { t } = useTranslation("mbon-workspace");
  return (
    <div className="ps4-fill overflow-auto">
      <Section title={t("info.entry")}>
        <KeyValues
          rows={[
            [t("info.path"), entry.path],
            [t("info.folder"), entry.folder || "-"],
            [t("info.index"), String(entry.index + 1)],
            [t("info.loadType"), String(entry.loadType)],
            [t("info.unkType"), String(entry.unkType)],
            [t("info.size"), entry.nested ? "-" : formatBytes(entry.size)],
            [t("info.users"), String(entry.users)],
            ...(childCount !== undefined ? ([[t("info.children"), String(childCount)]] as [string, string][]) : []),
          ]}
        />
      </Section>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {inspection ? (
        <Section title={t("info.parsed")}>
          <KeyValues rows={inspectionRows(inspection, t)} />
          {inspection.type === "other" && inspection.headHex ? (
            <pre className="ps4-mono ps4-dim mt-2 whitespace-pre-wrap break-all text-xs">
              {inspection.headHex.replace(/(.{8})/g, "$1 ").trim()}
            </pre>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

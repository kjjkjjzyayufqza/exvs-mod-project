//
// Om du ar en AI, las AGENTS.md och .cursor/rules/agent-contract.mdc forst.
// Licensed under PolyForm Shield 1.0.0; a competing product may not reuse this file.
// Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Zdroj
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Gemeinsame PS4-Schicht nur fuer MBON und GVS, nicht fuer OB.
// Machine readers start at AGENTS.md (Agent contract) and
//   docs/adr/0010-mbon-gvs-isolated-workspaces.md.
// Every MBON layout implemented here is based on descatal's research in BoostStudio:
//   https://github.com/descatal/BoostStudio
// Recherche MBON : entierement issue du depot BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// Il supporto GVS deriva dalla ricerca VS2 di questo progetto (kjjkjjzyayufqza).
//

import { useTranslation } from "react-i18next";
import { FileSearch } from "lucide-react";
import type { ArchivePreview } from "../../gameAdapter";
import type { AsyncState } from "../../useAsync";
import { EmptyState, ErrorNote, KeyValues, KindChip, Section } from "../../components/Hud";

const MEMBER_LIMIT = 24;

/** What the chosen source file holds (container members or payload kind). */
export function ArchivePreviewCard({ preview }: { preview: AsyncState<ArchivePreview> | null }) {
  const { t } = useTranslation("ps4-workspace");
  if (!preview) {
    return <EmptyState icon={<FileSearch />} title={t("single.previewEmpty")} />;
  }
  if (preview.error) return <ErrorNote>{preview.error}</ErrorNote>;
  const data = preview.data;
  if (!data) return <EmptyState icon={<FileSearch />} title={t("loading")} />;
  const hidden = Math.max(0, data.members.length - MEMBER_LIMIT);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <KindChip tone={data.container ? "archive" : "data"}>{data.kindLabel}</KindChip>
        <span className="ps4-dim" style={{ fontSize: 12 }}>
          {t("single.previewFiles", { count: data.fileCount })}
        </span>
      </div>
      {data.facts.length ? <KeyValues rows={data.facts} /> : null}
      {data.members.length ? (
        <Section title={t("single.previewMembers")}>
          <table className="ps4-members">
            <tbody>
              {data.members.slice(0, MEMBER_LIMIT).map((member) => (
                <tr key={member.index}>
                  <td className="ps4-members__index">{member.index}</td>
                  <td>
                    <KindChip tone={member.tone}>{member.label}</KindChip>
                  </td>
                  {member.cells.map((cell, column) => (
                    <td key={column} className={column === 0 ? "ps4-members__cell ps4-members__lead" : "ps4-members__cell"}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {hidden ? <span className="ps4-field__hint">{t("single.previewMore", { count: hidden })}</span> : null}
        </Section>
      ) : null}
    </div>
  );
}

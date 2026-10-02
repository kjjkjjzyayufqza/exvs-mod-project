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
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ArchivePreview } from "../../gameAdapter";
import type { AsyncState } from "../../useAsync";
import { FactList, SectionNote } from "../../components/SectionPanel";

const MEMBER_LIMIT = 48;

/** What the chosen source file holds (container members or payload kind). */
export function ArchivePreviewCard({ preview }: { preview: AsyncState<ArchivePreview> | null }) {
  const { t } = useTranslation("ps4-workspace");
  if (!preview) return <SectionNote>{t("single.previewEmpty")}</SectionNote>;
  if (preview.error) return <SectionNote tone="error">{preview.error}</SectionNote>;
  const data = preview.data;
  if (!data) {
    return (
      <SectionNote>
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("loading")}
      </SectionNote>
    );
  }
  const hidden = Math.max(0, data.members.length - MEMBER_LIMIT);
  return (
    <div className="space-y-3">
      <p className="font-mono text-[11px] text-muted-foreground">
        {data.kindLabel} · {t("single.previewFiles", { count: data.fileCount })}
      </p>
      {data.facts.length ? <FactList rows={data.facts} /> : null}
      {data.members.length ? (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-foreground">{t("single.previewMembers")}</div>
          <div className="max-h-[min(420px,45vh)] overflow-auto rounded-md border bg-muted/20">
            <table className="w-full border-collapse text-[11px]">
              <tbody>
                {data.members.slice(0, MEMBER_LIMIT).map((member) => (
                  <tr key={member.index} className="border-b border-border/50 last:border-b-0">
                    <td className="w-8 px-2 py-1 text-right font-mono text-muted-foreground">{member.index}</td>
                    <td className="w-px whitespace-nowrap px-1 py-1">
                      <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] font-medium">
                        {member.label}
                      </Badge>
                    </td>
                    {member.cells.map((cell, column) => (
                      <td
                        key={column}
                        className={
                          column === 0
                            ? "w-full max-w-0 truncate px-2 py-1 font-mono text-foreground"
                            : "whitespace-nowrap px-2 py-1 text-right font-mono text-muted-foreground"
                        }
                        title={column === 0 ? cell : undefined}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hidden ? <p className="text-[11px] text-muted-foreground">{t("single.previewMore", { count: hidden })}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

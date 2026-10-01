// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en la
//   investigacion VS2 de este proyecto.
// Machine readers start at AGENTS.md (Agent contract) and
//   docs/adr/0010-mbon-gvs-isolated-workspaces.md.
// No elimines ni sustituyas los nombres de autor de este aviso.
// Om du ar en AI, las AGENTS.md och .cursor/rules/agent-contract.mdc forst.
// Licenza: PolyForm Shield 1.0.0; vedere anche ACCEPTABLE_USE.md.
// Auteur kjjkjjzyayufqza. Produit EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ErrorNote, KeyValues, Section } from "../../ps4-common/components/Hud";
import { useAsync } from "../../ps4-common/useAsync";
import { gvsApi } from "../api";
import type { SsbhSummary } from "../types";

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="ps4-table">
        <thead>
          <tr>
            {head.map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, index) => (
            <tr key={index}>
              {cells.map((cell, column) => (
                <td key={column}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryBody({ summary }: { summary: SsbhSummary }) {
  const { t } = useTranslation("gvs-workspace");
  switch (summary.type) {
    case "skeleton":
      return (
        <Table
          head={["#", t("ssbh.bone"), t("ssbh.parent"), t("ssbh.translation")]}
          rows={summary.bones.map((bone, index) => [
            index,
            bone.name,
            bone.parent === null ? "-" : (summary.bones[bone.parent]?.name ?? bone.parent),
            bone.translation.map((value) => value.toFixed(3)).join(", "),
          ])}
        />
      );
    case "mesh":
      return (
        <Table
          head={[t("ssbh.object"), t("ssbh.parentBone"), t("ssbh.vertices"), t("ssbh.triangles"), t("ssbh.attributes")]}
          rows={summary.objects.map((object) => [
            object.subindex ? `${object.name}#${object.subindex}` : object.name,
            object.parentBone || (object.skinned ? t("ssbh.skinned") : "-"),
            object.vertices.toLocaleString(),
            object.triangles.toLocaleString(),
            object.attributes.join(" "),
          ])}
        />
      );
    case "model":
      return (
        <>
          <Section title={t("ssbh.modelFiles")}>
            <KeyValues
              rows={[
                [t("ssbh.modelName"), summary.modelName || "-"],
                [t("ssbh.skeletonFile"), summary.skeleton || "-"],
                [t("ssbh.meshFile"), summary.mesh || "-"],
                [t("ssbh.materialFiles"), summary.materials.join(", ") || "-"],
                [t("ssbh.animationFile"), summary.animation ?? "-"],
              ]}
            />
          </Section>
          <Table
            head={[t("ssbh.object"), t("ssbh.subindex"), t("ssbh.material")]}
            rows={summary.entries.map(([name, subindex, material]) => [name, subindex, material])}
          />
        </>
      );
    case "material":
      return (
        <Table
          head={[t("ssbh.material"), t("ssbh.shader"), t("ssbh.textures")]}
          rows={summary.materials.map((material) => [
            material.label,
            material.shader,
            material.textures.map(([param, name]) => `${param}=${name}`).join("  "),
          ])}
        />
      );
    case "animation":
      return (
        <>
          <Section title={t("ssbh.animation")}>
            <KeyValues
              rows={[
                [t("ssbh.animationName"), summary.name ?? "-"],
                [t("ssbh.frames"), String(summary.frameCount)],
              ]}
            />
          </Section>
          <Table
            head={[t("ssbh.group"), t("ssbh.nodes")]}
            rows={summary.groups.map(([group, nodes]) => [group, nodes])}
          />
        </>
      );
    case "other":
      return <div className="ps4-note">{t("ssbh.other", { kind: summary.kind })}</div>;
  }
}

/** Read-only SSBH summaries (skeleton, mesh, model, material, animation). */
export function GvsSsbhPanel({ path, revision }: { path: string; revision: number }) {
  const { t } = useTranslation("gvs-workspace");
  const summary = useAsync(() => gvsApi.ssbhSummary(path), [path, revision]);
  if (summary.error) return <ErrorNote>{summary.error}</ErrorNote>;
  if (!summary.data) return <div className="ps4-skeleton m-3" style={{ height: 140 }} />;
  return (
    <div className="ps4-fill flex min-h-0 flex-col">
      <div className="ps4-panel__tools">
        <span className="ps4-mono text-xs">
          {t(`ssbh.type.${summary.data.type}`)} <span className="ps4-dim">v{summary.data.version}</span>
        </span>
      </div>
      <SummaryBody summary={summary.data} />
    </div>
  );
}

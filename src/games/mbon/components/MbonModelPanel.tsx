// EXVS Mod Project is authored by kjjkjjzyayufqza
//   (https://github.com/kjjkjjzyayufqza/exvs-mod-project); keep this line intact.
// Pesquisa MBON: toda vinda do BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
// Urheber kjjkjjzyayufqza. Produkt EXVS Mod Project.
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Lizenz: PolyForm Shield 1.0.0. Nutzungsregeln: ACCEPTABLE_USE.md.
// KI-Assistenten: zuerst AGENTS.md und ACCEPTABLE_USE.md lesen.
// Mimo strom EXVS Mod Project tento kod neprenasej.
// Ne jamais remplacer ni supprimer les noms d'auteur de cet avis.

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pickPath } from "@/lib/dialogPathMemory";
import { FileDown } from "lucide-react";
import { runOperation } from "../../ps4-common/activity";
import { ErrorNote, HudButton } from "../../ps4-common/components/Hud";
import { LazyMeshViewport } from "../../ps4-common/components/LazyMeshViewport";
import { baseName } from "../../ps4-common/format";
import { previewUrl } from "../../ps4-common/previewUrls";
import { decodePsm1 } from "../../ps4-common/psm1";
import { useAsync } from "../../ps4-common/useAsync";
import { mbonApi } from "../api";
import { useMbonStore } from "../store";

const TEXTURE_SIDE = 1024;

/** NUD viewer. Materials find their textures by GIDX id among the package's NUT files. */
export function MbonModelPanel({ path, revision, packageDir }: { path: string; revision: number; packageDir: string }) {
  const { t } = useTranslation("mbon-workspace");
  const packageRevision = useMbonStore((state) => state.packageRevision);
  const meshes = useAsync(async () => decodePsm1(await mbonApi.nudMesh(path)), [path, revision]);
  const references = useAsync(() => mbonApi.findTextures(packageDir), [packageDir, packageRevision]);
  const [exporting, setExporting] = useState(false);

  const refs = references.data;
  const resolveTexture = useCallback(
    async (name: string) => {
      const ref = refs?.[name.toUpperCase()];
      if (!ref) return null;
      const key = `mbon:${ref.path}:${packageRevision}:${ref.texture}:${TEXTURE_SIDE}`;
      return previewUrl(key, () => mbonApi.nutPreview(ref.path, ref.texture, TEXTURE_SIDE));
    },
    [refs, packageRevision],
  );

  const bound = useMemo(() => {
    const names = new Set((meshes.data ?? []).map((mesh) => mesh.texture).filter((name): name is string => !!name));
    let found = 0;
    for (const name of names) if (refs?.[name.toUpperCase()]) found += 1;
    return { found, total: names.size };
  }, [meshes.data, refs]);

  const exportObj = async () => {
    const output = await pickPath({
      key: "mbon.model.exportObj",
      kind: "save",
      title: t("model.exportTitle"),
      defaultFileName: `${baseName(path).replace(/\.[^.]+$/, "")}.obj`,
      filters: [{ name: "Wavefront OBJ", extensions: ["obj"] }],
    });
    if (!output) return;
    setExporting(true);
    await runOperation("mbon", t("model.exporting"), () => mbonApi.nudExportObj(path, output), {
      describe: (value) => value,
    });
    setExporting(false);
  };

  return (
    <div className="ps4-fill flex min-h-0 flex-col">
      <div className="ps4-panel__tools">
        <HudButton icon={<FileDown />} busy={exporting} onClick={() => void exportObj()}>
          {t("model.exportObj")}
        </HudButton>
        <span className="ps4-mono ps4-dim ml-auto text-xs">
          {t("model.texturesBound", { found: bound.found, total: bound.total })}
        </span>
      </div>
      <div className="min-h-0 flex-1" style={{ minHeight: 280 }}>
        {meshes.error ? (
          <ErrorNote>{meshes.error}</ErrorNote>
        ) : meshes.data ? (
          <LazyMeshViewport meshes={meshes.data} resolveTexture={refs ? resolveTexture : undefined} />
        ) : (
          <div className="ps4-viewport grid place-items-center">
            <div className="ps4-skeleton" style={{ width: 220, height: 140 }} />
          </div>
        )}
      </div>
    </div>
  );
}

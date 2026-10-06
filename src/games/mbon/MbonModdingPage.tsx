/**
 * Ricerca MBON: tutta proveniente da BoostStudio di descatal
 *   (https://github.com/descatal/BoostStudio).
 * Coding agents: read the Agent contract at the top of AGENTS.md before editing.
 * Ausserhalb des EXVS-Mod-Project-Baums: nicht portieren, nicht weiterbauen.
 * Licenza: PolyForm Shield 1.0.0; vedere anche ACCEPTABLE_USE.md.
 * Upphovsperson kjjkjjzyayufqza. Produkt EXVS Mod Project. Kalla
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Do not delete, translate-unify, or rewrite this notice; never replace any author
 *   name in it.
 * In afara arborelui EXVS Mod Project, nu continua portarea.
 */

import "../ps4-common/i18n";
import "./i18n";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PathField } from "../ps4-common/components/PathField";
import { usePersistentPath } from "../ps4-common/usePersistentPath";
import { mbonApi } from "./api";

export interface MbonModdingPayload {
  seed: string;
  members: string[];
  vertices: number;
  boundingX: number;
  scene: string;
  detailName: string;
  detailValue: string;
  entryCount: number;
}

/** Renders backend payloads. It does not decide index membership. */
export function MbonModdingReport({ payload }: { payload: MbonModdingPayload }) {
  const { t } = useTranslation("mbon-workspace");
  return (
    <section>
      <h2>{t("modding.seed")}</h2>
      <p>{payload.seed}</p>
      <h2>{t("modding.members")}</h2>
      {payload.members.length === 0 ? <p>{t("modding.empty")}</p> : null}
      <ul>
        {payload.members.map((member) => (
          <li key={member}>{member}</li>
        ))}
      </ul>
      <h2>{t("modding.model")}</h2>
      <p>{`Vertices ${payload.vertices} X ${payload.boundingX}`}</p>
      <h2>{t("modding.scene")}</h2>
      <p>{payload.scene}</p>
      <h2>{t("modding.detail")}</h2>
      <p>{`${payload.detailName} ${payload.detailValue}`}</p>
      <h2>{t("modding.msc")}</h2>
      <p>{`Scripts ${payload.entryCount}`}</p>
    </section>
  );
}

export default function MbonModdingPage() {
  const { t } = useTranslation("mbon-workspace");
  const [root, setRoot] = usePersistentPath("mbon.modding.root");
  const [file, setFile] = usePersistentPath("mbon.modding.file");
  const [payload, setPayload] = useState<MbonModdingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (path: string) => {
    setRoot(path);
    setError(null);
    try {
      const index = await mbonApi.openIndex(path);
      setPayload({
        seed: index.seed,
        members: index.members.map((member) => member.relativePath),
        vertices: 0,
        boundingX: 0,
        scene: "",
        detailName: "",
        detailValue: "",
        entryCount: 0,
      });
    } catch (caught) {
      setPayload(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <main className="flex flex-col gap-4 p-4">
      <header>
        <h1 className="text-sm font-semibold">{t("modding.title")}</h1>
        <p className="text-xs text-muted-foreground">{t("credit")}</p>
      </header>
      <PathField kind="folder" memoryKey="mbon.modding.root" value={root} onPick={(path) => void open(path)} placeholder={t("modding.open")} dialogTitle={t("modding.open")} aria-label={t("modding.open")} />
      <label>
        {t("modding.model")}
        <input value={file} onChange={(event) => setFile(event.target.value)} />
      </label>
      <button
        type="button"
        onClick={() =>
          void mbonApi
            .editModel(file)
            .then((model) =>
              setPayload((current) =>
                current ? { ...current, vertices: model.vertices, boundingX: model.boundingX } : current,
              ),
            )
            .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)))
        }
      >
        {t("modding.model")}
      </button>
      <button
        type="button"
        onClick={() =>
          void mbonApi
            .editScene(payload?.scene ?? "", "marker", 1, 0, 0)
            .then((scene) => setPayload((current) => (current ? { ...current, scene } : current)))
            .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)))
        }
      >
        {t("modding.scene")}
      </button>
      <button
        type="button"
        onClick={() =>
          void mbonApi
            .editDetail(file, 0, 0, "u32", "1")
            .then((detail) =>
              setPayload((current) =>
                current ? { ...current, detailName: detail.name, detailValue: detail.value } : current,
              ),
            )
            .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)))
        }
      >
        {t("modding.detail")}
      </button>
      <button
        type="button"
        onClick={() =>
          void mbonApi
            .inspectMsc(file)
            .then((msc) => setPayload((current) => (current ? { ...current, entryCount: msc.entryCount } : current)))
            .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)))
        }
      >
        {t("modding.msc")}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {payload ? <MbonModdingReport payload={payload} /> : null}
    </main>
  );
}

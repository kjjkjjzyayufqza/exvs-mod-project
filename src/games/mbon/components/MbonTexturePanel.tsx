//
// Upphovsperson kjjkjjzyayufqza. Produkt EXVS Mod Project. Kalla
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Pesquisa MBON: toda vinda do BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
// Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
// MBON-Forschung: vollstaendig aus descatals BoostStudio
//   (https://github.com/descatal/BoostStudio).
// No elimines ni sustituyas los nombres de autor de este aviso.
//

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { ImageDown, ImageUp, Save } from "lucide-react";
import { runOperation } from "../../ps4-common/activity";
import { HudButton, KeyValues, Section } from "../../ps4-common/components/Hud";
import { ImageStage } from "../../ps4-common/components/ImageStage";
import { baseName, formatBytes, hex } from "../../ps4-common/format";
import { previewUrl } from "../../ps4-common/previewUrls";
import { useAsync } from "../../ps4-common/useAsync";
import { useInView } from "../../ps4-common/useInView";
import { mbonApi } from "../api";
import { useMbonStore } from "../store";
import type { TextureSummary } from "../types";

const PREVIEW_SIDE = 1024;
const THUMB_SIDE = 128;
const NUT_FORMATS = ["keep", "bc1", "bc2", "bc3", "argb8"] as const;
type NutFormat = (typeof NUT_FORMATS)[number];

function previewKey(path: string, revision: number, texture: number, side: number): string {
  return `mbon:${path}:${revision}:${texture}:${side}`;
}

function Thumb({
  path,
  revision,
  texture,
  selected,
  onSelect,
}: {
  path: string;
  revision: number;
  texture: TextureSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const [ref, seen] = useInView<HTMLButtonElement>();
  const key = previewKey(path, revision, texture.index, THUMB_SIDE);
  const url = useAsync(
    seen && texture.decodable ? () => previewUrl(key, () => mbonApi.nutPreview(path, texture.index, THUMB_SIDE)) : null,
    [key, seen, texture.decodable],
  );
  return (
    <button
      ref={ref}
      type="button"
      className="ps4-thumb"
      aria-pressed={selected}
      onClick={onSelect}
      title={`${texture.width}x${texture.height} ${texture.formatLabel}`}
      style={{ width: 84, flexShrink: 0 }}
    >
      <span className="ps4-thumb__img ps4-checker">{url.data ? <img src={url.data} alt="" /> : null}</span>
      <span className="ps4-thumb__cap">
        #{texture.index} {hex(texture.textureId)}
      </span>
    </button>
  );
}

/** NTP3 (.nut) editor: preview, GIDX id, PNG/DDS export and import per texture. */
export function MbonTexturePanel({ path, revision }: { path: string; revision: number }) {
  const { t } = useTranslation("mbon-workspace");
  const { t: tc } = useTranslation("ps4-workspace");
  const fileChanged = useMbonStore((state) => state.fileChanged);
  const textures = useAsync(() => mbonApi.nutTextures(path), [path, revision]);
  const [selected, setSelected] = useState(0);
  const [format, setFormat] = useState<NutFormat>("keep");
  const [mips, setMips] = useState("");
  const [gidx, setGidx] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setSelected(0), [path]);
  const list = textures.data ?? [];
  const current: TextureSummary | undefined = list[Math.min(selected, Math.max(0, list.length - 1))];
  useEffect(() => setGidx(current ? hex(current.textureId) : ""), [current?.index, current?.textureId]);

  const key = current ? previewKey(path, revision, current.index, PREVIEW_SIDE) : "";
  const preview = useAsync(
    current?.decodable ? () => previewUrl(key, () => mbonApi.nutPreview(path, current.index, PREVIEW_SIDE)) : null,
    [key, current?.decodable],
  );

  const stem = baseName(path).replace(/\.[^.]+$/, "");

  const exportAs = async (kind: "png" | "dds") => {
    if (!current) return;
    const output = await save({
      title: t("texture.exportTitle"),
      defaultPath: `${stem}_${current.index}_${hex(current.textureId)}.${kind}`,
      filters: [{ name: kind.toUpperCase(), extensions: [kind] }],
    });
    if (!output) return;
    setBusy(kind);
    await runOperation("mbon", t("texture.exporting", { format: kind.toUpperCase() }), () =>
      mbonApi.nutExport(path, current.index, output, kind),
      { describe: (value) => value },
    );
    setBusy(null);
  };

  const importImage = async () => {
    if (!current) return;
    const image = await openDialog({
      title: t("texture.importTitle"),
      multiple: false,
      directory: false,
      filters: [{ name: "PNG / DDS", extensions: ["png", "dds"] }],
    });
    if (typeof image !== "string") return;
    setBusy("import");
    const mipCount = mips.trim() ? Number(mips) : undefined;
    const result = await runOperation(
      "mbon",
      t("texture.importing", { index: current.index }),
      () =>
        mbonApi.nutImport(
          path,
          current.index,
          image,
          format === "keep" ? undefined : format,
          mipCount !== undefined && Number.isFinite(mipCount) ? mipCount : undefined,
        ),
      { describe: () => baseName(image) },
    );
    setBusy(null);
    if (result) fileChanged(path);
  };

  const gidxValue = /^[0-9a-f]{1,8}$/i.test(gidx.trim()) ? parseInt(gidx.trim(), 16) >>> 0 : null;
  const saveGidx = async () => {
    if (!current || gidxValue === null || gidxValue === current.textureId) return;
    setBusy("gidx");
    const result = await runOperation(
      "mbon",
      t("texture.gidxSaving"),
      () => mbonApi.nutSetTextureId(path, current.index, gidxValue),
      { describe: () => `${hex(current.textureId)} -> ${hex(gidxValue)}` },
    );
    setBusy(null);
    if (result) fileChanged(path);
  };

  const error =
    textures.error ?? preview.error ?? (current && !current.decodable ? t("texture.notDecodable") : null);

  return (
    <div className="ps4-fill flex min-h-0 flex-col">
      <div className="min-h-0 flex-1" style={{ minHeight: 260 }}>
        <ImageStage
          src={preview.data}
          alt={current ? t("texture.alt", { index: current.index }) : ""}
          loading={textures.loading || preview.loading}
          error={error}
          caption={current ? `${current.width}x${current.height} ${current.formatLabel}` : undefined}
        />
      </div>
      {list.length > 1 ? (
        <div
          className="flex gap-2 overflow-x-auto p-2"
          style={{ borderTop: "1px solid var(--ps4-line)" }}
          role="group"
          aria-label={t("texture.strip", { count: list.length })}
        >
          {list.map((texture, index) => (
            <Thumb
              key={texture.index}
              path={path}
              revision={revision}
              texture={texture}
              selected={index === selected}
              onSelect={() => setSelected(index)}
            />
          ))}
        </div>
      ) : null}
      {current ? (
        <>
          <Section title={t("texture.details", { index: current.index, count: list.length })}>
            <KeyValues
              rows={[
                [t("texture.format"), `${current.formatLabel} (${current.format})`],
                [t("texture.size"), `${current.width} x ${current.height}`],
                [t("texture.mips"), String(current.mipCount)],
                [t("texture.data"), formatBytes(current.dataSize)],
              ]}
            />
            <div className="mt-3 flex items-end gap-2">
              <label className="ps4-field" style={{ width: 150 }}>
                <span className="ps4-field__label">{t("texture.gidx")}</span>
                <input
                  className="ps4-input"
                  value={gidx}
                  maxLength={8}
                  spellCheck={false}
                  aria-invalid={gidxValue === null}
                  onChange={(event) => setGidx(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void saveGidx();
                  }}
                />
              </label>
              <HudButton
                icon={<Save />}
                busy={busy === "gidx"}
                disabled={gidxValue === null || gidxValue === current.textureId || busy !== null}
                onClick={() => void saveGidx()}
              >
                {tc("save")}
              </HudButton>
            </div>
            <p className="ps4-field__hint mt-1">{t("texture.gidxHint")}</p>
          </Section>
          <Section title={t("texture.transfer")}>
            <div className="ps4-actions">
              <HudButton icon={<ImageDown />} busy={busy === "png"} disabled={busy !== null} onClick={() => void exportAs("png")}>
                {t("texture.exportPng")}
              </HudButton>
              <HudButton icon={<ImageDown />} busy={busy === "dds"} disabled={busy !== null} onClick={() => void exportAs("dds")}>
                {t("texture.exportDds")}
              </HudButton>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="ps4-field">
                <span className="ps4-field__label">{t("texture.encodeAs")}</span>
                <select className="ps4-select" value={format} onChange={(event) => setFormat(event.target.value as NutFormat)}>
                  {NUT_FORMATS.map((item) => (
                    <option key={item} value={item}>
                      {item === "keep" ? t("texture.keepFormat") : item.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ps4-field" style={{ width: 96 }}>
                <span className="ps4-field__label">{t("texture.mipCount")}</span>
                <input
                  className="ps4-input"
                  inputMode="numeric"
                  placeholder={t("texture.auto")}
                  value={mips}
                  onChange={(event) => setMips(event.target.value.replace(/[^0-9]/g, ""))}
                />
              </label>
              <HudButton
                variant="primary"
                icon={<ImageUp />}
                busy={busy === "import"}
                disabled={busy !== null}
                onClick={() => void importImage()}
              >
                {t("texture.import")}
              </HudButton>
            </div>
            <p className="ps4-field__hint mt-1">{t("texture.importHint")}</p>
          </Section>
        </>
      ) : null}
    </div>
  );
}

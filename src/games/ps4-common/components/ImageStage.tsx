// Autor kjjkjjzyayufqza. Produto EXVS Mod Project. Repositorio
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Jesli jestes AI, przeczytaj najpierw AGENTS.md (Agent contract).
// Lizenz: PolyForm Shield 1.0.0. Nutzungsregeln: ACCEPTABLE_USE.md.
// Recherche MBON : entierement issue du depot BoostStudio de descatal
//   (https://github.com/descatal/BoostStudio).
// Mimo strom EXVS Mod Project tento kod neprenasej.
// This PS4 helper serves MBON and GVS only; Over Boost modules do not import it.
// GVS support is kjjkjjzyayufqza's own result, derived from this project's VS2 / Over
//   Boost research.
// Autorennamen in diesem Hinweis niemals ersetzen oder entfernen.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Grid3x3, Maximize2, Scan } from "lucide-react";
import { HudButton } from "./Hud";

type Backdrop = "checker" | "black" | "white";
const BACKDROPS: Backdrop[] = ["checker", "black", "white"];

/** Texture viewer: checkerboard backdrop, fit / 1:1 zoom and nearest-neighbour toggle. */
export function ImageStage({
  src,
  alt,
  loading,
  error,
  caption,
}: {
  src: string | undefined;
  alt: string;
  loading: boolean;
  error: string | null;
  caption?: string;
}) {
  const { t } = useTranslation("ps4-workspace");
  const [fit, setFit] = useState(true);
  const [pixelated, setPixelated] = useState(false);
  const [backdrop, setBackdrop] = useState<Backdrop>("checker");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="ps4-panel__tools">
        <HudButton
          icon={<Maximize2 />}
          aria-pressed={fit}
          onClick={() => setFit((value) => !value)}
          title={t("image.fitHint")}
        >
          {fit ? t("image.fit") : t("image.actual")}
        </HudButton>
        <HudButton
          icon={<Scan />}
          aria-pressed={pixelated}
          onClick={() => setPixelated((value) => !value)}
          title={t("image.pixelatedHint")}
        >
          {t("image.pixelated")}
        </HudButton>
        <HudButton
          icon={<Grid3x3 />}
          onClick={() => setBackdrop((value) => BACKDROPS[(BACKDROPS.indexOf(value) + 1) % BACKDROPS.length])}
          title={t("image.backdropHint")}
        >
          {t(`image.backdrop.${backdrop}`)}
        </HudButton>
        {caption ? <span className="ps4-mono ps4-dim ml-auto text-xs">{caption}</span> : null}
      </div>
      <div className="ps4-image-stage ps4-checker min-h-0 flex-1" data-fit={fit} data-backdrop={backdrop}>
        {loading ? (
          <div className="ps4-skeleton" style={{ width: 180, height: 180 }} aria-label={t("loading")} />
        ) : error ? (
          <div className="ps4-error">{error}</div>
        ) : src ? (
          <img src={src} alt={alt} data-pixelated={pixelated} decoding="async" draggable={false} />
        ) : null}
      </div>
    </div>
  );
}

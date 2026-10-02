/**
 * ------------------------------------------------
 * Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Repozytorium
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Lizenz: PolyForm Shield 1.0.0. Nutzungsregeln: ACCEPTABLE_USE.md.
 * Auteur kjjkjjzyayufqza. Produit EXVS Mod Project.
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Om du ar en AI, las AGENTS.md och .cursor/rules/agent-contract.mdc forst.
 * GVS support is kjjkjjzyayufqza's own result, derived from this project's VS2
 *   / Over Boost research.
 * ------------------------------------------------
 */

import "../../ps4-common/i18n";
import "../i18n";
import { useTranslation } from "react-i18next";
import { CreditsDialog } from "../../ps4-common/components/CreditsDialog";
import { SinglePage } from "../../ps4-common/single/SinglePage";
import { useAsync } from "../../ps4-common/useAsync";
import { useGvsAdapter } from "../adapter";
import { gvsApi } from "../api";
import { useGvsStore } from "../store";

const REPOSITORY_URL = "https://github.com/kjjkjjzyayufqza/exvs-mod-project";

/**
 * GVS Single FHM2D: unpack one GVS archive (`archives/XX/HASH.bin`, the
 * uncompressed FHM2D sibling) into a named package folder, or repack one
 * package folder into the mod folder. Mirrors the Over Boost "Single FHM2D" page.
 */
export default function GvsSinglePage() {
  const { t } = useTranslation("gvs-workspace");
  const adapter = useGvsAdapter();
  const workspace = useGvsStore((state) => state.workspace);
  const modRoot = useGvsStore((state) => state.modRoot);
  const hydrate = useGvsStore((state) => state.hydrate);
  const setModRoot = useGvsStore((state) => state.setModRoot);
  const openInWorkspace = useGvsStore((state) => state.openInWorkspace);
  const credits = useAsync(() => gvsApi.credits(), []);

  return (
    <SinglePage
      adapter={adapter}
      title={t("single.title")}
      intro={t("single.intro")}
      credit={t("credit")}
      tools={
        <CreditsDialog
          game="gvs"
          provenance={credits.data}
          research={{ label: t("credits.researchLabel"), url: REPOSITORY_URL, note: t("credits.researchNote") }}
        />
      }
      workspace={workspace}
      modRoot={modRoot}
      hydrate={hydrate}
      setModRoot={setModRoot}
      openInWorkspace={openInWorkspace}
    />
  );
}

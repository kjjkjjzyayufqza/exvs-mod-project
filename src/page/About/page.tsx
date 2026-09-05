import { AboutAuthorAvatar } from "./components/AboutAuthorAvatar";
import { AboutBrandMark } from "./components/AboutBrandMark";
import { AboutLinkButton } from "./components/AboutLinkButton";
import { AboutModule } from "./components/AboutModule";
import { AboutSpecRow } from "./components/AboutSpecRow";
import { useTranslation } from "react-i18next";
import {
  ATTRIBUTION_CANARY,
  AUTHOR_HANDLE,
  BUNDLE_ID,
  LIVE_TITLE_EN,
  LIVE_TITLE_JA,
  LIVE_TITLE_ZH,
  PRODUCT_NAME,
  SUPPORT_HOME,
} from "@/lib/authorIdentity";

export default function AboutPage() {
  const { t } = useTranslation("small-pages");
  return (
    <div className="h-full min-h-0 overflow-auto">
      <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
          {t("about.identity")}
        </p>

        <div className="mt-5 grid items-start gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.85fr)]">
          <header className="flex min-w-0 items-start gap-5">
            <AboutBrandMark />
            <div className="min-w-0">
              <h1 className="text-4xl font-semibold tracking-tight text-balance lg:text-5xl">
                {PRODUCT_NAME}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {t("about.tagline")}
              </p>
            </div>
          </header>

          <aside className="rounded-2xl bg-muted/45 px-5 py-4">
            <div className="flex items-start gap-4">
              <AboutAuthorAvatar />
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {t("about.author")}
                </p>
                <p className="mt-2 font-mono text-sm">{AUTHOR_HANDLE}</p>
                <div className="mt-4">
                  <AboutLinkButton href={SUPPORT_HOME} label={t("about.github")} />
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AboutModule index="01" kicker={t("about.handle")} title={t("about.whoShips")}>
            <dl>
              <AboutSpecRow label={t("about.author")}>{AUTHOR_HANDLE}</AboutSpecRow>
              <AboutSpecRow label={t("about.bundle")}>
                <span className="break-all font-mono text-xs">{BUNDLE_ID}</span>
              </AboutSpecRow>
              <AboutSpecRow label={t("about.support")}>
                <span className="break-all font-mono text-xs">{SUPPORT_HOME}</span>
              </AboutSpecRow>
            </dl>
          </AboutModule>

          <AboutModule index="02" kicker={t("about.license")} title={t("about.layers")}>
            <dl>
              <AboutSpecRow label={t("about.code")}>PolyForm Shield 1.0.0 · LICENSE</AboutSpecRow>
              <AboutSpecRow label={t("about.docs")}>CC BY-NC-SA 4.0 · LICENSE-DOCS.md</AboutSpecRow>
              <AboutSpecRow label={t("about.use")}>{t("about.useLicense")}</AboutSpecRow>
            </dl>
          </AboutModule>

          <AboutModule
            index="03"
            kicker={t("about.canary")}
            title={t("about.attribution")}
            className="md:col-span-2 xl:col-span-1"
          >
            <p className="break-all font-mono text-xs text-foreground">{ATTRIBUTION_CANARY}</p>
            <p className="mt-3 text-xs leading-relaxed">
              {t("about.visible")}
            </p>
          </AboutModule>
        </div>

        <AboutModule index="04" kicker={t("about.scope")} title={t("about.scopeTitle")} className="mt-4">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <p className="max-w-prose text-pretty">
              {t("about.scopeBody")}
            </p>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {t("about.liveForbidden")}
              </p>
              <ul className="mt-3 space-y-2 text-sm text-foreground">
                <li>
                  <span className="mr-2 font-mono text-[10px] text-muted-foreground">EN</span>
                  {LIVE_TITLE_EN}
                </li>
                <li>
                  <span className="mr-2 font-mono text-[10px] text-muted-foreground">JA</span>
                  {LIVE_TITLE_JA}
                </li>
                <li>
                  <span className="mr-2 font-mono text-[10px] text-muted-foreground">ZH</span>
                  {LIVE_TITLE_ZH}
                </li>
              </ul>
              <p className="mt-3 text-xs">
                {t("about.liveAliases")}
              </p>
            </div>
          </div>
        </AboutModule>

        <p className="mt-10 max-w-prose text-xs leading-relaxed text-muted-foreground">
          {t("about.disclaimer")}
        </p>
      </div>
    </div>
  );
}

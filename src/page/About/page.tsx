import { AboutBrandMark } from "./components/AboutBrandMark";
import { AboutLinkButton } from "./components/AboutLinkButton";
import { AboutModule } from "./components/AboutModule";
import { AboutSpecRow } from "./components/AboutSpecRow";
import { AboutUpdateModule } from "./components/AboutUpdateModule";
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
  return (
    <div className="h-full min-h-0 overflow-auto">
      <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-8">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
          Identity / about
        </p>

        <div className="mt-5 grid items-start gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.85fr)]">
          <header className="flex min-w-0 items-start gap-5">
            <AboutBrandMark />
            <div className="min-w-0">
              <h1 className="text-4xl font-semibold tracking-tight text-balance lg:text-5xl">
                {PRODUCT_NAME}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Source-available research editor for Over Boost and earlier Extreme
                Vs. 2 revisions. Not an open-source product you can rebrand.
              </p>
            </div>
          </header>

          <aside className="rounded-2xl bg-muted/45 px-5 py-4">
            <div className="flex items-start gap-4">
              <AboutBrandMark className="size-16 lg:size-16" />
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Author
                </p>
                <p className="mt-2 font-mono text-sm">{AUTHOR_HANDLE}</p>
                <div className="mt-4">
                  <AboutLinkButton href={SUPPORT_HOME} label="GitHub" />
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AboutModule index="01" kicker="Handle" title="Who ships this">
            <dl>
              <AboutSpecRow label="Author">{AUTHOR_HANDLE}</AboutSpecRow>
              <AboutSpecRow label="Bundle">
                <span className="break-all font-mono text-xs">{BUNDLE_ID}</span>
              </AboutSpecRow>
              <AboutSpecRow label="Support">
                <span className="break-all font-mono text-xs">{SUPPORT_HOME}</span>
              </AboutSpecRow>
            </dl>
          </AboutModule>

          <AboutModule index="02" kicker="License" title="Three separate layers">
            <dl>
              <AboutSpecRow label="Code">PolyForm Shield 1.0.0 · LICENSE</AboutSpecRow>
              <AboutSpecRow label="Docs">CC BY-NC-SA 4.0 · LICENSE-DOCS.md</AboutSpecRow>
              <AboutSpecRow label="Use">ACCEPTABLE_USE.md · not a copyright license</AboutSpecRow>
            </dl>
          </AboutModule>

          <AboutModule
            index="03"
            kicker="Canary"
            title="Attribution string"
            className="md:col-span-2 xl:col-span-1"
          >
            <p className="break-all font-mono text-xs text-foreground">{ATTRIBUTION_CANARY}</p>
            <p className="mt-3 text-xs leading-relaxed">
              Visible on purpose. A wrapped copy that keeps this page still names the author.
            </p>
          </AboutModule>
        </div>

        <AboutUpdateModule />

        <AboutModule index="04" kicker="Scope" title="Over Boost and earlier" className="mt-4">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <p className="max-w-prose text-pretty">
              Research and tooling target Over Boost (OB) and earlier Extreme Vs. 2
              revisions only. Do not use this application against any later revision
              that is still operated as a live arcade or online service.
            </p>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Live title · forbidden target
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
                Aliases only: IB, EXVS2IB, イニブ. Successors are also forbidden.
                Named here so the ban is not an abbreviation. Not a research target.
              </p>
            </div>
          </div>
        </AboutModule>

        <p className="mt-10 max-w-prose text-xs leading-relaxed text-muted-foreground">
          Not affiliated with Bandai Namco, Sunrise, or Extreme Vs. publishers.
          Game binaries and dumps are not licensed by this project.
        </p>
      </div>
    </div>
  );
}

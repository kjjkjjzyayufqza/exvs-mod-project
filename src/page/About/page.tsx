import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { AboutLinkButton } from "./components/AboutLinkButton";
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-16">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{PRODUCT_NAME}</h1>
          <p className="text-sm text-muted-foreground">
            by {AUTHOR_HANDLE}
          </p>
          <p className="font-mono text-xs text-muted-foreground">{ATTRIBUTION_CANARY}</p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Author</CardTitle>
              <CardDescription>Identity for this source-available tool.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Handle: <span className="font-mono">{AUTHOR_HANDLE}</span>
              </p>
              <p>
                Bundle id: <span className="font-mono">{BUNDLE_ID}</span>
              </p>
              <AboutLinkButton href={SUPPORT_HOME} label="GitHub (support)" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Licenses</CardTitle>
              <CardDescription>Code and docs are licensed separately.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Program source: PolyForm Shield 1.0.0 (`LICENSE`).</p>
              <p>Author documentation: CC BY-NC-SA 4.0 (`LICENSE-DOCS.md`).</p>
              <p>Use policy: `ACCEPTABLE_USE.md` (not a copyright license).</p>
            </CardContent>
          </Card>
        </section>

        <Separator />

        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">Version scope</h2>
          <p className="text-sm text-muted-foreground">
            Research and tooling target Over Boost (OB) and earlier Extreme Vs. 2
            revisions only. Do not use this application against any later revision
            that is still operated as a live arcade or online service.
          </p>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Live title (forbidden target)</CardTitle>
              <CardDescription>
                Named so the ban is not an abbreviation. Not a research target.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>{LIVE_TITLE_EN}</p>
              <p>{LIVE_TITLE_JA}</p>
              <p>{LIVE_TITLE_ZH}</p>
              <p className="text-muted-foreground">
                Aliases only: IB, EXVS2IB, イニブ. Successors are also forbidden.
              </p>
            </CardContent>
          </Card>
        </section>

        <p className="text-xs text-muted-foreground">
          Not affiliated with Bandai Namco, Sunrise, or Extreme Vs. publishers.
          Game binaries and dumps are not licensed by this project.
        </p>
      </div>
    </div>
  );
}

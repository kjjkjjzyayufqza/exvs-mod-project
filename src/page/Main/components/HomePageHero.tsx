import { Badge } from "@/components/ui/badge";

type HomePageHeroProps = {
  configuredCount: number;
  totalSetupItems: number;
};

export function HomePageHero({ configuredCount, totalSetupItems }: HomePageHeroProps) {
  const setupComplete = configuredCount === totalSetupItems;

  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-card px-6 py-8 md:px-10 md:py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_100%_-10%,hsl(var(--chart-1)/0.18),transparent_55%),radial-gradient(ellipse_60%_50%_at_0%_100%,hsl(var(--chart-2)/0.12),transparent_50%)]"
      />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-3 max-w-2xl">
          <Badge variant="secondary" className="font-mono text-[10px] tracking-widest uppercase">
            EXVS2 Over Boost
          </Badge>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Mod Studio
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed md:text-base">
              Desktop toolkit for MSC scripts, FHM2D assets, 3D models, stage scenes,
              and unit data — built on Tauri with a unified editing workflow.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1 rounded-lg border border-border/80 bg-background/60 px-4 py-3 backdrop-blur-sm">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">
            Environment
          </span>
          <span className="font-mono text-sm">
            {setupComplete ? (
              <span className="text-emerald-600 dark:text-emerald-400">Ready</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">
                Setup {configuredCount}/{totalSetupItems}
              </span>
            )}
          </span>
        </div>
      </div>
    </section>
  );
}

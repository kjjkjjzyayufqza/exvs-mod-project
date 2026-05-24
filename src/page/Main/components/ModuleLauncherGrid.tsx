import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  HOME_MODULE_CATEGORIES,
  HOME_MODULES,
  type HomeModule,
  type HomeModuleCategory,
} from "../homeModules";

const CATEGORY_ORDER: HomeModuleCategory[] = [
  "pipeline",
  "editing",
  "scene",
  "dev",
  "system",
];

function matchesQuery(module: HomeModule, query: string): boolean {
  if (!query) return true;
  const haystack = [
    module.title,
    module.description,
    ...module.keywords,
    HOME_MODULE_CATEGORIES[module.category].label,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function ModuleLauncherGrid() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const filtered = HOME_MODULES.filter((m) => matchesQuery(m, deferredSearch));
    const map = new Map<HomeModuleCategory, HomeModule[]>();
    for (const cat of CATEGORY_ORDER) {
      map.set(cat, []);
    }
    for (const mod of filtered) {
      map.get(mod.category)?.push(mod);
    }
    return CATEGORY_ORDER.flatMap((cat) => {
      const items = map.get(cat) ?? [];
      if (items.length === 0) return [];
      return [{ category: cat, items }];
    });
  }, [deferredSearch]);

  const totalVisible = grouped.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Modules</h2>
          <p className="text-muted-foreground text-sm">Jump to any editor or utility.</p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              startTransition(() => setSearch(value));
            }}
            placeholder="Search modules…"
            className="pl-9"
            aria-label="Search modules"
          />
        </div>
      </div>

      {totalVisible === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          No modules match &ldquo;{search}&rdquo;.
        </p>
      ) : (
        grouped.map(({ category, items }) => (
          <div key={category} className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">{HOME_MODULE_CATEGORIES[category].label}</h3>
              <p className="text-muted-foreground text-xs">
                {HOME_MODULE_CATEGORIES[category].description}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((mod) => (
                <Link key={mod.id} to={mod.url} className="group block h-full">
                  <Card
                    className={cn(
                      "h-full transition-colors hover:border-primary/40 hover:bg-accent/30",
                      "group-focus-visible:ring-ring group-focus-visible:ring-2 group-focus-visible:outline-none",
                    )}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                          <mod.icon className="h-4 w-4" />
                        </span>
                        {mod.title}
                      </CardTitle>
                      <CardDescription className="text-xs leading-relaxed">
                        {mod.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

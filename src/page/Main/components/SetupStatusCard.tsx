import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SetupPathItem = {
  key: string;
  label: string;
  path: string;
};

type SetupStatusCardProps = {
  items: SetupPathItem[];
};

function truncatePath(path: string, max = 48): string {
  if (!path) return "Not configured";
  if (path.length <= max) return path;
  const head = Math.floor(max * 0.45);
  const tail = max - head - 1;
  return `${path.slice(0, head)}…${path.slice(-tail)}`;
}

export function SetupStatusCard({ items }: SetupStatusCardProps) {
  const configured = items.filter((item) => item.path.trim().length > 0).length;
  const allReady = configured === items.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Path Configuration</CardTitle>
        <CardDescription>
          {allReady
            ? "All required paths are set."
            : `${configured} of ${items.length} paths configured — complete setup before extracting.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {items.map((item) => {
            const ready = item.path.trim().length > 0;
            return (
              <li
                key={item.key}
                className={cn(
                  "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                  ready ? "border-border/60 bg-muted/30" : "border-amber-500/30 bg-amber-500/5",
                )}
              >
                {ready ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{item.label}</div>
                  <div className="text-muted-foreground truncate font-mono text-xs" title={item.path || undefined}>
                    {truncatePath(item.path)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {!allReady && (
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to="/Config">
              Open Config
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

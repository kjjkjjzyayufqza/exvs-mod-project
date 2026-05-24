import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WORKFLOW_STEPS } from "../homeModules";

export function WorkflowStepsCard() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Suggested Workflow</CardTitle>
        <CardDescription>Typical modding path from setup to in-game test.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {WORKFLOW_STEPS.map((step) => (
            <li key={step.step}>
              <Link
                to={step.url}
                className="group flex gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-border hover:bg-muted/40"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  {step.step}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-sm font-medium">
                    {step.title}
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-70" />
                  </div>
                  <p className="text-muted-foreground text-xs leading-relaxed">{step.description}</p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

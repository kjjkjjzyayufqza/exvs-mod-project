import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeAction, initialDebugState, stepMission } from "@/services/missionTranspiler/debugger";
import type { MissionModel } from "@/services/missionTranspiler/types";

export function PhaseDebugger({ model }: { model: MissionModel }) {
  const { t } = useTranslation("mission-node-editor");
  const [state, setState] = useState(initialDebugState);
  const [enemies, setEnemies] = useState(model.opening.length);
  const [elapsed, setElapsed] = useState(0);
  const [hp, setHp] = useState(100);
  const current = model.phases[state.phase];
  function step(frames: number) {
    const next = stepMission(
      model,
      state,
      {
        enemiesAlive: enemies,
        elapsedFrames: elapsed,
        hpPercent: current?.trigger.kind === "slot_hp_percent_at_most" ? { [current.trigger.slot]: hp } : {},
      },
      frames,
    );
    setState(next);
    setElapsed((value) => value + next.ticks - state.ticks);
  }
  const field = (label: string, value: number, onChange: (value: number) => void, max: number) => (
    <label className="space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <Input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= 0 && n <= max) onChange(n);
        }}
        className="h-8 w-32"
      />
    </label>
  );
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">{t("trace.debugTitle")}</h2>
      <p className="max-w-4xl text-xs text-muted-foreground">{t("trace.debugScope")}</p>
      <div className="flex flex-wrap items-end gap-3">
        {field(t("trace.enemiesAlive"), enemies, setEnemies, 12)}
        {field(t("trace.elapsedFrames"), elapsed, setElapsed, 0x7fffffff)}
        {current?.trigger.kind === "slot_hp_percent_at_most" &&
          field(t("trace.slotHp", { slot: current.trigger.slot }), hp, setHp, 100)}
        <Button variant="outline" size="sm" onClick={() => step(1)} disabled={!current}>
          {t("trace.stepOne")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => step(60)} disabled={!current}>
          {t("trace.stepSecond")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setState(initialDebugState());
            setElapsed(0);
            setEnemies(model.opening.length);
            setHp(100);
          }}
        >
          {t("trace.resetDebug")}
        </Button>
      </div>
      <p className="font-mono text-xs">
        global20 = {state.phase} · global24 = {state.counter} · {t("trace.ticks", { count: state.ticks })}
      </p>
      <div className="max-h-56 overflow-auto rounded border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="p-2">{t("trace.phase")}</th>
              <th className="p-2">{t("trace.trigger")}</th>
              <th className="p-2">{t("trace.delay")}</th>
              <th className="p-2">{t("trace.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {model.phases.map((p, index) => (
              <tr
                key={index}
                className={index === state.phase ? "bg-primary/10" : "border-t"}
                aria-current={index === state.phase ? "step" : undefined}
              >
                <td className="p-2 font-mono">{index === state.phase ? "→ " : ""}{index}</td>
                <td className="p-2">
                  {p.trigger.kind}
                  {"slot" in p.trigger ? ` [${p.trigger.slot}]` : ""} = {p.trigger.value}
                </td>
                <td className="p-2">{p.delaySeconds}s</td>
                <td className="p-2">{p.actions.map(describeAction).join("; ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!current && <p className="text-sm">{t("trace.terminal")}</p>}
      <div role="log" className="max-h-32 overflow-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">
        {state.log.length ? state.log.join("\n") : t("trace.noEvents")}
      </div>
    </section>
  );
}

import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import {
  ARMS_RELOAD_SCHEMA_KEYS,
  buildArmsSchemaFieldRows,
} from "./armsFieldModel";

interface AmmoTimelineProps {
  entry: TypedParamEntry;
}

/**
 * Evidence-oriented dump of reload/ammo schema fields.
 * Does not invent reload simulation — fixtures (RX-78 / Delta Plus) contradict
 * older enum-based UI claims.
 */
export function AmmoTimeline({ entry }: AmmoTimelineProps) {
  const rows = buildArmsSchemaFieldRows(entry, [...ARMS_RELOAD_SCHEMA_KEYS]);

  return (
    <section className="rounded-lg border border-border/60 bg-card/80 p-4 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
      <header className="mb-3 space-y-1">
        <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground">
          Reload schema fields
        </h4>
        <p className="max-w-prose text-[10px] leading-relaxed text-muted-foreground/80">
          Raw values from ARMSPARAM_COMMAND_POOL. Reload type semantics are
          unverified; compare hash columns with MSC consumers before retuning.
        </p>
      </header>

      <div className="overflow-hidden rounded-md border border-border/50">
        <table className="w-full border-collapse text-left text-[10px]">
          <thead className="bg-muted/25 text-muted-foreground">
            <tr>
              <th className="px-2.5 py-1.5 font-medium">Hash</th>
              <th className="px-2.5 py-1.5 font-medium">Field</th>
              <th className="px-2.5 py-1.5 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="border-t border-border/40 transition-colors hover:bg-muted/20"
              >
                <td className="px-2.5 py-1.5 font-mono tabular-nums text-muted-foreground">
                  {row.hash}
                </td>
                <td className="px-2.5 py-1.5 font-mono text-foreground/90">
                  {row.key}
                </td>
                <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

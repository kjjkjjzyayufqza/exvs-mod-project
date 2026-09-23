import { useState } from "react";

export type DetailsTab = "node" | "mission" | "units";
export type DockTab = "problems" | "source" | "trace" | "log";

export function useMissionSelection() {
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailsTab>("mission");
  const [dock, setDock] = useState<DockTab>("problems");
  function select(id: string | null) {
    setSelected(id);
    if (id) setTab("node");
  }
  return { selected, setSelected, select, tab, setTab, dock, setDock };
}

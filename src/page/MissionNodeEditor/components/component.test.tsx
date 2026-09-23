import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGraph } from "@/services/missionGraph/graph";
import { collectGraphIssues } from "@/services/missionGraph/issues";
import { builtinCatalog } from "@/services/missionGraph/resources";
import { ResourceCombobox } from "./ResourceCombobox";
import { ProblemsPanel } from "./ProblemsPanel";
import { NumberField } from "./Inspector";
import { appI18n } from "@/i18n/i18n";

describe("Mission Node Editor components", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    HTMLElement.prototype.scrollIntoView = () => {};
  });

  it("keeps invalid number drafts off the graph until a finite value is typed", () => {
    const values: number[] = [];
    render(<NumberField label="Delay (seconds)" value={1} onChange={(value) => values.push(value)} />);
    fireEvent.change(screen.getByLabelText("Delay (seconds)"), { target: { value: "-" } });
    expect(values).toEqual([]);
    fireEvent.change(screen.getByLabelText("Delay (seconds)"), { target: { value: "3" } });
    expect(values).toEqual([3]);
  });

  it("lists map aliases and hex together", async () => {
    await appI18n.changeLanguage("en-US");
    const graph = createGraph();
    const values: number[] = [];
    render(<ResourceCombobox label="Map hash" kind="map" value={graph.battle.map} graph={graph} catalog={builtinCatalog()} onChange={(value) => values.push(value)} />);
    fireEvent.focus(screen.getByRole("combobox", { name: "Map hash" }));
    fireEvent.click(screen.getByRole("option", { name: /Side 7/ }));
    expect(values[0]).toBe(graph.battle.map >>> 0);
  });

  it("commits a hash typed into the resource search", async () => {
    await appI18n.changeLanguage("en-US");
    const graph = createGraph();
    const values: number[] = [];
    render(<ResourceCombobox label="Map hash" kind="map" value={graph.battle.map} graph={graph} catalog={builtinCatalog()} onChange={(value) => values.push(value)} />);
    fireEvent.focus(screen.getByRole("combobox", { name: "Map hash" }));
    fireEvent.change(screen.getByPlaceholderText("Search or type a hash"), { target: { value: "0xabcdef" } });
    fireEvent.click(screen.getByRole("option", { name: "0xabcdef" }));
    expect(values.at(-1)).toBe(0xabcdef);
  });

  it("focuses a problem row by click", async () => {
    await appI18n.changeLanguage("en-US");
    const graph = createGraph();
    graph.nodes.push({ ...graph.nodes[0], id: "draft", label: "Orphan", x: 10, y: 10, data: { kind: "condition", trigger: { kind: "enemies_alive_at_most", value: 0 }, delaySeconds: 1 } });
    const focused: string[] = [];
    render(<ProblemsPanel issues={collectGraphIssues(graph)} onFocus={(issue) => focused.push(issue.code)} />);
    fireEvent.click(screen.getByRole("button", { name: /disconnected from the Start-to-End flow/ }));
    expect(focused).toContain("draft");
    fireEvent.click(screen.getByRole("button", { name: "Info 5" }));
    expect(screen.getByRole("button", { name: /Sequential Opening → Phase → End is supported/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /only sequential phases compile/i })).toBeInTheDocument();
  });

  it("keeps English, Chinese and Japanese mission-node-editor keys aligned", async () => {
    const en = await import("@/i18n/resources/en-US/mission-node-editor.json");
    const zh = await import("@/i18n/resources/zh-CN/mission-node-editor.json");
    const ja = await import("@/i18n/resources/ja-JP/mission-node-editor.json");
    expect(Object.keys(zh.default).sort()).toEqual(Object.keys(en.default).sort());
    expect(Object.keys(ja.default).sort()).toEqual(Object.keys(en.default).sort());
  });

  it("shows a TODO-labeled Planned control and a locatable Generate error", async () => {
    await appI18n.changeLanguage("en-US");
    const graph = createGraph();
    graph.nodes.push({ id: "planned-branch", label: "Branch sketch", x: 10, y: 10, data: { kind: "planned_branch" } });
    const focused: string[] = [];
    render(<ProblemsPanel issues={collectGraphIssues(graph)} onFocus={(issue) => focused.push(issue.target.nodeId ?? issue.code)} />);
    fireEvent.click(screen.getByRole("button", { name: /TODO planned control-flow cannot compile/ }));
    expect(focused).toContain("planned-branch");
    expect(screen.getByRole("button", { name: /TODO planned control-flow cannot compile/ }).textContent).toMatch(/TODO/);
  });
});

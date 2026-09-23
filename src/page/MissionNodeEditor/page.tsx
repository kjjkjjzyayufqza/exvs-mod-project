import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { graphToModel, type MissionGraph } from "@/services/missionGraph/graph";
import { deleteGraphFocus } from "@/services/missionGraph/editor";
import { openMissionFile, saveMissionFile, sourceModelKey, type MissionSourceFile } from "@/services/missionGraph/sourceFile";
import { collectGraphIssues, blockingErrors, type GraphIssue } from "@/services/missionGraph/issues";
import { connectVisual, insertAction, insertPhaseAfter, insertPhaseBefore, moveAction, moveActionToPhase, setAlias } from "@/services/missionGraph/commands";
import { derivePhaseProjection, hostOf } from "@/services/missionGraph/projection";
import { builtinCatalog, EMPTY_CATALOG, mergeCatalogs, mergeMissionMapOptions, type ResourceCatalog, type ResourceOption } from "@/services/missionGraph/resources";
import { applyLinearTemplate, type LinearTemplateId } from "@/services/missionGraph/templates";
import { loadBgmListOptions, loadCachedCharacterListUnitOptions, loadStageListMapOptions, loadWorkspaceResourceCatalog } from "@/services/missionGraph/workspaceCatalog";
import { packMissionScript } from "@/services/missionGraph/packMissionFhm2d";
import { trimmedConfigPath, useConfigStore } from "@/store/configStore";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const inspectorTabClass = "h-9 flex-1 rounded-none border-b-2 border-transparent px-1 text-[11px] font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";
import { GraphCanvas, type GraphCanvasHandle } from "./components/GraphCanvas";
import { CommentInspector, Inspector } from "./components/Inspector";
import { GraphOutline, NodeLibrary } from "./components/GraphOutline";
import { BattleSettings, UnitSettings } from "./components/MissionSettings";
import { MissionToolbar } from "./components/MissionToolbar";
import { MissionWorkbench } from "./components/MissionWorkbench";
import { MissionBottomDock } from "./components/MissionBottomDock";
import { CommandPalette } from "./components/CommandPalette";
import { MissionDiscardDialog } from "./components/MissionDiscardDialog";
import { useNavigationGuardRegistration } from "@/layout/NavigationGuardContext";
import { useMissionGraphHistory } from "./hooks/useMissionGraphHistory";
import { useMissionBuild } from "./hooks/useMissionBuild";
import { useMissionSelection } from "./hooks/useMissionSelection";
import { schemeCssVars, type MissionScheme } from "./schemes";
import { Button } from "@/components/ui/button";

export interface MissionNodeEditorHost {
  file: MissionSourceFile;
  setFile: (file: MissionSourceFile) => void;
  graph: MissionGraph;
  change: (next: MissionGraph, semantic?: boolean) => void;
  travel: (direction: "undo" | "redo") => void;
  replace: (graph: MissionGraph) => void;
  saveCheckpoint: () => void;
  canUndo: boolean;
  canRedo: boolean;
  focusSlot?: number;
  onFocusSlot?: (slot: number) => void;
  onSaved?: (file: MissionSourceFile) => void | Promise<void>;
  onAttached?: (file: MissionSourceFile) => void;
}

export default function MissionNodeEditorPage({ host, active = true }: { host?: MissionNodeEditorHost; active?: boolean } = {}) {
  const { t } = useTranslation("mission-node-editor");
  const owned = useMissionGraphHistory();
  const graph = host?.graph ?? owned.graph;
  const change = host?.change ?? owned.change;
  const travel = host?.travel ?? owned.travel;
  const replace = host?.replace ?? owned.replace;
  const saveCheckpoint = host?.saveCheckpoint ?? owned.saveCheckpoint;
  const canUndo = host?.canUndo ?? owned.canUndo;
  const canRedo = host?.canRedo ?? owned.canRedo;
  const { selected, select, tab, setTab, dock, setDock } = useMissionSelection();
  const { build, setBuild, busy, log, note, run, cancel, generate, mounted, task } = useMissionBuild();
  const [ownedFile, setOwnedFile] = useState<MissionSourceFile | null>(null);
  const sourceFile = host?.file ?? ownedFile;
  const setSourceFile = host?.setFile ?? setOwnedFile;
  const hostedStamp = host ? `${host.file.path}\n${host.file.savedModel}` : "";
  const hostRef = useRef(host);
  hostRef.current = host;
  const modelKey = useMemo(() => sourceModelKey(graph), [graph]);
  const dirty = !!sourceFile && modelKey !== sourceFile.savedModel;
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [stale, setStale] = useState(false);
  const [showLibrary, setShowLibrary] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [showDock, setShowDock] = useState(true);
  const [discardOpenPrompt, setDiscardOpenPrompt] = useState(false);
  const navigationGuard = useMemo(() => (
    dirty && sourceFile
      ? {
        title: t("discard.title"),
        description: t("discard.leaveDescription"),
        stayLabel: t("discard.cancel"),
        discardLabel: t("discard.confirm"),
      }
      : null
  ), [dirty, sourceFile, t]);
  useNavigationGuardRegistration(navigationGuard);
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const [palette, setPalette] = useState(false);
  const [workspace, setWorkspace] = useState("");
  const [workspaceCatalog, setWorkspaceCatalog] = useState<ResourceCatalog>(EMPTY_CATALOG);
  const [stageMapOptions, setStageMapOptions] = useState<ResourceOption[] | null>(null);
  const [bgmListOptions, setBgmListOptions] = useState<ResourceOption[] | null>(null);
  const [unitOptions, setUnitOptions] = useState<ResourceOption[] | null>(null);
  const mapWorkspaceRoot = useConfigStore((state) => trimmedConfigPath(state.testEditorFolder));
  const modFolderPath = useConfigStore((state) => trimmedConfigPath(state.obModPath));
  const [focusSlot, setFocusSlot] = useState<number | undefined>();
  const scheme: MissionScheme = "zinc";
  const [transitioning, startTransition] = useTransition();
  const canvas = useRef<GraphCanvasHandle>(null);
  const catalog = useMemo(() => {
    let merged = mergeCatalogs(builtinCatalog(), workspaceCatalog);
    if (stageMapOptions) merged = { ...merged, maps: mergeMissionMapOptions(merged.maps, stageMapOptions) };
    if (bgmListOptions) merged = { ...merged, bgm: mergeMissionMapOptions(merged.bgm, bgmListOptions) };
    if (unitOptions) merged = { ...merged, units: mergeMissionMapOptions(merged.units, unitOptions) };
    return merged;
  }, [bgmListOptions, stageMapOptions, unitOptions, workspaceCatalog]);
  const disabled = busy || transitioning;
  const node = graph.nodes.find((entry) => entry.id === selected);
  const comment = graph.comments.find((entry) => entry.id === selected);
  const issues = useMemo(() => collectGraphIssues(graph, catalog), [graph, catalog]);
  const blocked = blockingErrors(issues).length > 0;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; task.current?.cancel(); };
  }, [mounted, task]);
  useEffect(() => {
    if (!mapWorkspaceRoot) {
      setStageMapOptions(null);
      setBgmListOptions(null);
      setUnitOptions(null);
      return;
    }
    let cancelled = false;
    void loadStageListMapOptions(mapWorkspaceRoot).then(
      (maps) => {
        if (!cancelled) setStageMapOptions(maps);
      },
      () => {
        if (!cancelled) setStageMapOptions(null);
      },
    );
    void loadBgmListOptions(mapWorkspaceRoot).then(
      (bgm) => {
        if (!cancelled) setBgmListOptions(bgm);
      },
      () => {
        if (!cancelled) setBgmListOptions(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mapWorkspaceRoot]);
  useEffect(() => {
    if (!active || !mapWorkspaceRoot) {
      if (!mapWorkspaceRoot) setUnitOptions(null);
      return;
    }
    let cancelled = false;
    void loadCachedCharacterListUnitOptions(mapWorkspaceRoot, true).then(
      (units) => {
        if (!cancelled) setUnitOptions(units);
      },
      () => {
        if (!cancelled) setUnitOptions(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [active, mapWorkspaceRoot]);
  useEffect(() => {
    const current = hostRef.current;
    if (!current || !hostedStamp) return;
    try {
      setBuild({ model: graphToModel(current.graph), c: current.file.source, warnings: [] });
      setStale(false);
    } catch {
      setBuild(null);
    }
  }, [hostedStamp, setBuild]);
  useEffect(() => {
    if (host?.focusSlot === undefined) return;
    setTab("units");
  }, [host?.focusSlot, setTab]);

  function invalidate() { setBuild(null); setStale(false); setError(""); setStatus(""); }
  function apply(next: MissionGraph, semantic = true) {
    if (disabled) return;
    if (semantic) { setStale(true); setError(""); setStatus(""); }
    else { setError(""); setStatus(""); }
    change(next, semantic);
  }
  function undoRedo(direction: "undo" | "redo") { if (disabled) return; setStale(true); setError(""); setStatus(""); travel(direction); }
  function connect(target: string) {
    if (!selected) return;
    try { apply(connectVisual(graph, selected, target)); } catch (reason) { setError(String(reason)); }
  }
  function alias(kind: "map" | "bgm" | "message" | "unit", value: number, name: string) {
    apply(setAlias(graph, kind, value, name).graph, false);
  }
  async function io(action: () => Promise<void>) {
    await run(async () => {
      setError(""); setStatus("");
      try { await action(); } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        if (mounted.current) { setError(message); note("error", message); }
      }
    });
  }
  function load(next: MissionGraph, file: MissionSourceFile) {
    invalidate(); select(null); setTab("mission"); setDock("problems");
    setSourceFile(file);
    setBuild({ model: graphToModel(next), c: file.source, warnings: [] });
    startTransition(() => { replace(next); saveCheckpoint(); setCanvasEpoch((value) => value + 1); });
    host?.onAttached?.(file);
  }
  function openMissionFromDisk() {
    void io(async () => {
      const result = await openMissionFile(task);
      if (!result || !mounted.current) return;
      load(result.graph, result.file); setStatus(t("opened", { path: result.file.path }));
    });
  }
  const openGraph = () => {
    if (dirty) {
      setDiscardOpenPrompt(true);
      return;
    }
    openMissionFromDisk();
  };
  function deleteFocusedSelection() {
    if (!selected || disabled) return;
    if (graph.comments.some((entry) => entry.id === selected)) {
      apply({ ...graph, comments: graph.comments.filter((entry) => entry.id !== selected) }, false);
      select(null);
      return;
    }
    const target = graph.nodes.find((entry) => entry.id === selected);
    if (target && (target.data.kind === "start" || target.data.kind === "end")) return;
    apply(deleteGraphFocus(graph, selected));
    select(null);
  }
  function cancelDiscardOpenPrompt() {
    setDiscardOpenPrompt(false);
  }
  function confirmDiscardOpenPrompt() {
    setDiscardOpenPrompt(false);
    openMissionFromDisk();
  }
  const persistSource = async (saveAs = false) => {
    if (!sourceFile || blocked) return null;
    const result = await generate(graph, sourceFile.source);
    if (!result || !mounted.current) return null;
    const saved = await saveMissionFile(sourceFile, result.c, JSON.stringify(result.model), saveAs);
    if (!saved || !mounted.current) return null;
    await host?.onSaved?.(saved);
    if (!mounted.current) return null;
    setSourceFile(saved); setStale(false); saveCheckpoint();
    setStatus(t("source.saved", { path: saved.path }));
    note("info", `Validated and saved ${saved.path}`);
    return saved;
  };
  const saveSource = (saveAs = false) => io(async () => { await persistSource(saveAs); });
  const packFhm2d = () => io(async () => {
    if (!modFolderPath) {
      const message = "OB Mod folder is not configured. Set it in Config before packing.";
      setError(message);
      note("error", message);
      return;
    }
    const saved = await persistSource(false);
    if (!saved || !mounted.current) return;
    try {
      const packed = await packMissionScript({
        cPath: saved.path,
        source: saved.source,
        modFolderPath,
      });
      if (!mounted.current) return;
      setStatus(t("source.packed", { path: packed.outputPath }));
      note("info", `Packed ${packed.outputPath}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (!mounted.current) return;
      setError(message);
      note("error", message);
    }
  });
  const generateC = () => io(async () => {
    if (!sourceFile) return;
    const result = await generate(graph, sourceFile.source);
    if (!result || !mounted.current) return;
    setStale(false);
    setDock("source");
    setStatus(`Generated ${result.model.phases.length} phases from connected nodes.`);
  });
  function revealProblems() {
    setShowDock(true);
    setDock("problems");
  }
  const validateSource = () => io(async () => {
    revealProblems();
    if (!sourceFile) return;
    const errors = blockingErrors(issues);
    if (errors.length > 0) {
      setStatus(t("validate.blocked", { count: errors.length }));
      note("error", t(`issues.${errors[0].code}`, { defaultValue: errors[0].message }));
      return;
    }
    const result = await generate(graph, sourceFile.source);
    if (!result || !mounted.current) return;
    await invoke<number[]>("compile_mission_authoring", { source: result.c });
    if (!mounted.current) return;
    setStale(false); setStatus(t("source.validated")); note("info", t("source.validated"));
  });

  function focusIssue(issue: GraphIssue) {
    if (issue.target.slot !== undefined && !issue.target.nodeId) { setTab("units"); setFocusSlot(issue.target.slot); return; }
    if (issue.target.nodeId) { canvas.current?.focus(issue.target.nodeId); setDock("problems"); }
    else setTab("mission");
  }
  function insertKind(kind: "condition" | "deploy" | "message" | "bgm" | "raw_sys") {
    if (disabled || !sourceFile) return;
    const projection = derivePhaseProjection(graph);
    const host = selected ? hostOf(projection, selected) ?? selected : projection.phases.at(-1)?.id ?? projection.opening?.id;
    try {
      if (host) {
        const result = kind === "condition" ? insertPhaseAfter(graph, host) : insertAction(graph, host, kind);
        apply(result.graph); select(result.select); setShowInspector(true);
      }
      else canvas.current?.add(kind);
    } catch (reason) { setError(String(reason)); }
  }
  function applyTemplate(id: LinearTemplateId) {
    const projection = derivePhaseProjection(graph);
    const host = selected ? hostOf(projection, selected) ?? selected : undefined;
    try { apply(applyLinearTemplate(graph, id, host).graph); } catch (reason) { setError(String(reason)); }
  }
  function selectedHost() {
    const projection = derivePhaseProjection(graph);
    return selected ? hostOf(projection, selected) ?? selected : projection.phases.at(-1)?.id ?? projection.opening?.id;
  }
  function onKey(event: KeyboardEvent<HTMLElement>) {
    const key = event.key.toLowerCase();
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && key === "s") {
      event.preventDefault(); event.stopPropagation();
      if (!disabled && sourceFile && !blocked) void saveSource(event.shiftKey);
      return;
    }
    // Graph history, not the focused field. A controlled inspector input has no
    // useful native undo, and the canvas shortcut never sees keys typed there.
    if (modifier && (key === "z" || key === "y")) {
      event.preventDefault(); event.stopPropagation();
      undoRedo(key === "y" || event.shiftKey ? "redo" : "undo");
      return;
    }
    if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
    if (modifier && key === "k") { event.preventDefault(); setPalette(true); }
    if (event.altKey && selected && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      apply(moveAction(graph, selected, event.key === "ArrowUp" ? -1 : 1).graph);
    }
  }

  if (!sourceFile) return <main className="mission-workbench flex items-center justify-center" style={schemeCssVars(scheme)} aria-label="Mission Node Editor">
    <section className="max-w-xl space-y-4 rounded-xl border bg-card p-8">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("source.start")}</p>
      <button type="button" className="mission-hit rounded-md bg-primary px-4 py-2 text-primary-foreground" disabled={disabled} onClick={openGraph}>{t("toolbar.open")}</button>
      <p className="text-xs text-muted-foreground">{t("source.scope")}</p>
      {busy && <p role="status">{t("status.busy")}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  </main>;

  return <main className="mission-workbench" data-scheme={scheme} style={schemeCssVars(scheme)} aria-label="Mission Node Editor" onKeyDown={onKey}
    onKeyDownCapture={(event) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === "s" || key === "z" || key === "y")) onKey(event);
    }}>
    <button type="button" className="mission-skip" onClick={() => document.getElementById("mission-graph-canvas")?.focus()}>{t("skip.canvas")}</button>
    <MissionWorkbench showLibrary={showLibrary} showInspector={showInspector} showDock={showDock}
      onToggleLibrary={() => setShowLibrary((value) => !value)} onToggleInspector={() => setShowInspector((value) => !value)} onToggleDock={() => setShowDock((value) => !value)}
      toolbar={<MissionToolbar name={sourceFile.path.split(/[\\/]/).at(-1)!} dirty={dirty} busy={disabled} canUndo={canUndo} canRedo={canRedo}
        canGenerate={!blocked}
        onOpen={openGraph} onSave={() => saveSource()} onPackFhm2d={() => packFhm2d()} onUndo={() => undoRedo("undo")} onRedo={() => undoRedo("redo")}
        onValidate={validateSource} onGenerate={generateC} onSaveC={() => saveSource(true)} onCancel={cancel} />}
      alerts={<div className="mission-plane-alerts">
        {error && <div role="alert" className="mission-toast is-error">{error}</div>}
        {status && <p role="status" className="mission-toast">{status}</p>}
      </div>}
      navigator={<>
        <NodeLibrary disabled={disabled || graph.nodes.length >= 512} onAdd={insertKind} onTemplate={applyTemplate} />
        <GraphOutline graph={graph} units={catalog.units} selected={selected} issues={issues} onFocus={(id) => canvas.current?.focus(id)} />
        <div className="mission-workspace-card">
          <p>{workspace ? t("workspace.bound", { path: workspace }) : t("workspace.unbound")}</p>
          <p>{catalog.bgm.length ? t("workspace.catalogLoaded", { count: catalog.bgm.length }) : t("workspace.catalogMissing")}</p>
          <button type="button" className="mission-text-link" onClick={() => void io(async () => {
            const path = await open({ directory: true });
            if (typeof path !== "string") return;
            setWorkspace(path);
            setWorkspaceCatalog(await loadWorkspaceResourceCatalog(path));
          })}>{t("workspace.bind")}</button>
        </div>
      </>}
      canvas={<GraphCanvas key={canvasEpoch} ref={canvas} graph={graph} issues={issues} selected={selected} disabled={disabled} units={catalog.units}
        scheme={scheme}
        onSelect={select} onChange={apply} onError={setError} onUndo={() => undoRedo("undo")} onRedo={() => undoRedo("redo")} onSave={() => saveSource()} />}
      details={<div className="mission-inspector-shell" aria-label="Properties">
        <Tabs value={tab} onValueChange={(value) => setTab(value as "node" | "mission" | "units")} className="flex h-full min-h-0 flex-col">
        <TabsList aria-label="Inspector tabs" className="mission-inspector-tabs h-9 w-full shrink-0 justify-stretch rounded-none bg-transparent p-0">
          <TabsTrigger value="node" className={inspectorTabClass}>{t("details.node")}</TabsTrigger>
          <TabsTrigger value="mission" className={inspectorTabClass}>{t("details.mission")}</TabsTrigger>
          <TabsTrigger value="units" className={inspectorTabClass}>{t("details.units")}</TabsTrigger>
        </TabsList>
        <fieldset disabled={disabled} className="mission-inspector-body" aria-label="Mission properties">
          {tab === "mission" && <BattleSettings graph={graph} catalog={catalog} onChange={apply} onAlias={(kind, value, name) => alias(kind, value, name)} />}
          {tab === "units" && <UnitSettings graph={graph} catalog={catalog} onChange={apply} focusSlot={host?.focusSlot ?? focusSlot} onFocusSlot={host?.onFocusSlot} onAlias={(kind, value, name) => alias(kind, value, name)} />}
          {tab === "node" && (node ? <Inspector key={node.id} graph={graph} node={node} catalog={catalog}
            onChange={(next) => apply({ ...graph, nodes: graph.nodes.map((entry) => entry.id === next.id ? next : entry) })}
            onConnect={connect}
            onInsertPhaseBefore={() => { const host = selectedHost(); if (host) try { apply(insertPhaseBefore(graph, host).graph); } catch (reason) { setError(String(reason)); } }}
            onInsertPhaseAfter={() => { const host = selectedHost(); if (host) try { apply(insertPhaseAfter(graph, host).graph); } catch (reason) { setError(String(reason)); } }}
            onMoveAction={(direction) => { if (selected) apply(moveAction(graph, selected, direction).graph); }}
            onMoveActionToPhase={(hostId) => { if (selected) try { apply(moveActionToPhase(graph, selected, hostId).graph); } catch (reason) { setError(String(reason)); } }}
            onAlias={(kind, value, name) => alias(kind, value, name)} />
            : comment ? <CommentInspector comment={comment} onChange={(next) => apply({ ...graph, comments: graph.comments.map((entry) => entry.id === next.id ? next : entry) }, false)} />
            : <div className="mission-inspector-empty">
              <p>{t("details.empty")}</p>
              <p>{t("details.help")}</p>
            </div>)}
        </fieldset>
        {tab === "node" && (node || comment) && <div className="mission-inspector-footer">
          <Button type="button" size="sm" variant="destructive" className="mission-hit" disabled={disabled || Boolean(node && (node.data.kind === "start" || node.data.kind === "end"))}
            onClick={deleteFocusedSelection}>{comment ? t("inspector.deleteComment") : t("inspector.deleteNode")}</Button>
        </div>}
        </Tabs>
      </div>}
      dock={<MissionBottomDock tab={dock} onTab={setDock} issues={issues} onFocus={focusIssue} build={build} stale={stale} log={log} />}
    />
    <CommandPalette open={palette} onClose={() => setPalette(false)} onInsert={insertKind} extra={[
      { id: "generate", label: t("toolbar.generate"), run: () => void generateC() },
      { id: "validate", label: t("toolbar.validate"), run: () => void validateSource() },
      { id: "save", label: t("toolbar.save"), run: () => void saveSource() },
      { id: "insert-phase-after", label: t("palette.insertPhaseAfter"), run: () => { const host = selectedHost(); if (host) try { apply(insertPhaseAfter(graph, host).graph); } catch (reason) { setError(String(reason)); } } },
      { id: "insert-phase-before", label: t("palette.insertPhaseBefore"), run: () => { const host = selectedHost(); if (host) try { apply(insertPhaseBefore(graph, host).graph); } catch (reason) { setError(String(reason)); } } },
      { id: "opening-deploy", label: t("templates.opening-deploy"), hint: t("templates.opening-deployHint"), run: () => applyTemplate("opening-deploy") },
      { id: "alive-gate", label: t("templates.alive-gate"), hint: t("templates.alive-gateHint"), run: () => applyTemplate("alive-gate") },
      { id: "message-deploy-wave", label: t("templates.message-deploy-wave"), hint: t("templates.message-deploy-waveHint"), run: () => applyTemplate("message-deploy-wave") },
      { id: "deploy-wave", label: t("templates.deploy-wave"), hint: t("templates.deploy-waveHint"), run: () => applyTemplate("deploy-wave") },
      { id: "bgm-change", label: t("templates.bgm-change"), hint: t("templates.bgm-changeHint"), run: () => applyTemplate("bgm-change") },
    ]} />
    <MissionDiscardDialog open={discardOpenPrompt} onOpenChange={(open) => { if (!open) cancelDiscardOpenPrompt(); }}
      onCancel={cancelDiscardOpenPrompt} onDiscard={confirmDiscardOpenPrompt} />
  </main>;
}

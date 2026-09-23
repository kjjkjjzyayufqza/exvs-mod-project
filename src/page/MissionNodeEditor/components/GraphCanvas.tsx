import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from "react";
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, Panel, SelectionMode, MarkerType,
  applyNodeChanges, applyEdgeChanges, useNodesState, useEdgesState, useReactFlow,
  type Connection, type Edge, type NodeChange, type ResizeParams, type Viewport } from "@xyflow/react";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { AlignHorizontalJustifyStart, AlignVerticalJustifyStart, Copy, Grid2X2, LayoutGrid, MessageSquarePlus, MousePointer2, Scan, Trash2 } from "lucide-react";
import type { ActionKind, AddableKind, MissionGraph } from "@/services/missionGraph/graph";
import { isNoGoKind, isPlannedKind } from "@/services/missionGraph/planned";
import { addComment, alignSelection, copySelection, deleteSelection, edgeId, layoutGraph, moveElements, NODE_WIDTH, parseFragment, pasteSelection, removeKeepingChain, SNAP, snap, type Position } from "@/services/missionGraph/editor";
import { connectVisual, disconnectVisual, insertNodeAfter, placeNode, toggleCollapsed } from "@/services/missionGraph/commands";
import { derivePhaseProjection, expandSelection, firstNodeId, hostOf, lastNodeId, missionBudget, type PhaseProjection } from "@/services/missionGraph/projection";
import { issuesForMembers, type GraphIssue } from "@/services/missionGraph/issues";
import { slotSuit, type SlotSuit } from "@/services/missionGraph/slotParams";
import type { ResourceOption } from "@/services/missionGraph/resources";
import { BlueprintNode, CommentNode, EndNode, NODE_DESCRIPTIONS, NODE_LABELS, NODE_LIBRARY, OpeningNode, PhaseNode, TodoBadge, kindAccentStyle, type EditorFlowNode } from "./FlowNodes";
import { kindColor, SCHEME_PALETTES, type MissionScheme } from "../schemes";
import { NODE_DRAG_TYPE } from "./NodeLibrary";
import "@xyflow/react/dist/style.css";
import "./flow.css";

type Addable = AddableKind;
const nodeTypes = { mission: BlueprintNode, comment: CommentNode, opening: OpeningNode, phase: PhaseNode, end: EndNode };
interface Props {
  graph: MissionGraph; disabled: boolean; issues: GraphIssue[]; selected: string | null;
  units?: readonly Pick<ResourceOption, "value" | "label">[];
  scheme?: MissionScheme;
  onSelect: (id: string | null) => void;
  onChange: (graph: MissionGraph, semantic?: boolean) => void;
  onError: (message: string) => void;
  onUndo: () => void; onRedo: () => void; onSave: () => void;
}
export interface GraphCanvasHandle { add: (kind: Addable, source?: string) => void; focus: (id: string) => void; viewport: () => Viewport }
type Menu = { x: number; y: number; point: Position; source?: string };

function slotSuits(graph: MissionGraph, units: readonly Pick<ResourceOption, "value" | "label">[]): Record<number, SlotSuit> {
  const suits: Record<number, SlotSuit> = {};
  for (const slot of graph.slots) suits[slot.params[0]] = slotSuit(slot, units);
  return suits;
}

function suitForNode(graph: MissionGraph, node: MissionGraph["nodes"][number], suits: Record<number, SlotSuit>): SlotSuit | undefined {
  const data = node.data;
  const slotId = data.kind === "deploy" || data.kind === "message" ? data.slot
    : data.kind === "condition" && data.trigger.kind === "slot_hp_percent_at_most" ? data.trigger.slot
    : undefined;
  return slotId === undefined ? undefined : suits[slotId];
}

function visualEdgeId(source: string, target: string) {
  return edgeId({ source, target });
}

function visualEdgePaint(sourceId: string, projection: PhaseProjection, scheme: MissionScheme) {
  const palette = SCHEME_PALETTES[scheme];
  const stroke = projection.opening?.id === sourceId ? palette.opening
    : projection.end?.id === sourceId ? palette.end
    : palette.phase;
  return {
    style: { stroke, strokeWidth: 2.5 },
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: stroke },
  };
}

function retainNode(previous: Map<string, EditorFlowNode>, node: EditorFlowNode): EditorFlowNode {
  const prev = previous.get(node.id);
  const autoHeight = node.style?.height === "auto";
  const width = node.width ?? prev?.width;
  const height = autoHeight ? undefined : node.height ?? prev?.height;
  const measured = autoHeight ? prev?.measured : prev?.measured ?? (width && height ? { width, height } : undefined);
  const next: EditorFlowNode = {
    ...(prev ?? node),
    ...node,
    position: node.position,
    selected: node.selected,
    ariaLabel: node.ariaLabel,
    deletable: node.deletable,
    hidden: false,
    width,
    height,
    measured,
    style: { ...prev?.style, ...node.style },
  };
  if (autoHeight) {
    delete next.height;
    delete next.initialHeight;
  }
  return next;
}

const InnerCanvas = forwardRef<GraphCanvasHandle, Props>(function InnerCanvas(props, ref) {
  const { graph, disabled, issues, scheme = "zinc" } = props;
  const latest = useRef(props); latest.current = props;
  const root = useRef<HTMLDivElement>(null);
  const flow = useReactFlow<EditorFlowNode>();
  const [nodes, setNodes] = useNodesState<EditorFlowNode>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edgesRef = useRef(edges); edgesRef.current = edges;
  const [menu, setMenu] = useState<Menu | null>(null);
  const [query, setQuery] = useState("");
  const [snapToGrid, setSnapToGrid] = useState(true);
  const snapRef = useRef(snapToGrid); snapRef.current = snapToGrid;
  const [showMinimap, setShowMinimap] = useState(true);
  const [clipboardBusy, setClipboardBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [zoom, setZoom] = useState(100);
  const disabledRef = useRef(false); disabledRef.current = disabled || clipboardBusy;
  const reconnecting = useRef<string | null>(null);
  const pendingSelection = useRef<string[] | null>(null);
  const pendingFit = useRef(false);
  const lastDrag = useRef("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const resize = useCallback((id: string, size: ResizeParams) => {
    if (disabledRef.current) return;
    const { graph, onChange } = latest.current;
    onChange({ ...graph, comments: graph.comments.map((c) => c.id === id ? { ...c, x: snap(size.x), y: snap(size.y), width: size.width, height: size.height } : c) }, false);
  }, []);
  const selectAction = useCallback((id: string) => latest.current.onSelect(id), []);
  const deleteFocus = useCallback((id: string) => {
    if (disabledRef.current) return;
    const current = latest.current.graph;
    const next = removeKeepingChain(current, expandSelection(current, [id]));
    latest.current.onChange(next, next.nodes.length !== current.nodes.length);
    if (latest.current.selected === id || hostOf(derivePhaseProjection(current), latest.current.selected ?? "") === id) latest.current.onSelect(null);
  }, []);
  const toggle = useCallback((id: string) => {
    if (disabledRef.current) return;
    latest.current.onChange(toggleCollapsed(latest.current.graph, id).graph, false);
  }, []);

  useEffect(() => {
    const projection = derivePhaseProjection(graph);
    const suits = slotSuits(graph, props.units ?? []);
    const selection = pendingSelection.current;
    const budgetPoints = new Map(missionBudget(graph).map((point) => [point.visualId, point] as const));
    setNodes((current) => {
      const previous = new Map(current.map((n) => [n.id, n]));
      const picked = (id: string) => selection ? selection.includes(id) : previous.get(id)?.selected;
      const next: EditorFlowNode[] = graph.comments.map((c): EditorFlowNode => retainNode(previous, {
        id: c.id, type: "comment", position: { x: c.x, y: c.y }, data: { comment: c, onResize: resize },
        width: c.width, height: c.height, style: { width: c.width, height: c.height }, zIndex: -1, dragHandle: ".mission-comment-title",
        selected: Boolean(picked(c.id)), ariaLabel: `Comment ${c.label}`,
      }));
      if (projection.opening) {
        const start = graph.nodes.find((node) => node.id === projection.opening!.startId)!;
        next.push(retainNode(previous, {
          id: projection.opening.id, type: "opening", position: { x: start.x, y: start.y },
          width: 280, style: { width: 280, height: "auto" },
          data: {
            opening: projection.opening, budget: budgetPoints.get(projection.opening.id), issues,
            selectedAction: latest.current.selected, suits, onSelectAction: selectAction, onDeleteAction: deleteFocus,
          },
          selected: Boolean(picked(projection.opening.id) || latest.current.selected === projection.opening.id),
          deletable: false, ariaLabel: `Select ${projection.opening.label}`,
        }));
      }
      for (const phase of projection.phases) {
        const origin = graph.nodes.find((node) => node.id === phase.id)!;
        next.push(retainNode(previous, {
          id: phase.id, type: "phase", position: { x: origin.x, y: origin.y },
          width: 280, style: { width: 280, height: "auto" },
          data: {
            phase, budget: budgetPoints.get(phase.id), issues, selectedAction: latest.current.selected,
            suits, onSelectAction: selectAction, onDeleteAction: deleteFocus,
            onDeletePhase: () => deleteFocus(phase.id), onToggle: () => toggle(phase.id),
          },
          selected: Boolean(picked(phase.id) || latest.current.selected === phase.id),
          deletable: true, ariaLabel: `Select ${phase.label}`,
        }));
      }
      if (projection.end) {
        const origin = graph.nodes.find((node) => node.id === projection.end!.id)!;
        next.push(retainNode(previous, {
          id: projection.end.id, type: "end", position: { x: origin.x, y: origin.y },
          width: 280, style: { width: 280, height: "auto" },
          data: { label: projection.end.label, issues: issuesForMembers(issues, [projection.end.id]) },
          selected: Boolean(picked(projection.end.id)), deletable: false, ariaLabel: `Select ${projection.end.label}`,
        }));
      }
      for (const node of [...projection.drafts, ...projection.planned]) {
        const d = node.data;
        const planned = isPlannedKind(d.kind);
        next.push(retainNode(previous, {
          id: node.id, type: "mission", position: { x: node.x, y: node.y },
          width: NODE_WIDTH, initialWidth: NODE_WIDTH, style: { width: NODE_WIDTH, height: "auto" },
          data: { node, orphan: true, suit: suitForNode(graph, node, suits) },
          selected: Boolean(picked(node.id)), deletable: d.kind !== "start" && d.kind !== "end",
          ariaLabel: planned ? `TODO Select ${node.label}` : `Select ${node.label}`,
        }));
      }
      return next;
    });
    setEdges((current) => projection.visualEdges.map((edge) => ({
      id: visualEdgeId(edge.source, edge.target), ...edge, sourceHandle: "exec-out", targetHandle: "exec-in",
      type: "default", ...visualEdgePaint(edge.source, projection, scheme), interactionWidth: 24,
      selected: current.find((old) => old.id === visualEdgeId(edge.source, edge.target))?.selected,
      ariaLabel: `Connection ${edge.source} to ${edge.target}`,
    })));
    pendingSelection.current = null;
    if (pendingFit.current) { pendingFit.current = false; requestAnimationFrame(() => { if (alive.current) void flow.fitView({ padding: 0.18, duration: 250 }); }); }
  }, [graph.nodes, graph.edges, graph.comments, graph.slots, graph.collapsed, issues, props.selected, props.units, scheme, setNodes, setEdges, flow, resize, selectAction, deleteFocus, toggle]);

  function center(): Position {
    const box = root.current!.getBoundingClientRect();
    return flow.screenToFlowPosition({ x: box.left + box.width / 2 - NODE_WIDTH / 2, y: box.top + box.height / 2 - 80 });
  }
  function select(ids: string[]) {
    setNodes((current) => current.map((n) => ({ ...n, selected: ids.includes(n.id) })));
    latest.current.onSelect(ids.length ? ids[ids.length - 1] : null);
  }
  function add(kind: Addable, position = center(), source?: string) {
    if (disabledRef.current) return;
    try {
      if (isNoGoKind(kind)) throw new Error(`${NODE_LABELS[kind]}: TODO No-Go — cannot instantiate as a working node`);
      const current = latest.current.graph;
      if (current.nodes.length >= 512) throw new Error("At most 512 execution nodes are supported");
      const point = source
        ? position
        : { x: Number.isFinite(position.x) ? position.x : 260, y: Number.isFinite(position.y) ? position.y : 160 };
      const node = { ...placeNode(current, kind, point.x, point.y), label: NODE_LABELS[kind] };
      const next = source && !isPlannedKind(kind)
        ? insertNodeAfter(current, lastNodeId(derivePhaseProjection(current), source), node)
        : { ...current, nodes: [...current.nodes, node] };
      pendingSelection.current = [node.id]; latest.current.onChange(next); latest.current.onSelect(node.id);
      setMenu(null); setQuery(""); root.current?.focus();
    } catch (error) { latest.current.onError(String(error)); }
  }
  useImperativeHandle(ref, () => ({ add: (kind, source) => add(kind, center(), source), viewport: () => flow.getViewport(), focus: (id) => {
    const projection = derivePhaseProjection(latest.current.graph);
    const visual = projection.opening?.memberIds.includes(id) ? projection.opening.id
      : projection.phases.find((phase) => phase.memberIds.includes(id))?.id ?? id;
    select([visual]); latest.current.onSelect(id); void flow.fitView({ nodes: [{ id: visual }], padding: 1, maxZoom: 1, duration: 200 }); root.current?.focus();
  } }));

  const commitPositions = useCallback((positions: Map<string, Position>) => {
    if (disabledRef.current) return;
    const { graph, onChange } = latest.current;
    const changed = new Map([...positions].filter(([id, p]) => {
      const old = [...graph.nodes, ...graph.comments].find((n) => n.id === id);
      return old && (old.x !== p.x || old.y !== p.y);
    }));
    if (!changed.size) return;
    const key = JSON.stringify([...changed]);
    if (key === lastDrag.current) return;
    lastDrag.current = key;
    onChange(moveElements(graph, changed, snapRef.current), false);
  }, []);
  const onNodesChange = useCallback((changes: NodeChange<EditorFlowNode>[]) => {
    if (disabledRef.current) return;
    const usable = changes.filter((change) => change.type !== "remove" && change.type !== "add");
    if (usable.length) setNodes((current) => applyNodeChanges(usable, current));
    const positions = new Map<string, Position>();
    const resizing = usable.some((c) => c.type === "dimensions");
    for (const c of usable) if (!resizing && c.type === "position" && !c.dragging && c.position) positions.set(c.id, c.position);
    if (positions.size) { lastDrag.current = ""; commitPositions(positions); }
  }, [commitPositions, setNodes]);
  const onSelectionChange = useCallback(({ nodes }: { nodes: EditorFlowNode[] }) => { latest.current.onSelect(nodes.length ? nodes[nodes.length - 1].id : null); }, []);
  const selectedNodes = nodes.filter((n) => n.selected).map((n) => n.id);
  const focusNode = graph.nodes.find((node) => node.id === props.selected);
  const canDeleteFocus = Boolean(focusNode && focusNode.data.kind !== "start" && focusNode.data.kind !== "end");
  function selectionIds() { return nodesRef.current.filter((n) => n.selected).map((n) => n.id); }
  function actualEdgeIds(graph: MissionGraph, projection: PhaseProjection, ids: string[]) {
    return ids.map((id) => {
      try {
        const [source, target] = JSON.parse(id) as [string, string];
        return edgeId({ source: lastNodeId(projection, source), target: firstNodeId(projection, target) });
      } catch { return id; }
    });
  }
  function remove() {
    if (disabledRef.current) return;
    const graph = latest.current.graph;
    const projection = derivePhaseProjection(graph);
    const edgeIds = actualEdgeIds(graph, projection, edgesRef.current.filter((e) => e.selected).map((e) => e.id));
    const focus = latest.current.selected;
    const host = focus ? hostOf(projection, focus) : null;
    const actionOnly = Boolean(focus && host && focus !== host);
    const nodeIds = actionOnly ? [focus!] : expandSelection(graph, selectionIds());
    if (!nodeIds.length && !edgeIds.length) return;
    let next = nodeIds.length ? removeKeepingChain(graph, nodeIds) : graph;
    if (edgeIds.length) next = deleteSelection(next, [], edgeIds);
    latest.current.onChange(next, next.nodes.length !== graph.nodes.length || next.edges.length !== graph.edges.length);
    latest.current.onSelect(null); setMenu(null);
  }
  async function copy() {
    if (disabledRef.current) return;
    const fragment = copySelection(latest.current.graph, expandSelection(latest.current.graph, selectionIds()));
    if (!fragment.nodes.length && !fragment.comments.length) { setNotice("Start and End cannot be copied."); return; }
    setClipboardBusy(true); disabledRef.current = true;
    try { await writeText(JSON.stringify(fragment)); if (alive.current) setNotice(`Copied ${fragment.nodes.length} nodes and ${fragment.comments.length} comments`); }
    catch (error) { if (alive.current) latest.current.onError(String(error)); }
    finally { if (alive.current) { setClipboardBusy(false); disabledRef.current = latest.current.disabled; } }
  }
  async function paste(position = center()) {
    if (disabledRef.current) return;
    setClipboardBusy(true); disabledRef.current = true;
    try {
      const text = await readText();
      if (!alive.current || latest.current.disabled) return;
      const result = pasteSelection(latest.current.graph, parseFragment(text ?? ""), position);
      if (result.selected.length) {
        pendingSelection.current = result.selected; latest.current.onChange(result.graph); latest.current.onSelect(result.selected[0]);
        setNotice("Pasted selection. Unit references are retained; review deployment slots.");
      }
    } catch (error) { if (alive.current) latest.current.onError(String(error)); }
    finally { if (alive.current) { setClipboardBusy(false); disabledRef.current = latest.current.disabled; setMenu(null); } }
  }
  function duplicate() {
    if (disabledRef.current) return;
    try {
      const current = latest.current.graph, fragment = copySelection(current, expandSelection(current, selectionIds()));
      const elements = [...fragment.nodes, ...fragment.comments];
      if (!elements.length) return;
      const result = pasteSelection(current, fragment, { x: Math.min(...elements.map((n) => n.x)) + 48, y: Math.min(...elements.map((n) => n.y)) + 48 });
      pendingSelection.current = result.selected; latest.current.onChange(result.graph); latest.current.onSelect(result.selected[0]); setMenu(null);
      setNotice("Duplicated selection. Unit references are retained; review deployment slots.");
    } catch (error) { latest.current.onError(String(error)); }
  }
  function comment(position = center()) {
    if (disabledRef.current) return;
    try {
      const result = addComment(latest.current.graph, expandSelection(latest.current.graph, selectionIds()), position);
      pendingSelection.current = [result.id]; latest.current.onChange(result.graph, false); latest.current.onSelect(result.id); setMenu(null);
    } catch (error) { latest.current.onError(String(error)); }
  }
  function fit() { void flow.fitView({ nodes: selectedNodes.length ? selectedNodes.map((id) => ({ id })) : undefined, padding: 0.25, maxZoom: 1, duration: 200 }); }
  function openMenu(clientX: number, clientY: number, source?: string) {
    if (disabledRef.current) return;
    const bounds = root.current!.getBoundingClientRect();
    setQuery(""); setMenu({ x: Math.max(8, Math.min(clientX - bounds.left, bounds.width - 264)), y: Math.max(8, Math.min(clientY - bounds.top, bounds.height - 390)), point: flow.screenToFlowPosition({ x: clientX, y: clientY }), source });
  }
  function keyDown(event: KeyboardEvent) {
    if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
    const modifier = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    if (key === "escape") { setMenu(null); return; }
    if (disabledRef.current) return;
    if (modifier && key === "s") { event.preventDefault(); latest.current.onSave(); }
    else if (modifier && key === "z") { event.preventDefault(); event.shiftKey ? latest.current.onRedo() : latest.current.onUndo(); }
    else if (modifier && key === "y") { event.preventDefault(); latest.current.onRedo(); }
    else if (modifier && key === "c") { event.preventDefault(); void copy(); }
    else if (modifier && key === "v") { event.preventDefault(); void paste(); }
    else if (modifier && key === "d") { event.preventDefault(); duplicate(); }
    else if (modifier && key === "a") { event.preventDefault(); select(nodes.map((n) => n.id)); }
    else if (key === "delete" || key === "backspace") { event.preventDefault(); remove(); }
    else if (!modifier && key === "c") { event.preventDefault(); comment(); }
    else if (!modifier && key === "f") { event.preventDefault(); fit(); }
    else if (!modifier && (key === "arrowleft" || key === "arrowright" || key === "arrowup" || key === "arrowdown")) {
      const focused = (event.target as HTMLElement).closest(".react-flow__node")?.getAttribute("data-id");
      const ids = selectionIds().length ? selectionIds() : focused ? [focused] : [];
      if (!ids.length) return;
      event.preventDefault();
      const current = latest.current.graph;
      const dx = key === "arrowleft" ? -SNAP : key === "arrowright" ? SNAP : 0;
      const dy = key === "arrowup" ? -SNAP : key === "arrowdown" ? SNAP : 0;
      const positions = new Map<string, Position>();
      for (const id of ids) {
        const item = [...current.nodes, ...current.comments].find((entry) => entry.id === id);
        if (item) positions.set(id, { x: item.x + dx, y: item.y + dy });
      }
      if (positions.size) latest.current.onChange(moveElements(current, positions, snapRef.current), false);
    }
    else if (key === "tab" && event.target === root.current) { event.preventDefault(); const b = root.current!.getBoundingClientRect(); openMenu(b.left + b.width / 2, b.top + b.height / 2); }
  }
  const isValidConnection = useCallback((connection: Connection | Edge) => {
    if (disabledRef.current || connection.sourceHandle !== "exec-out" || connection.targetHandle !== "exec-in") return false;
    try {
      const graph = latest.current.graph;
      const base = reconnecting.current ? { ...graph, edges: graph.edges.filter((e) => edgeId(e) !== reconnecting.current && visualEdgeId(e.source, e.target) !== reconnecting.current) } : graph;
      connectVisual(base, connection.source!, connection.target!); return true;
    } catch { return false; }
  }, []);
  function connect(connection: Connection, previous?: Edge) {
    if (disabledRef.current) return;
    try {
      const current = latest.current.graph;
      const base = previous ? disconnectVisual(current, previous.source, previous.target) : current;
      latest.current.onChange(connectVisual(base, connection.source!, connection.target!));
    } catch (error) { latest.current.onError(String(error)); }
  }
  const library = (source?: string) => {
    const projection = derivePhaseProjection(latest.current.graph);
    const opening = source && projection.opening?.id === source;
    const execution = NODE_LIBRARY.filter((kind) => !opening || kind === "condition" || kind === "deploy");
    return execution;
  };
  return <div className="mission-flow" id="mission-graph-canvas" ref={root} tabIndex={0} aria-label="Mission graph canvas" onKeyDown={keyDown}
    onPointerDownCapture={(e) => { if (!(e.target as HTMLElement).closest(".mission-context-menu")) setMenu(null); }}
    onDragOver={(event) => { if (!disabledRef.current) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
    onDrop={(event) => { event.preventDefault(); const kind = event.dataTransfer.getData(NODE_DRAG_TYPE); if ((NODE_LIBRARY as readonly string[]).includes(kind)) add(kind as Addable, flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })); }}>
    <ReactFlow<EditorFlowNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode="dark" proOptions={{ hideAttribution: true }}
      onNodesChange={onNodesChange} onEdgesChange={(changes) => { if (!disabledRef.current) setEdges((current) => applyEdgeChanges(changes, current)); }}
      onNodeClick={(_, node) => { latest.current.onSelect(node.id); }} onSelectionChange={onSelectionChange}
      onNodeDragStart={() => { lastDrag.current = ""; }} onSelectionDragStart={() => { lastDrag.current = ""; }}
      onConnect={(connection) => connect(connection)} isValidConnection={isValidConnection}
      onReconnectStart={(_, edge) => { reconnecting.current = edge.id; }} onReconnect={(edge, connection) => connect(connection, edge)} onReconnectEnd={() => { reconnecting.current = null; }}
      onConnectEnd={(event, state) => {
        if (!state.isValid && !state.toNode && state.fromHandle?.type === "source" && state.fromNode) {
          const point = "changedTouches" in event ? event.changedTouches[0] : event;
          openMenu(point.clientX, point.clientY, state.fromNode.id);
        }
      }}
      onPaneContextMenu={(event) => { event.preventDefault(); openMenu(event.clientX, event.clientY); }}
      onNodeContextMenu={(event, node) => { event.preventDefault(); if (!node.selected) select([node.id]); openMenu(event.clientX, event.clientY, node.type !== "end" && node.type !== "comment" ? node.id : undefined); }}
      onEdgeContextMenu={(event, edge) => { event.preventDefault(); setEdges((all) => all.map((e) => ({ ...e, selected: e.id === edge.id }))); openMenu(event.clientX, event.clientY); }}
      onPaneClick={() => { latest.current.onSelect(null); root.current?.focus(); }} onMove={(_, viewport) => setZoom(Math.round(viewport.zoom * 100))}
      defaultViewport={graph.viewport ?? { x: 48, y: 120, zoom: 0.75 }} fitView={!graph.viewport} fitViewOptions={{ padding: 0.24, maxZoom: 1 }}
      nodesDraggable={!disabled && !clipboardBusy} nodesConnectable={!disabled && !clipboardBusy} edgesReconnectable={!disabled && !clipboardBusy}
      elementsSelectable={!disabled && !clipboardBusy} deleteKeyCode={null} disableKeyboardA11y
      onlyRenderVisibleElements={false} multiSelectionKeyCode={["Shift", "Control", "Meta"]}
      selectionOnDrag selectionMode={SelectionMode.Partial} panOnDrag={[1, 2]} panActivationKeyCode="Space" selectionKeyCode="Shift"
      snapToGrid={snapToGrid} snapGrid={[16, 16]} minZoom={0.1} maxZoom={2} connectOnClick connectionRadius={24}
      nodeExtent={[[-100000, -100000], [100000, 100000]]} elevateNodesOnSelect={false}>
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="oklch(1 0 0 / 0.16)" />
      <Controls showInteractive={false} />
      {showMinimap && <MiniMap pannable zoomable nodeColor={(n) => {
        const node = n as EditorFlowNode;
        if (node.type === "opening") return kindColor("start", scheme);
        if (node.type === "phase") return kindColor("condition", scheme);
        if (node.type === "end") return kindColor("end", scheme);
        if (node.type === "mission") return kindColor(node.data.node.data.kind, scheme);
        return SCHEME_PALETTES[scheme].end;
      }} style={{ width: 150, height: 96 }} />}
      <Panel position="top-center" className="mission-graph-tools-host"><div className="mission-flow-toolbar" aria-label="Graph tools">
        <button aria-label="Frame selection" title="Frame selection (F)" onClick={fit}><Scan size={14} /></button>
        <button aria-label="Auto layout" title="Arrange execution flow" disabled={disabled || clipboardBusy} onClick={() => { pendingFit.current = true; latest.current.onChange(layoutGraph(graph), false); }}><LayoutGrid size={14} /></button>
        <span className="divider" />
        <button aria-label="Copy selection" title="Copy (Ctrl+C)" disabled={disabled || clipboardBusy || !selectedNodes.length} onClick={() => void copy()}><Copy size={14} /></button>
        <button aria-label="Duplicate selection" title="Duplicate (Ctrl+D)" disabled={disabled || clipboardBusy || !selectedNodes.length} onClick={duplicate}>Duplicate</button>
        <button aria-label="Delete selection" title="Delete" disabled={disabled || clipboardBusy || (!selectedNodes.length && !edges.filter((e) => e.selected).length && !canDeleteFocus)} onClick={remove}><Trash2 size={14} /></button>
        <button aria-label="Add comment" title="Comment around selection (C)" disabled={disabled || clipboardBusy} onClick={() => comment()}><MessageSquarePlus size={14} /></button>
        <span className="divider" />
        <button aria-label="Align left" disabled={disabled || clipboardBusy || selectedNodes.length < 2} onClick={() => latest.current.onChange(alignSelection(graph, expandSelection(graph, selectedNodes), "x"), false)}><AlignHorizontalJustifyStart size={14} /></button>
        <button aria-label="Align top" disabled={disabled || clipboardBusy || selectedNodes.length < 2} onClick={() => latest.current.onChange(alignSelection(graph, expandSelection(graph, selectedNodes), "y"), false)}><AlignVerticalJustifyStart size={14} /></button>
        <button aria-label="Snap to grid" aria-pressed={snapToGrid} onClick={() => setSnapToGrid(!snapToGrid)}><Grid2X2 size={14} /></button>
        <button aria-label="Toggle minimap" aria-pressed={showMinimap} onClick={() => setShowMinimap(!showMinimap)}><MousePointer2 size={14} /></button>
      </div></Panel>
      <Panel position="bottom-left" className="mission-graph-status-host"><div className="mission-flow-status">{notice || `${derivePhaseProjection(graph).phases.length} phases · ${graph.nodes.length} nodes`} · {zoom}%</div></Panel>
    </ReactFlow>
    {menu && <div className="mission-context-menu nodrag nopan" role="dialog" aria-label="Graph action menu" style={{ left: menu.x, top: menu.y }} onKeyDown={(e) => { if (e.key === "Escape") { setMenu(null); root.current?.focus(); } }}>
      <input autoFocus aria-label="Search graph actions" placeholder={menu.source ? "Add connected action…" : "Search actions…"} value={query} onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { const kind = library(menu.source).find((k) => `${NODE_LABELS[k]} ${NODE_DESCRIPTIONS[k]}`.toLowerCase().includes(query.toLowerCase())); if (kind) add(kind, menu.point, menu.source); } }} />
      {library(menu.source).filter((kind) => `${NODE_LABELS[kind]} ${NODE_DESCRIPTIONS[kind]} TODO`.toLowerCase().includes(query.toLowerCase())).map((kind) => {
        const planned = isPlannedKind(kind);
        return <button key={kind} type="button" style={kindAccentStyle(kind)} aria-label={planned ? `TODO ${NODE_LABELS[kind]}` : NODE_LABELS[kind]} onClick={() => add(kind, menu.point, menu.source)}>
          {planned && <TodoBadge />}
          <span className="mission-kind-dot" />{NODE_LABELS[kind]}
        </button>;
      })}
      {!query && <><div className="mission-menu-heading">Selection</div>
        <button disabled={!selectedNodes.length} onClick={() => { void copy(); setMenu(null); }}>Copy <span className="ml-auto">Ctrl C</span></button>
        <button onClick={() => void paste(menu.point)}>Paste here <span className="ml-auto">Ctrl V</span></button>
        <button disabled={!selectedNodes.length} onClick={duplicate}>Duplicate <span className="ml-auto">Ctrl D</span></button>
        <button onClick={() => comment(menu.point)}>Add comment <span className="ml-auto">C</span></button>
        <button disabled={!selectedNodes.length && !edges.filter((e) => e.selected).length && !canDeleteFocus} onClick={remove}>Delete selection <span className="ml-auto">Del</span></button>
      </>}
    </div>}
  </div>;
});

export const GraphCanvas = forwardRef<GraphCanvasHandle, Props>(function GraphCanvas(props, ref) {
  return <ReactFlowProvider><InnerCanvas {...props} ref={ref} /></ReactFlowProvider>;
});

export type { ActionKind };

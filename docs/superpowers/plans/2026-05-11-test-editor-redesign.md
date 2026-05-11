# TestEditor UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the `TestEditor` page to a professional tiling workspace architecture, eliminating floating modals and maximizing screen utilization.

**Architecture:** A centralized `WorkspaceStore` manages a recursive tiling layout of panels. A `DocumentRegistry` tracks open files and their dirty states. The UI consists of a collapsible sidebar, a dynamic tiling center area, and a context-aware inspector.

**Tech Stack:** React, Tailwind CSS, Lucide Icons, Zustand (for state), Radix UI (for primitives).

---

### Task 1: Document Registry & Workspace Store

**Files:**
- Create: `src/page/TestEditor/store/useWorkspaceStore.ts`
- Create: `src/page/TestEditor/store/useDocumentRegistry.ts`
- Test: `src/page/TestEditor/store/workspaceStore.test.ts`

- [ ] **Step 1: Write tests for Document Registry**
```typescript
import { renderHook, act } from '@testing-library/react';
import { useDocumentRegistry } from './useDocumentRegistry';

test('should track open documents and dirty states', () => {
  const { result } = renderHook(() => useDocumentRegistry());
  act(() => {
    result.current.openDocument('file1.json', { content: {} });
  });
  expect(result.current.documents['file1.json']).toBeDefined();
  act(() => {
    result.current.setDirty('file1.json', true);
  });
  expect(result.current.documents['file1.json'].isDirty).toBe(true);
});
```

- [ ] **Step 2: Implement Document Registry**
```typescript
import { create } from 'zustand';

interface Document {
  path: string;
  data: any;
  isDirty: boolean;
}

interface DocumentRegistryState {
  documents: Record<string, Document>;
  openDocument: (path: string, data: any) => void;
  setDirty: (path: string, dirty: boolean) => void;
  closeDocument: (path: string) => void;
}

export const useDocumentRegistry = create<DocumentRegistryState>((set) => ({
  documents: {},
  openDocument: (path, data) => set((state) => ({
    documents: { ...state.documents, [path]: { path, data, isDirty: false } }
  })),
  setDirty: (path, dirty) => set((state) => ({
    documents: { ...state.documents, [path]: { ...state.documents[path], isDirty: dirty } }
  })),
  closeDocument: (path) => set((state) => {
    const { [path]: _, ...rest } = state.documents;
    return { documents: rest };
  }),
}));
```

- [ ] **Step 3: Write tests for Workspace Store (Tiling Layout)**
```typescript
import { renderHook, act } from '@testing-library/react';
import { useWorkspaceStore } from './useWorkspaceStore';

test('should manage tiling layout splits', () => {
  const { result } = renderHook(() => useWorkspaceStore());
  act(() => {
    result.current.splitPanel('root', 'horizontal');
  });
  expect(result.current.layout.type).toBe('split');
  expect(result.current.layout.direction).toBe('horizontal');
});
```

- [ ] **Step 4: Implement Workspace Store**
```typescript
import { create } from 'zustand';

export type PanelType = '3d' | 'msc' | 'jnttbl' | 'numatb' | 'numdlb' | 'effect';

export interface LayoutNode {
  id: string;
  type: 'panel' | 'split';
  direction?: 'horizontal' | 'vertical';
  children?: LayoutNode[];
  panels?: { id: string; type: PanelType; path: string }[];
  activeIndex?: number;
}

interface WorkspaceState {
  layout: LayoutNode;
  activePanelId: string | null;
  splitPanel: (id: string, direction: 'horizontal' | 'vertical') => void;
  setActivePanel: (id: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  layout: { id: 'root', type: 'panel', panels: [] },
  activePanelId: null,
  splitPanel: (id, direction) => set((state) => {
    // Logic to find node by id and transform it into a split node
    return { ...state }; // Simplified for plan
  }),
  setActivePanel: (id) => set({ activePanelId: id }),
}));
```

- [ ] **Step 5: Commit**
```bash
git add src/page/TestEditor/store/
git commit -m "feat: implement document registry and workspace store"
```

---

### Task 2: Collapsible Sidebar Component

**Files:**
- Create: `src/page/TestEditor/components/Sidebar.tsx`
- Modify: `src/page/TestEditor/components/FileTreePane.tsx`

- [ ] **Step 1: Implement Sidebar Wrapper**
```tsx
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Settings, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Sidebar = ({ children }: { children: React.ReactNode }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  return (
    <div className={cn("flex flex-col border-r bg-zinc-950 transition-all", isCollapsed ? "w-12" : "w-64")}>
      <div className="flex h-10 items-center justify-between px-2 border-b">
        {!isCollapsed && <span className="text-xs font-bold text-zinc-400">EXPLORER</span>}
        <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1 hover:bg-zinc-800 rounded">
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      <div className={cn("flex-1 overflow-hidden", isCollapsed && "hidden")}>
        {children}
      </div>
      <div className="flex flex-col gap-2 p-2 border-t">
        <button className="p-2 hover:bg-zinc-800 rounded text-zinc-400"><Search size={20} /></button>
        <button className="p-2 hover:bg-zinc-800 rounded text-zinc-400"><Package size={20} /></button>
        <button className="p-2 hover:bg-zinc-800 rounded text-zinc-400"><Settings size={20} /></button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Integrate Virtualized File Tree**
Modify `FileTreePane.tsx` to use `react-window` for performance.

- [ ] **Step 3: Commit**
```bash
git add src/page/TestEditor/components/Sidebar.tsx
git commit -m "feat: add collapsible sidebar with quick actions"
```

---

### Task 3: Tiling Workspace Engine

**Files:**
- Create: `src/page/TestEditor/components/WorkspaceGrid.tsx`
- Create: `src/page/TestEditor/components/PanelGroup.tsx`

- [ ] **Step 1: Implement Recursive Grid Renderer**
```tsx
import React from 'react';
import { LayoutNode, useWorkspaceStore } from '../store/useWorkspaceStore';
import { PanelGroup } from './PanelGroup';

export const WorkspaceGrid = ({ node }: { node: LayoutNode }) => {
  if (node.type === 'panel') {
    return <PanelGroup node={node} />;
  }
  return (
    <div className={cn("flex h-full w-full", node.direction === 'vertical' ? "flex-col" : "flex-row")}>
      {node.children?.map((child, i) => (
        <React.Fragment key={child.id}>
          <div className="flex-1 min-w-0 min-h-0">
            <WorkspaceGrid node={child} />
          </div>
          {i < node.children!.length - 1 && (
            <div className={cn("bg-zinc-800 hover:bg-blue-500 transition-colors", node.direction === 'vertical' ? "h-1 cursor-ns-resize" : "w-1 cursor-ew-resize")} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Implement Panel Group (Tabs)**
```tsx
import React from 'react';
import { LayoutNode } from '../store/useWorkspaceStore';
import { X, Columns, Rows } from 'lucide-react';

export const PanelGroup = ({ node }: { node: LayoutNode }) => {
  return (
    <div className="flex h-full flex-col bg-zinc-900 border">
      <div className="flex h-9 items-center bg-zinc-950 px-1 gap-1 border-b">
        {node.panels?.map((p, i) => (
          <div key={p.id} className={cn("flex items-center h-full px-3 text-xs gap-2 cursor-pointer border-r", i === node.activeIndex ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-800")}>
            <span>{p.type.toUpperCase()}</span>
            <X size={12} className="hover:text-red-400" />
          </div>
        ))}
        <div className="ml-auto flex gap-1 px-2">
          <button className="p-1 hover:bg-zinc-800 rounded"><Columns size={14} /></button>
          <button className="p-1 hover:bg-zinc-800 rounded"><Rows size={14} /></button>
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden">
        {/* Render active panel component here */}
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Commit**
```bash
git add src/page/TestEditor/components/WorkspaceGrid.tsx src/page/TestEditor/components/PanelGroup.tsx
git commit -m "feat: implement tiling workspace engine with recursive splits"
```

---

### Task 4: Panel Content Migration

**Files:**
- Modify: `src/page/TestEditor/components/PanelGroup.tsx`
- Create: `src/page/TestEditor/components/panels/JnttblPanel.tsx`
- Create: `src/page/TestEditor/components/panels/NumdlbPanel.tsx`

- [ ] **Step 1: Extract JNTTBL Editor from Modal**
Move logic from `JnttblEditorModalWindow.tsx` to `JnttblPanel.tsx`, removing modal-specific UI (Dialog, etc.).

- [ ] **Step 2: Extract NUMDLB Editor from Modal**
Move logic from `NumdlbEditorModalWindow.tsx` to `NumdlbPanel.tsx`.

- [ ] **Step 3: Update PanelGroup to render content**
```tsx
// In PanelGroup.tsx
const renderContent = (panel: any) => {
  switch(panel.type) {
    case 'jnttbl': return <JnttblPanel path={panel.path} />;
    case 'numdlb': return <NumdlbPanel path={panel.path} />;
    // ...
    default: return <div className="p-4 text-zinc-600 italic">Select a file to edit</div>;
  }
};
```

- [ ] **Step 4: Commit**
```bash
git add src/page/TestEditor/components/panels/
git commit -m "feat: migrate JNTTBL and NUMDLB editors to workspace panels"
```

---

### Task 5: Context-Aware Inspector

**Files:**
- Create: `src/page/TestEditor/components/Inspector.tsx`
- Modify: `src/page/TestEditor/store/useWorkspaceStore.ts`

- [ ] **Step 1: Implement Inspector UI**
```tsx
import React from 'react';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export const Inspector = () => {
  const activePanelId = useWorkspaceStore(s => s.activePanelId);
  // Fetch properties based on active panel
  return (
    <div className="w-80 border-l bg-zinc-950 flex flex-col">
      <div className="h-10 flex items-center px-4 border-b text-xs font-bold text-zinc-400">INSPECTOR</div>
      <div className="flex-1 overflow-auto p-4">
        {!activePanelId ? (
          <div className="text-zinc-600 italic text-sm">No item selected</div>
        ) : (
          <div className="space-y-4">
            {/* Dynamic property fields */}
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**
```bash
git add src/page/TestEditor/components/Inspector.tsx
git commit -m "feat: add context-aware inspector for property editing"
```

---

### Task 6: Final Page Integration

**Files:**
- Modify: `src/page/TestEditor/page.tsx`

- [ ] **Step 1: Replace 3-column layout with new Workspace**
```tsx
// In page.tsx
return (
  <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
    <Sidebar>
      <FileTreePane ... />
    </Sidebar>
    <main className="flex-1 flex flex-col min-w-0">
      <TestEditorToolbar ... />
      <div className="flex-1 flex min-h-0">
        <WorkspaceGrid node={layout} />
        <Inspector />
      </div>
      <StatusBar />
    </main>
  </div>
);
```

- [ ] **Step 2: Remove Modal Hosts**
Delete `NumdlbEditorModalHost`, `JnttblEditorModalHost`, etc. from `page.tsx`.

- [ ] **Step 3: Final Verification**
- Open multiple files.
- Split panels horizontally and vertically.
- Verify dirty states in tabs.
- Check performance with large file trees.

- [ ] **Step 4: Commit**
```bash
git add src/page/TestEditor/page.tsx
git commit -m "feat: finalize TestEditor redesign with integrated tiling layout"
```

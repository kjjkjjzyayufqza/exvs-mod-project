# Design Spec: TestEditor UI Redesign (Flexible Tiling Layout)

## 1. Overview
Redesign the `TestEditor` page to replace the current modal-heavy, cluttered UI with a professional, flexible tiling workspace. This design focuses on maximizing screen real estate, improving multi-file workflows, and providing a modern "IDE-like" experience for game asset editing.

## 2. Architecture: Flexible Tiling Workspace
The core architecture is based on a **Tiling Window Manager** pattern. The main workspace is no longer a fixed set of tabs but a dynamic grid of panels.

### 2.1 Component Structure
- **`LayoutRoot`**: The top-level container managing the overall grid.
- **`Sidebar` (Left)**: 
    - Collapsible (width: 0 or 240px-400px).
    - Contains: `FileTree`, `GlobalSearch`, `QuickActions`.
- **`WorkspaceArea` (Center)**:
    - Supports recursive splitting (Horizontal/Vertical).
    - Each leaf node is a `PanelGroup` containing one or more `Panel` tabs.
    - `Panel` types: `3DViewport`, `MscEditor`, `JnttblEditor`, `NumatbEditor`, `NumdlbEditor`, `EffectProjectEditor`.
- **`Inspector` (Right)**:
    - Context-aware: displays properties for the currently focused item in the active `Panel`.
    - Collapsible.
- **`StatusBar` (Bottom)**:
    - Global status, task progress, and quick feedback.

### 2.2 Data Flow & State Management
- **`WorkspaceStore`**: A centralized store (Zustand or similar) managing the layout tree.
    - `layoutTree`: A recursive structure defining splits and panel contents.
    - `activePanelId`: Tracks which panel has focus for the `Inspector`.
- **Session Management**:
    - Instead of `numdlbSessions` etc. being global to the page, they are associated with specific `Panel` instances or a global `DocumentRegistry`.
    - `DocumentRegistry`: Tracks open files and their dirty states to prevent redundant loading and handle unsaved changes globally.

## 3. Detailed Component Specs

### 3.1 Sidebar (Optimized)
- **File Tree**: Uses virtualization (e.g., `react-window`) to handle thousands of nodes without lag.
- **Space Optimization**: Sidebar can be collapsed to a thin icon bar or hidden entirely via a shortcut (`Ctrl+B`).

### 3.2 Workspace Panels
- **Splitting**: Each panel has a "Split" icon in its header.
- **Drag & Drop**: Tabs can be dragged between panels to reorganize the layout.
- **Tab Management**: Tabs show dirty indicators (yellow dot) and close buttons.

### 3.3 Inspector
- **Property Grid**: A standardized, searchable grid for editing parameters.
- **Performance**: Large parameter lists (e.g., in `Jnttbl`) are virtualized.

## 4. Visual Style & UX
- **Theme**: "Dark Industrial" (Slate/Zinc palette).
    - Background: `#09090b` (Zinc-950).
    - Surface: `#18181b` (Zinc-900).
    - Accent: `#3b82f6` (Blue-500) for active states.
- **Typography**: 
    - UI: `Inter` or system sans-serif.
    - Code/Data: `JetBrains Mono` or `Fira Code`.
- **Interactions**:
    - 150ms transitions for panel resizing.
    - High-contrast focus rings for keyboard navigation.

## 5. Performance Optimization
- **`useTransition`**: Wrap layout changes (splitting/closing panels) to keep the UI responsive.
- **Deferred Rendering**: Only the active tab in a panel group renders its heavy content (e.g., 3D canvas).
- **Resource Sharing**: Multiple 3D viewports share a single WebGL context if possible, or pause rendering when not visible.

## 6. Implementation Phases
1. **Phase 1**: Infrastructure - Implement the tiling layout engine and basic sidebar.
2. **Phase 2**: Migration - Convert existing Modal-based editors into Workspace Panels.
3. **Phase 3**: Refinement - Implement the Inspector and global Document Registry.
4. **Phase 4**: Polish - Visual refinements, shortcuts, and performance tuning.

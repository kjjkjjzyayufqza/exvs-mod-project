# Stage Import Progress & Debug Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time progress reporting with a step-by-step checklist Dialog, Rust-side structured logging, and best-effort error recovery so the virtual file tree is always visible for debugging — even when rename fails.

**Architecture:** The Rust command emits `stage-import-progress` events via `AppHandle` at each pipeline stage (read → extract → rename → CSV → per-model build). The frontend listens for these events and renders a progress Dialog with a checklist of completed/active/pending steps. The rename function degrades gracefully on insufficient folders instead of returning `Err`, placing errors into warnings so the virtual tree is always returned.

**Tech Stack:** Rust (Tauri AppHandle + Emitter), React (Radix Dialog, Progress, listen from `@tauri-apps/api/event`), lucide-react icons

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/page/SceneEdit/components/StageImportProgressDialog.tsx` | Progress Dialog with step checklist, progress bar, elapsed times |
| Modify | `src-tauri/src/stage_commands.rs` | Add `AppHandle` param, emit progress events at each stage, add logging |
| Modify | `src-tauri/src/fhm2d_memory_preview.rs:1357-1447` | Add progress callback to `build_stage_preview_models`, add logging |
| Modify | `src-tauri/src/format/fhm2d_stage.rs:270-305` | Remove `Err` on too-few-folders, best-effort rename with warnings |
| Modify | `src/page/SceneEdit/page.tsx` | Wire progress Dialog, listen/unlisten events, replace toast progress |

---

## Task 1: Backend — Best-Effort Rename (Remove Hard Error)

**Files:**
- Modify: `src-tauri/src/format/fhm2d_stage.rs:270-305`

- [ ] **Step 1: Replace the early-return error with a warning**

In `stage_rename_in_memory`, replace lines 273-279:

```rust
    let groups = collect_memory_folder_groups(files);
    if groups.len() < 3 {
        return Err(format!(
            "Stage structure has too few folders ({}), expected at least 3 (base, info, ...)",
            groups.len()
        ));
    }
```

With:

```rust
    let groups = collect_memory_folder_groups(files);

    let mut warnings = Vec::new();

    if groups.len() < 3 {
        warnings.push(format!(
            "[ERROR] Stage structure has only {} folder(s), expected at least 3 (base, info, textures). \
             Rename mapping may be incorrect — review the tree below for debugging.",
            groups.len()
        ));
    }
```

And remove the duplicate `let mut warnings = Vec::new();` that was on the next line (line 281 in the old code).

- [ ] **Step 2: Update `determine_memory_folder_name` to handle edge cases**

Currently `determine_memory_folder_name` assumes `total >= 3`. When `total < 3`, position 0 still gets "base", position 1 might be the last but shouldn't be "textures" if there are only 2 folders. Replace the function (located around line 238):

```rust
fn determine_memory_folder_name(
    position: usize,
    total: usize,
    files: &[InMemoryFolderFile],
    warnings: &mut Vec<String>,
) -> (String, &'static str) {
    if total >= 3 {
        if position == 0 {
            return (STAGE_BASE_NAME.to_string(), "base");
        }
        if position == 1 {
            return (STAGE_INFO_NAME.to_string(), "info");
        }
        if position == total - 1 {
            return (STAGE_TEXTURES_NAME.to_string(), "textures");
        }
    }

    if total < 3 && position == 0 {
        return (STAGE_BASE_NAME.to_string(), "base");
    }

    for file in files {
        if file.file_type.eq_ignore_ascii_case(".numdlb") {
            if let Some(name) = read_numdlb_model_name(&file.data) {
                return (name, "sub_model");
            }
        }
    }

    let fallback = format!("unknown_{position}");
    warnings.push(format!(
        "Could not infer name for folder at position {position}, using '{fallback}'"
    ));
    (fallback, "unknown")
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cargo check` (from `src-tauri/`)
Expected: Compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/format/fhm2d_stage.rs
git commit -m "feat(stage): best-effort rename on insufficient folders instead of hard error"
```

---

## Task 2: Backend — Progress Events and Logging in `stage_commands.rs`

**Files:**
- Modify: `src-tauri/src/stage_commands.rs`

- [ ] **Step 1: Rewrite `import_stage_fhm2d_in_memory` with progress emit and logging**

Replace the entire file with:

```rust
//! Tauri command wrappers for stage fhm2d rename and bundle loading.

use serde::Serialize;
use std::time::Instant;
use tauri::{AppHandle, Emitter, State};

use crate::fhm2d_memory_preview::Fhm2dMemorySessionState;
use crate::format::fhm2d::extract_fhm2d_to_memory_impl;
use crate::format::fhm2d_stage;

fn stage_log(msg: &str) {
    eprintln!("[stage_import] {msg}");
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StageImportProgress {
    step: String,
    label: String,
    progress: u8,
    elapsed_ms: Option<u64>,
}

fn emit_progress(app: &AppHandle, step: &str, label: &str, progress: u8, elapsed_ms: Option<u64>) {
    stage_log(&format!("step={step} progress={progress}% label=\"{label}\"{}",
        elapsed_ms.map(|ms| format!(" elapsed={ms}ms")).unwrap_or_default()
    ));
    let _ = app.emit("stage-import-progress", StageImportProgress {
        step: step.to_string(),
        label: label.to_string(),
        progress,
        elapsed_ms,
    });
}

#[tauri::command]
pub async fn stage_apply_rename(
    extracted_dir: String,
) -> Result<fhm2d_stage::StageApplyRenameResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::stage_apply_rename_impl(&extracted_dir)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn load_stage_bundle(
    stage_root: String,
) -> Result<fhm2d_stage::StageBundle, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fhm2d_stage::load_stage_bundle_impl(&stage_root)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn import_stage_fhm2d_in_memory(
    app: AppHandle,
    state: State<'_, Fhm2dMemorySessionState>,
    source_path: String,
) -> Result<fhm2d_stage::StageInMemoryImportResult, String> {
    let path = source_path.trim().to_string();
    if path.is_empty() {
        return Err("source_path cannot be empty.".to_string());
    }

    let source_name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "stage".to_string());

    stage_log(&format!("import start: source={source_name} path={path}"));
    let pipeline_start = Instant::now();

    // ── Step 1: Read file ──────────────────────────────────────────────
    emit_progress(&app, "read", "Reading file...", 5, None);
    let t0 = Instant::now();

    let source_name_for_extract = source_name.clone();
    let app_clone = app.clone();

    let (extraction, virtual_tree, rename_warnings) =
        tauri::async_runtime::spawn_blocking(move || {
            let bytes = std::fs::read(&path)
                .map_err(|e| format!("Failed to read FHM2D file: {e}"))?;
            let file_size = bytes.len();
            let read_ms = t0.elapsed().as_millis() as u64;

            stage_log(&format!("read done: size={} bytes, elapsed={read_ms}ms",
                file_size));

            // ── Step 2: Extract ────────────────────────────────────────
            emit_progress(&app_clone, "extract", "Decompressing FHM2D...", 20, Some(read_ms));
            let t1 = Instant::now();

            let extraction = extract_fhm2d_to_memory_impl(
                &bytes,
                &source_name_for_extract,
                None,
            )?;

            let extract_ms = t1.elapsed().as_millis() as u64;
            stage_log(&format!("extract done: {} files, elapsed={extract_ms}ms",
                extraction.files.len()));

            // ── Step 3: Rename ─────────────────────────────────────────
            emit_progress(&app_clone, "rename", "Analyzing folder structure...", 40, Some(extract_ms));
            let t2 = Instant::now();

            let (virtual_tree, rename_warnings) =
                fhm2d_stage::stage_rename_in_memory(&extraction.files)?;

            let rename_ms = t2.elapsed().as_millis() as u64;
            stage_log(&format!("rename done: {} folders, {} warnings, elapsed={rename_ms}ms",
                virtual_tree.len(), rename_warnings.len()));
            for folder in &virtual_tree {
                stage_log(&format!("  folder {}: {} → {} [{}] ({} files)",
                    folder.original_index,
                    folder.original_index,
                    folder.renamed_name,
                    folder.role,
                    folder.files.len()));
            }

            emit_progress(&app_clone, "csv", "Parsing stage data...", 55, Some(rename_ms));

            Ok::<_, String>((extraction, virtual_tree, rename_warnings))
        })
        .await
        .map_err(|e| e.to_string())??;

    // ── Step 4: Parse CSV ──────────────────────────────────────────────
    let t3 = Instant::now();
    let mut all_warnings = rename_warnings;

    let graphic_param_bytes: Option<Vec<u8>> = fhm2d_stage::find_info_file_data(
        &extraction.files,
        &virtual_tree,
        "graphic_param.csv",
    ).map(|d| d.to_vec());

    let placement_bytes: Option<Vec<u8>> = fhm2d_stage::find_info_file_data(
        &extraction.files,
        &virtual_tree,
        "placement.csv",
    ).map(|d| d.to_vec());

    let graphic_params = match graphic_param_bytes.as_deref() {
        Some(data) => fhm2d_stage::parse_graphic_param_csv_from_bytes(data, &mut all_warnings),
        None => {
            all_warnings.push("graphic_param.csv not found in info folder".to_string());
            Vec::new()
        }
    };

    let (placement_header, placement_entries) = match placement_bytes.as_deref() {
        Some(data) => fhm2d_stage::parse_placement_csv_from_bytes(data, &mut all_warnings),
        None => {
            all_warnings.push("placement.csv not found in info folder".to_string());
            (Vec::new(), Vec::new())
        }
    };

    let csv_ms = t3.elapsed().as_millis() as u64;
    stage_log(&format!("csv done: {} graphic params, {} placement entries, elapsed={csv_ms}ms",
        graphic_params.len(), placement_entries.len()));

    // ── Step 5: Build models ───────────────────────────────────────────
    let model_folder_count = virtual_tree.iter()
        .filter(|f| f.role == "base" || f.role == "sub_model")
        .count();

    emit_progress(&app, "models", "Building model previews...", 60, Some(csv_ms));

    let app_for_models = app.clone();
    let mut models_built = 0usize;
    let model_progress_callback = move |folder_name: &str, _folder_index: usize| {
        models_built += 1;
        let sub_progress = if model_folder_count > 0 {
            60 + (35 * models_built / model_folder_count).min(35) as u8
        } else {
            90
        };
        emit_progress(
            &app_for_models,
            "models",
            &format!("Building model: {}...", folder_name),
            sub_progress,
            None,
        );
    };

    let (base_model, sub_models, model_warnings) =
        crate::fhm2d_memory_preview::build_stage_preview_models(
            &state,
            source_name.clone(),
            extraction,
            &virtual_tree,
            model_progress_callback,
        )?;

    all_warnings.extend(model_warnings);

    let total_ms = pipeline_start.elapsed().as_millis() as u64;
    stage_log(&format!("import complete: base_model={}, sub_models={}, warnings={}, total_elapsed={total_ms}ms",
        base_model.is_some(), sub_models.len(), all_warnings.len()));

    emit_progress(&app, "done", "Import complete", 100, None);

    let bundle = fhm2d_stage::StageBundle {
        root_path: format!("memory://{}", source_name),
        base_model,
        sub_models,
        graphic_params,
        placement_header,
        placement_entries,
        warnings: all_warnings.clone(),
    };

    Ok(fhm2d_stage::StageInMemoryImportResult {
        bundle,
        virtual_tree,
        warnings: all_warnings,
    })
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check` (from `src-tauri/`)
Expected: Will fail because `build_stage_preview_models` doesn't accept a callback yet. That's Task 3. Verify only that stage_commands.rs itself has no syntax errors by checking the error message points to the callback mismatch.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/stage_commands.rs
git commit -m "feat(stage): add progress event emission and structured logging to import command"
```

---

## Task 3: Backend — Add Progress Callback to `build_stage_preview_models`

**Files:**
- Modify: `src-tauri/src/fhm2d_memory_preview.rs:1357-1447`

- [ ] **Step 1: Update function signature to accept a progress callback**

Replace the function signature and first few lines (line 1357-1372):

```rust
pub fn build_stage_preview_models(
    state: &Fhm2dMemorySessionState,
    source_name: String,
    extraction: InMemoryFhm2dExtraction,
    virtual_tree: &[crate::format::fhm2d_stage::StageVirtualTreeFolder],
) -> Result<(Option<SsbhModelPreviewBundle>, Vec<crate::format::fhm2d_stage::StageSubModelEntry>, Vec<String>), String> {
    let session_id = state.next_session_id();
    let session = Fhm2dMemorySession::from_extraction(
        session_id.clone(),
        source_name,
        extraction,
    )?;

    let mut base_model: Option<SsbhModelPreviewBundle> = None;
    let mut sub_models: Vec<crate::format::fhm2d_stage::StageSubModelEntry> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
```

With:

```rust
pub fn build_stage_preview_models(
    state: &Fhm2dMemorySessionState,
    source_name: String,
    extraction: InMemoryFhm2dExtraction,
    virtual_tree: &[crate::format::fhm2d_stage::StageVirtualTreeFolder],
    mut on_progress: impl FnMut(&str, usize),
) -> Result<(Option<SsbhModelPreviewBundle>, Vec<crate::format::fhm2d_stage::StageSubModelEntry>, Vec<String>), String> {
    eprintln!("[stage_import] model build start: {} candidates in session", source_name);
    let t_start = std::time::Instant::now();

    let session_id = state.next_session_id();
    let session = Fhm2dMemorySession::from_extraction(
        session_id.clone(),
        source_name,
        extraction,
    )?;

    eprintln!("[stage_import] session created: id={session_id}, {} preview candidates",
        session.preview_candidates.len());

    let mut base_model: Option<SsbhModelPreviewBundle> = None;
    let mut sub_models: Vec<crate::format::fhm2d_stage::StageSubModelEntry> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
```

- [ ] **Step 2: Add progress callback call and logging inside the folder loop**

Find the line `if has_numdlb {` (around line 1381) and add the callback call right before it:

```rust
            if has_numdlb {
                on_progress(&folder.renamed_name, folder.original_index);
                let t_model = std::time::Instant::now();
```

Then after the model is successfully built (both the `base_model = Some(bundle)` and `sub_models.push(...)` branches), the logging is already handled by the warnings. But add a log after each successful build. Find the two `Ok(bundle) =>` match arms and wrap them:

For the base model branch (where `base_model = Some(bundle)`), change to:

```rust
                                    Ok(bundle) => {
                                        if folder.role == "base" {
                                            eprintln!("[stage_import] model built: base, elapsed={}ms",
                                                t_model.elapsed().as_millis());
                                            base_model = Some(bundle);
                                        } else {
                                            eprintln!("[stage_import] model built: {}, object_index={}, elapsed={}ms",
                                                folder.renamed_name, object_index, t_model.elapsed().as_millis());
                                            sub_models.push(crate::format::fhm2d_stage::StageSubModelEntry {
                                                folder_name: folder.renamed_name.clone(),
                                                object_index,
                                                bundle,
                                            });
                                        }
                                    }
```

- [ ] **Step 3: Add final logging before return**

Before the `state.sessions.lock()` line, add:

```rust
    eprintln!("[stage_import] model build done: base={}, sub_models={}, warnings={}, elapsed={}ms",
        base_model.is_some(), sub_models.len(), warnings.len(), t_start.elapsed().as_millis());
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check` (from `src-tauri/`)
Expected: Compiles with no errors (both `stage_commands.rs` and `fhm2d_memory_preview.rs` now agree on the callback signature).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/fhm2d_memory_preview.rs src-tauri/src/stage_commands.rs
git commit -m "feat(stage): add progress callback and logging to model builder"
```

---

## Task 4: Frontend — StageImportProgressDialog Component

**Files:**
- Create: `src/page/SceneEdit/components/StageImportProgressDialog.tsx`

- [ ] **Step 1: Create the progress dialog component**

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Loader2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ImportStep {
  step: string;
  label: string;
  elapsedMs?: number;
  status: "pending" | "active" | "done";
}

interface StageImportProgressDialogProps {
  open: boolean;
  progress: number;
  steps: ImportStep[];
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StepRow({ step }: { step: ImportStep }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      {step.status === "done" && (
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
      )}
      {step.status === "active" && (
        <Loader2 className="h-4 w-4 text-blue-400 shrink-0 animate-spin" />
      )}
      {step.status === "pending" && (
        <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      )}
      <span
        className={cn(
          "flex-1",
          step.status === "done" && "text-muted-foreground",
          step.status === "active" && "text-foreground font-medium",
          step.status === "pending" && "text-muted-foreground/50"
        )}
      >
        {step.label}
      </span>
      {step.status === "done" && step.elapsedMs != null && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatElapsed(step.elapsedMs)}
        </span>
      )}
    </div>
  );
}

export function StageImportProgressDialog({
  open,
  progress,
  steps,
}: StageImportProgressDialogProps) {
  const activeStep = steps.find((s) => s.status === "active");

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Importing Stage</DialogTitle>
          <DialogDescription>
            {activeStep?.label ?? "Preparing..."}
          </DialogDescription>
        </DialogHeader>

        <Progress value={progress} className="h-2" />

        <div className="space-y-0.5 mt-2">
          {steps.map((step) => (
            <StepRow key={step.step} step={step} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new type errors (only the pre-existing ResizablePanelGroup error).

- [ ] **Step 3: Commit**

```bash
git add src/page/SceneEdit/components/StageImportProgressDialog.tsx
git commit -m "feat(stage): add StageImportProgressDialog with step checklist"
```

---

## Task 5: Frontend — Wire Progress Dialog and Event Listener

**Files:**
- Modify: `src/page/SceneEdit/page.tsx`

- [ ] **Step 1: Add imports**

After the existing `StageRenamePreviewDialog` import (line 33-35), add:

```tsx
import {
  StageImportProgressDialog,
  type ImportStep,
} from "./components/StageImportProgressDialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";
```

Also update the first import line to include `useEffect`:

Change:
```tsx
import { useState, useCallback, useRef, useTransition } from "react";
```
To:
```tsx
import { useState, useCallback, useRef, useTransition, useEffect } from "react";
```

(Then remove the separate `useEffect` import from the `@tauri-apps/api/event` block — put it in the React import instead.)

- [ ] **Step 2: Add progress state**

After the `renamePreview` state (line 89-94), add:

```tsx
  const [importProgress, setImportProgress] = useState<{
    open: boolean;
    progress: number;
    steps: ImportStep[];
  }>({ open: false, progress: 0, steps: [] });
```

- [ ] **Step 3: Add the initial step definitions and progress event handler**

After the `importProgress` state, add:

```tsx
  const INITIAL_STEPS: ImportStep[] = [
    { step: "read", label: "Reading file...", status: "pending" },
    { step: "extract", label: "Decompressing FHM2D...", status: "pending" },
    { step: "rename", label: "Analyzing folder structure...", status: "pending" },
    { step: "csv", label: "Parsing stage data...", status: "pending" },
    { step: "models", label: "Building model previews...", status: "pending" },
  ];

  const handleProgressEvent = useCallback(
    (payload: { step: string; label: string; progress: number; elapsedMs: number | null }) => {
      setImportProgress((prev) => {
        if (payload.step === "done") {
          return {
            open: false,
            progress: 100,
            steps: prev.steps.map((s) => ({ ...s, status: "done" as const })),
          };
        }

        const newSteps = prev.steps.map((s): ImportStep => {
          if (s.step === payload.step) {
            return { ...s, label: payload.label, status: "active" };
          }
          if (s.status === "active") {
            return { ...s, status: "done", elapsedMs: payload.elapsedMs ?? undefined };
          }
          return s;
        });

        return {
          open: true,
          progress: payload.progress,
          steps: newSteps,
        };
      });
    },
    []
  );
```

- [ ] **Step 4: Add useEffect for event listener**

After `handleProgressEvent`, add:

```tsx
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    let cancelled = false;
    listen<{ step: string; label: string; progress: number; elapsedMs: number | null }>(
      "stage-import-progress",
      (event) => {
        if (!cancelled) {
          handleProgressEvent(event.payload);
        }
      }
    ).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        unlistenRef.current = unlisten;
      }
    });

    return () => {
      cancelled = true;
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, [handleProgressEvent]);
```

- [ ] **Step 5: Update `handleImportFhm2d` to use progress dialog**

Replace the entire `handleImportFhm2d` callback (lines 222-261) with:

```tsx
  const handleImportFhm2d = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "FHM2D Stage Files", extensions: ["fhm2d"] }],
      });
      if (!selected || typeof selected !== "string") return;

      setIsLoading(true);
      resetState();
      setImportProgress({
        open: true,
        progress: 0,
        steps: INITIAL_STEPS.map((s) => ({ ...s })),
      });

      const result = await invoke<{
        bundle: StageBundleResponse;
        virtualTree: VirtualTreeFolder[];
        warnings: string[];
      }>("import_stage_fhm2d_in_memory", { sourcePath: selected });

      setImportProgress((prev) => ({ ...prev, open: false }));

      const sourceName = selected
        .split(/[/\\]/)
        .filter(Boolean)
        .pop()
        ?.replace(/\.fhm2d$/i, "") ?? "stage";

      setRenamePreview({
        folders: result.virtualTree,
        warnings: result.warnings,
        bundle: result.bundle,
        sourceName,
      });
    } catch (err: any) {
      setImportProgress((prev) => ({ ...prev, open: false }));
      toast.error("FHM2D import failed", { description: String(err) });
    } finally {
      setIsLoading(false);
    }
  }, [resetState]);
```

- [ ] **Step 6: Render the progress dialog**

Find the `<StageRenamePreviewDialog` element (around line 476). Add the progress dialog right BEFORE it:

```tsx
        <StageImportProgressDialog
          open={importProgress.open}
          progress={importProgress.progress}
          steps={importProgress.steps}
        />
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new type errors.

- [ ] **Step 8: Commit**

```bash
git add src/page/SceneEdit/page.tsx
git commit -m "feat(stage): wire progress dialog with Tauri event listener"
```

---

## Task 6: Integration — Build and Verify

**Files:**
- No new files

- [ ] **Step 1: Full Rust build**

Run: `cargo check` (from `src-tauri/`)
Expected: Compiles with no errors or warnings.

- [ ] **Step 2: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: Only the pre-existing ResizablePanelGroup error.

- [ ] **Step 3: Manual test — normal stage import**

1. Launch the app
2. Go to Scene Edit → Import FHM2D → select a valid stage `.fhm2d`
3. Verify: progress Dialog appears with step checklist
4. Verify: steps transition green check → spinning → pending
5. Verify: progress bar advances
6. Verify: elapsed times appear on completed steps
7. Verify: progress Dialog closes → rename preview Dialog appears
8. Verify: Rust terminal shows `[stage_import]` log lines with timing
9. Click Confirm → verify stage loads normally

- [ ] **Step 4: Manual test — few-folders fhm2d (debug scenario)**

1. Import a non-stage fhm2d (e.g., character or effect file that has < 3 folders)
2. Verify: progress Dialog still works
3. Verify: rename preview Dialog appears (NOT an error toast)
4. Verify: virtual tree shows folders with `unknown_N` names
5. Verify: warning area shows the `[ERROR] Stage structure has only N folder(s)...` message in the Dialog
6. Click Cancel → verify clean state

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(stage): address integration test findings"
```

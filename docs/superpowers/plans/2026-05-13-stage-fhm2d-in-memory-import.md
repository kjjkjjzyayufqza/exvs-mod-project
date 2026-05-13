# Stage FHM2D In-Memory Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SceneEdit FHM2D import pipeline (extract→rename→load, all disk-based) with a single in-memory command that returns a `StageBundle` plus a virtual file tree for rename verification, shown in a confirmation Modal.

**Architecture:** A new Tauri command `import_stage_fhm2d_in_memory` reads the source `.fhm2d` file, calls the existing `extract_fhm2d_to_memory_impl`, performs stage rename logic on the in-memory `InMemoryFhm2dExtraction` data (no disk I/O), builds model preview bundles via the existing `Fhm2dMemorySession` system, and returns a combined result. The frontend shows a rename-verification Dialog before applying the bundle to the editor.

**Tech Stack:** Rust (Tauri commands, fhm2d/ssbh_preview), React + Radix UI Dialog, TypeScript

---

## File Structure

### Backend (Rust)

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src-tauri/src/format/fhm2d_stage.rs` | Add `stage_rename_in_memory()` and `load_stage_bundle_in_memory()` functions + new return types (`StageVirtualTreeFolder`, `StageVirtualTreeFile`, `StageInMemoryImportResult`) |
| Modify | `src-tauri/src/stage_commands.rs` | Add `import_stage_fhm2d_in_memory` Tauri command |
| Modify | `src-tauri/src/lib.rs` | Register the new command |

### Frontend (TypeScript/React)

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/page/SceneEdit/components/StageRenamePreviewDialog.tsx` | Modal showing virtual file tree with rename before/after comparison, confirm/cancel buttons |
| Modify | `src/page/SceneEdit/page.tsx` | Replace `handleImportFhm2d` to call new command, wire up Dialog state, disable save for in-memory imports |
| Modify | `src/page/SceneEdit/components/MapToolbar.tsx` | Accept `canSave` prop to disable save button for in-memory imports |

---

## Task 1: Backend — In-Memory Rename Data Structures

**Files:**
- Modify: `src-tauri/src/format/fhm2d_stage.rs:1-35` (add new structs after existing imports)

- [ ] **Step 1: Add `StageVirtualTreeFile` and `StageVirtualTreeFolder` structs**

At the end of the "Apply rename result" section (after line 203), add:

```rust
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageVirtualTreeFile {
    pub file_name: String,
    pub file_type: String,
    pub size_bytes: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageVirtualTreeFolder {
    pub original_index: usize,
    pub renamed_name: String,
    pub role: String,
    pub files: Vec<StageVirtualTreeFile>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageInMemoryImportResult {
    pub bundle: StageBundle,
    pub virtual_tree: Vec<StageVirtualTreeFolder>,
    pub warnings: Vec<String>,
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo check -p tauri-app`
Expected: Compiles with no errors (structs are defined but not yet used, no dead_code warnings needed since they're pub).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/format/fhm2d_stage.rs
git commit -m "feat(stage): add in-memory import result data structures"
```

---

## Task 2: Backend — In-Memory Rename Logic

**Files:**
- Modify: `src-tauri/src/format/fhm2d_stage.rs` (add `stage_rename_in_memory` function)

This function replaces the disk-based `stage_apply_rename_impl` for the in-memory path. It takes `&[InMemoryFhm2dFile]`, groups files by folder prefix from `file_url`, extracts numdlb model names from in-memory `data`, and returns `Vec<StageVirtualTreeFolder>`.

- [ ] **Step 1: Add import for `InMemoryFhm2dFile`**

At the top of `fhm2d_stage.rs`, after the existing `use crate::ssbh_preview` line, add:

```rust
use crate::format::fhm2d::InMemoryFhm2dFile;
```

- [ ] **Step 2: Add `InMemoryFolderGroup` helper and `collect_memory_folder_groups` function**

After the existing `collect_folder_groups` function (after line 184), add:

```rust
struct InMemoryFolderGroup {
    folder_index: usize,
    folder_prefix: String,
    files: Vec<InMemoryFolderFile>,
}

struct InMemoryFolderFile {
    file_name: String,
    file_type: String,
    data: Vec<u8>,
}

fn collect_memory_folder_groups(files: &[InMemoryFhm2dFile]) -> Vec<InMemoryFolderGroup> {
    let mut groups_map: HashMap<String, Vec<InMemoryFolderFile>> = HashMap::new();
    let mut folder_order: Vec<String> = Vec::new();

    for file in files {
        let normalized = file.file_url.replace('\\', "/");
        let trimmed = normalized.trim_start_matches("./").to_string();
        let parts: Vec<&str> = trimmed.split('/').collect();
        let folder_prefix = if parts.len() > 1 {
            parts[0].to_string()
        } else {
            "0".to_string()
        };
        let file_name = parts.last().unwrap_or(&"unknown").to_string();

        if !folder_order.contains(&folder_prefix) {
            folder_order.push(folder_prefix.clone());
        }

        groups_map.entry(folder_prefix).or_default().push(InMemoryFolderFile {
            file_name,
            file_type: file.file_type.clone(),
            data: file.data.clone(),
        });
    }

    folder_order
        .into_iter()
        .enumerate()
        .map(|(idx, prefix)| InMemoryFolderGroup {
            folder_index: idx,
            folder_prefix: prefix.clone(),
            files: groups_map.remove(&prefix).unwrap_or_default(),
        })
        .collect()
}
```

- [ ] **Step 3: Add `determine_memory_folder_name` function**

After `collect_memory_folder_groups`, add:

```rust
fn determine_memory_folder_name(
    position: usize,
    total: usize,
    files: &[InMemoryFolderFile],
    warnings: &mut Vec<String>,
) -> (String, &'static str) {
    if position == 0 {
        return (STAGE_BASE_NAME.to_string(), "base");
    }
    if position == 1 {
        return (STAGE_INFO_NAME.to_string(), "info");
    }
    if position == total - 1 {
        return (STAGE_TEXTURES_NAME.to_string(), "textures");
    }

    for file in files {
        if file.file_type.eq_ignore_ascii_case(".numdlb") {
            if let Some(name) = read_numdlb_model_name(&file.data) {
                return (name, "sub_model");
            }
        }
    }

    let fallback = format!("sub_{position}");
    warnings.push(format!(
        "Could not infer name for folder at position {position}, using '{fallback}'"
    ));
    (fallback, "sub_model")
}
```

- [ ] **Step 4: Add `stage_rename_in_memory` public function**

After `determine_memory_folder_name`, add:

```rust
pub fn stage_rename_in_memory(
    files: &[InMemoryFhm2dFile],
) -> Result<(Vec<StageVirtualTreeFolder>, Vec<String>), String> {
    let groups = collect_memory_folder_groups(files);
    if groups.len() < 3 {
        return Err(format!(
            "Stage structure has too few folders ({}), expected at least 3 (base, info, ...)",
            groups.len()
        ));
    }

    let mut warnings = Vec::new();
    let total = groups.len();
    let mut virtual_tree = Vec::new();

    for (pos, group) in groups.iter().enumerate() {
        let (folder_name, role) = determine_memory_folder_name(pos, total, &group.files, &mut warnings);

        let tree_files: Vec<StageVirtualTreeFile> = group
            .files
            .iter()
            .map(|f| StageVirtualTreeFile {
                file_name: f.file_name.clone(),
                file_type: f.file_type.clone(),
                size_bytes: f.data.len(),
            })
            .collect();

        virtual_tree.push(StageVirtualTreeFolder {
            original_index: group.folder_index,
            renamed_name: folder_name,
            role: role.to_string(),
            files: tree_files,
        });
    }

    Ok((virtual_tree, warnings))
}
```

- [ ] **Step 5: Verify it compiles**

Run: `cargo check -p tauri-app`
Expected: Compiles with no errors.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/format/fhm2d_stage.rs
git commit -m "feat(stage): add in-memory rename logic for FHM2D stage files"
```

---

## Task 3: Backend — In-Memory Bundle Loading

**Files:**
- Modify: `src-tauri/src/format/fhm2d_stage.rs` (add `load_stage_bundle_in_memory`)

This function takes `&[InMemoryFhm2dFile]` and `&[StageVirtualTreeFolder]` (from rename), finds the relevant CSV files from memory, and parses graphic_param + placement. Model loading is deferred — the existing `Fhm2dMemorySession` + `build_ssbh_preview_bundle_from_memory` handles that via the session system. For the initial in-memory import, we parse CSVs inline and leave model preview building to the session.

However, looking at the current `StageBundle`, it contains `SsbhModelPreviewBundle` which needs full model parsing. The session system already provides `build_ssbh_preview_bundle_from_memory`. We need to accept model bundles as parameters since the Tauri command will orchestrate the session-based model building before calling this.

- [ ] **Step 1: Add `parse_graphic_param_csv_from_bytes` function**

After the existing `parse_graphic_param_csv` function (after line 593), add:

```rust
pub fn parse_graphic_param_csv_from_bytes(
    data: &[u8],
    warnings: &mut Vec<String>,
) -> Vec<GraphicParamEntry> {
    let content = match std::str::from_utf8(data) {
        Ok(s) => s,
        Err(e) => {
            warnings.push(format!("graphic_param.csv is not valid UTF-8: {e}"));
            return Vec::new();
        }
    };
    content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(2, ',').collect();
            if parts.len() == 2 {
                Some(GraphicParamEntry {
                    key: parts[0].trim().to_string(),
                    value: parts[1].trim().to_string(),
                })
            } else {
                None
            }
        })
        .collect()
}
```

- [ ] **Step 2: Add `parse_placement_csv_from_bytes` function**

After `parse_graphic_param_csv_from_bytes`, add:

```rust
pub fn parse_placement_csv_from_bytes(
    data: &[u8],
    warnings: &mut Vec<String>,
) -> (Vec<String>, Vec<PlacementEntry>) {
    let content = match std::str::from_utf8(data) {
        Ok(s) => s,
        Err(e) => {
            warnings.push(format!("placement.csv is not valid UTF-8: {e}"));
            return (Vec::new(), Vec::new());
        }
    };

    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return (Vec::new(), Vec::new());
    }

    let header: Vec<&str> = lines[0].split(',').map(|s| s.trim()).collect();
    let header_strings: Vec<String> = header.iter().map(|s| s.to_string()).collect();
    let find_col = |name: &str| -> Option<usize> {
        header.iter().position(|h| h.eq_ignore_ascii_case(name))
    };

    let col_type = find_col("VDK_TYPE");
    let col_objnum = find_col("VDK_OBJECTNUMBER");
    let col_px = find_col("VDK_POS_X");
    let col_py = find_col("VDK_POS_Y");
    let col_pz = find_col("VDK_POS_Z");
    let col_rx = find_col("VDK_ROT_X");
    let col_ry = find_col("VDK_ROT_Y");
    let col_rz = find_col("VDK_ROT_Z");
    let col_sx = find_col("VDK_SCALE_X");
    let col_sy = find_col("VDK_SCALE_Y");
    let col_sz = find_col("VDK_SCALE_Z");

    let parse_f64 = |fields: &[&str], col: Option<usize>| -> f64 {
        col.and_then(|c| fields.get(c))
            .and_then(|v| v.trim().parse::<f64>().ok())
            .unwrap_or(0.0)
    };

    let parse_i32 = |fields: &[&str], col: Option<usize>| -> Option<i32> {
        col.and_then(|c| fields.get(c))
            .and_then(|v| v.trim().parse::<i32>().ok())
    };

    let mut entries = Vec::new();
    for line in &lines[1..] {
        if line.trim().is_empty() {
            continue;
        }
        let fields: Vec<&str> = line.split(',').collect();
        let vdk_type = col_type
            .and_then(|c| fields.get(c))
            .map(|v| v.trim().to_string())
            .unwrap_or_default();

        entries.push(PlacementEntry {
            vdk_type,
            object_number: parse_i32(&fields, col_objnum),
            pos_x: parse_f64(&fields, col_px),
            pos_y: parse_f64(&fields, col_py),
            pos_z: parse_f64(&fields, col_pz),
            rot_x: parse_f64(&fields, col_rx),
            rot_y: parse_f64(&fields, col_ry),
            rot_z: parse_f64(&fields, col_rz),
            scale_x: parse_f64(&fields, col_sx),
            scale_y: parse_f64(&fields, col_sy),
            scale_z: parse_f64(&fields, col_sz),
            raw_fields: fields.iter().map(|f| f.trim().to_string()).collect(),
        });
    }
    (header_strings, entries)
}
```

- [ ] **Step 3: Add `find_info_file_data` helper**

After `parse_placement_csv_from_bytes`, add:

```rust
pub fn find_info_file_data<'a>(
    files: &'a [InMemoryFhm2dFile],
    virtual_tree: &[StageVirtualTreeFolder],
    target_file_name: &str,
) -> Option<&'a [u8]> {
    let info_folder = virtual_tree.iter().find(|f| f.role == "info")?;
    let info_prefix = info_folder.original_index.to_string();

    let mut non_nutexb_index = 0usize;
    for file in files {
        let normalized = file.file_url.replace('\\', "/");
        let trimmed = normalized.trim_start_matches("./");
        let parts: Vec<&str> = trimmed.split('/').collect();
        if parts.len() < 2 {
            continue;
        }
        if parts[0] != info_prefix {
            continue;
        }
        if file.file_type.eq_ignore_ascii_case(".nutexb") {
            continue;
        }
        if non_nutexb_index < INFO_FILE_NAMES.len() && INFO_FILE_NAMES[non_nutexb_index] == target_file_name {
            return Some(&file.data);
        }
        non_nutexb_index += 1;
    }
    None
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cargo check -p tauri-app`
Expected: Compiles with no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/format/fhm2d_stage.rs
git commit -m "feat(stage): add in-memory CSV parsing and info file lookup helpers"
```

---

## Task 4: Backend — Tauri Command `import_stage_fhm2d_in_memory`

**Files:**
- Modify: `src-tauri/src/stage_commands.rs` (add new command)
- Modify: `src-tauri/src/lib.rs:106-108` (register command)

The command orchestrates: read file → extract to memory → session → rename → build model previews → parse CSVs → assemble result.

- [ ] **Step 1: Rewrite `stage_commands.rs` to add the new command**

Replace the entire file content with:

```rust
//! Tauri command wrappers for stage fhm2d rename and bundle loading.

use tauri::State;

use crate::fhm2d_memory_preview::Fhm2dMemorySessionState;
use crate::format::fhm2d::{extract_fhm2d_to_memory_impl, Fhm2dFormat};
use crate::format::fhm2d_stage;

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

    let session_id = state.next_session_id();
    let session_id_clone = session_id.clone();
    let source_name_clone = source_name.clone();

    let (extraction_files, virtual_tree, rename_warnings) =
        tauri::async_runtime::spawn_blocking(move || {
            let bytes = std::fs::read(&path)
                .map_err(|e| format!("Failed to read FHM2D file: {e}"))?;

            let extraction = extract_fhm2d_to_memory_impl(
                &bytes,
                &source_name_clone,
                None::<Fhm2dFormat>.map(|_| unreachable!()),
            )?;

            let (virtual_tree, rename_warnings) =
                fhm2d_stage::stage_rename_in_memory(&extraction.files)?;

            Ok::<_, String>((extraction.files, virtual_tree, rename_warnings))
        })
        .await
        .map_err(|e| e.to_string())??;

    let graphic_param_data = fhm2d_stage::find_info_file_data(
        &extraction_files,
        &virtual_tree,
        "graphic_param.csv",
    );
    let placement_data = fhm2d_stage::find_info_file_data(
        &extraction_files,
        &virtual_tree,
        "placement.csv",
    );

    let mut all_warnings = rename_warnings;

    let graphic_params = match graphic_param_data {
        Some(data) => fhm2d_stage::parse_graphic_param_csv_from_bytes(data, &mut all_warnings),
        None => {
            all_warnings.push("graphic_param.csv not found in info folder".to_string());
            Vec::new()
        }
    };

    let (placement_header, placement_entries) = match placement_data {
        Some(data) => fhm2d_stage::parse_placement_csv_from_bytes(data, &mut all_warnings),
        None => {
            all_warnings.push("placement.csv not found in info folder".to_string());
            (Vec::new(), Vec::new())
        }
    };

    let extraction_for_session = crate::format::fhm2d::InMemoryFhm2dExtraction {
        source_name: source_name.clone(),
        format: None,
        naming_error: None,
        files: extraction_files,
    };

    let session = crate::fhm2d_memory_preview::Fhm2dMemorySession::from_extraction(
        session_id_clone.clone(),
        source_name.clone(),
        extraction_for_session,
    )?;

    let mut base_model: Option<crate::ssbh_preview::SsbhModelPreviewBundle> = None;
    let mut sub_models: Vec<fhm2d_stage::StageSubModelEntry> = Vec::new();

    let mut object_index = 0usize;
    for folder in &virtual_tree {
        if folder.role == "base" || folder.role == "sub_model" {
            let numdlb_file = folder.files.iter().find(|f| {
                f.file_type.eq_ignore_ascii_case(".numdlb")
            });
            if let Some(_numdlb) = numdlb_file {
                for candidate in &session.preview_candidates {
                    let candidate_folder = candidate.folder_virtual_path
                        .split('/')
                        .nth(1)
                        .unwrap_or("");
                    let matches_folder = candidate_folder == folder.original_index.to_string();
                    if !matches_folder {
                        continue;
                    }
                    if !candidate.complete {
                        all_warnings.push(format!(
                            "Model in {} is incomplete: {}",
                            folder.renamed_name,
                            candidate.issues.join(", ")
                        ));
                        continue;
                    }

                    let build_input = crate::fhm2d_memory_preview::snapshot_preview_bundle_build_input_pub(
                        &session,
                        candidate,
                    )?;
                    let bundle = crate::fhm2d_memory_preview::build_preview_bundle_from_snapshot_pub(
                        build_input,
                    )?;

                    if folder.role == "base" {
                        base_model = Some(bundle);
                    } else {
                        sub_models.push(fhm2d_stage::StageSubModelEntry {
                            folder_name: folder.renamed_name.clone(),
                            object_index,
                            bundle,
                        });
                    }
                    break;
                }
            }

            if folder.role != "base" {
                object_index += 1;
            }
        }
    }

    state
        .sessions
        .lock()
        .map_err(|_| "Failed to lock FHM2D memory sessions.".to_string())?
        .insert(session_id_clone, session);

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

- [ ] **Step 2: Expose necessary functions from `fhm2d_memory_preview.rs`**

The command needs to call `snapshot_preview_bundle_build_input` and `build_preview_bundle_from_snapshot`, which are currently private. Add public wrapper functions at the end of `src-tauri/src/fhm2d_memory_preview.rs` (before the last closing brace or after the last `#[tauri::command]` function):

```rust
pub fn snapshot_preview_bundle_build_input_pub(
    session: &Fhm2dMemorySession,
    candidate: &PreviewCandidate,
) -> Result<PreviewBundleBuildInput, String> {
    snapshot_preview_bundle_build_input(session, candidate)
}

pub fn build_preview_bundle_from_snapshot_pub(
    input: PreviewBundleBuildInput,
) -> Result<SsbhModelPreviewBundle, String> {
    build_preview_bundle_from_snapshot(input)
}
```

Also make `PreviewBundleBuildInput`, `PreviewCandidate`, and `Fhm2dMemorySession` public (they likely already have `pub` on the struct, but confirm fields or the struct itself are accessible). Specifically ensure:
- `Fhm2dMemorySession` struct and its `preview_candidates` field are `pub`
- `PreviewCandidate` struct and its `folder_virtual_path`, `complete`, `issues`, `modl_virtual_path` fields are `pub`
- `PreviewBundleBuildInput` struct is `pub`
- `Fhm2dMemorySessionState` has a `pub fn next_session_id(&self) -> String` method (already exists at line 776)

Check each of these and add `pub` where missing.

- [ ] **Step 3: Register the command in `lib.rs`**

In `src-tauri/src/lib.rs`, after line 107 (`stage_commands::load_stage_bundle`), add:

```rust
            stage_commands::import_stage_fhm2d_in_memory,
```

- [ ] **Step 4: Fix the `None` format argument**

In step 1's code, the line `None::<Fhm2dFormat>.map(|_| unreachable!())` is overly clever. Replace it with simply:

```rust
            let extraction = extract_fhm2d_to_memory_impl(
                &bytes,
                &source_name_clone,
                None,
            )?;
```

- [ ] **Step 5: Verify it compiles**

Run: `cargo check -p tauri-app`
Expected: Compiles with no errors. Fix any visibility issues by adding `pub` to the relevant structs/fields/functions in `fhm2d_memory_preview.rs`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/stage_commands.rs src-tauri/src/fhm2d_memory_preview.rs src-tauri/src/lib.rs
git commit -m "feat(stage): add import_stage_fhm2d_in_memory Tauri command"
```

---

## Task 5: Frontend — StageRenamePreviewDialog Component

**Files:**
- Create: `src/page/SceneEdit/components/StageRenamePreviewDialog.tsx`

- [ ] **Step 1: Create the Dialog component**

```tsx
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight, ChevronDown, Folder, File, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VirtualTreeFile {
  fileName: string;
  fileType: string;
  sizeBytes: number;
}

export interface VirtualTreeFolder {
  originalIndex: number;
  renamedName: string;
  role: string;
  files: VirtualTreeFile[];
}

interface StageRenamePreviewDialogProps {
  open: boolean;
  folders: VirtualTreeFolder[];
  warnings: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ROLE_COLORS: Record<string, string> = {
  base: "text-blue-400",
  info: "text-amber-400",
  sub_model: "text-green-400",
  textures: "text-purple-400",
};

function FolderNode({ folder }: { folder: VirtualTreeFolder }) {
  const [expanded, setExpanded] = useState(false);
  const roleColor = ROLE_COLORS[folder.role] ?? "text-muted-foreground";

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-1.5 py-1 px-2 hover:bg-muted/50 rounded cursor-pointer text-sm"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Folder className={cn("h-3.5 w-3.5 shrink-0", roleColor)} />
        <span className="font-mono font-medium">{folder.renamedName}/</span>
        <span className="text-muted-foreground ml-1">
          ← {folder.originalIndex}/
        </span>
        <span className={cn("ml-auto text-xs px-1.5 py-0.5 rounded-sm bg-muted", roleColor)}>
          {folder.role}
        </span>
      </div>
      {expanded && (
        <div className="ml-6 border-l border-border/50 pl-2">
          {folder.files.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 py-0.5 px-2 text-xs text-muted-foreground"
            >
              <File className="h-3 w-3 shrink-0" />
              <span className="font-mono">{file.fileName}</span>
              <span className="ml-auto tabular-nums">{formatSize(file.sizeBytes)}</span>
            </div>
          ))}
          {folder.files.length === 0 && (
            <div className="py-0.5 px-2 text-xs text-muted-foreground italic">
              (empty)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StageRenamePreviewDialog({
  open,
  folders,
  warnings,
  onConfirm,
  onCancel,
}: StageRenamePreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Stage Rename Preview</DialogTitle>
          <DialogDescription>
            Verify the folder rename mapping before loading the stage bundle.
          </DialogDescription>
        </DialogHeader>

        {warnings.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              {warnings.map((w, i) => (
                <div key={i} className="text-yellow-200/80">{w}</div>
              ))}
            </div>
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0 max-h-[50vh] rounded-md border bg-background/50 p-2">
          <div className="space-y-0.5">
            {folders.map((folder) => (
              <FolderNode key={folder.originalIndex} folder={folder} />
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>
            Confirm & Load
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No type errors in the new file.

- [ ] **Step 3: Commit**

```bash
git add src/page/SceneEdit/components/StageRenamePreviewDialog.tsx
git commit -m "feat(stage): add StageRenamePreviewDialog component"
```

---

## Task 6: Frontend — Wire Up `handleImportFhm2d` and Dialog State

**Files:**
- Modify: `src/page/SceneEdit/page.tsx:1-268` (imports, state, handler)
- Modify: `src/page/SceneEdit/components/MapToolbar.tsx:19-32,84-95` (save button disable)

- [ ] **Step 1: Add imports and state in `page.tsx`**

At the top of `page.tsx`, after the existing imports (after line 31), add:

```tsx
import {
  StageRenamePreviewDialog,
  type VirtualTreeFolder,
} from "./components/StageRenamePreviewDialog";
```

Inside `SceneEdit()`, after the `treeRoot` state (after line 82), add:

```tsx
  const [isMemoryImport, setIsMemoryImport] = useState(false);
  const [renamePreview, setRenamePreview] = useState<{
    folders: VirtualTreeFolder[];
    warnings: string[];
    bundle: StageBundleResponse;
    sourceName: string;
  } | null>(null);
```

- [ ] **Step 2: Replace `handleImportFhm2d`**

Replace the entire `handleImportFhm2d` callback (lines 209-268) with:

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

      toast.info("Importing FHM2D (in-memory)...", { id: "fhm2d-progress" });

      const result = await invoke<{
        bundle: StageBundleResponse;
        virtualTree: VirtualTreeFolder[];
        warnings: string[];
      }>("import_stage_fhm2d_in_memory", { sourcePath: selected });

      toast.dismiss("fhm2d-progress");

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
      toast.dismiss("fhm2d-progress");
      toast.error("FHM2D import failed", { description: String(err) });
    } finally {
      setIsLoading(false);
    }
  }, [resetState]);
```

- [ ] **Step 3: Add confirm/cancel handlers**

After `handleImportFhm2d`, add:

```tsx
  const handleRenameConfirm = useCallback(() => {
    if (!renamePreview) return;
    const { bundle, sourceName } = renamePreview;
    setIsMemoryImport(true);
    applyBundle(bundle.rootPath, bundle);
    setStageName(sourceName);
    setRenamePreview(null);
  }, [renamePreview, applyBundle]);

  const handleRenameCancel = useCallback(() => {
    setRenamePreview(null);
  }, []);
```

- [ ] **Step 4: Update `resetState` to also reset `isMemoryImport`**

In `resetState` (around line 180), add `setIsMemoryImport(false);` after `setTreeRoot(null);`:

```tsx
  const resetState = useCallback(() => {
    setStageName(null);
    setIsMemoryImport(false);
    setBaseModel(null);
    setSubModels([]);
    setGraphicParams([]);
    setPlacementHeader([]);
    setPlacementEntries([]);
    setTreeRoot(null);
  }, []);
```

- [ ] **Step 5: Render the Dialog in JSX**

At the end of the component JSX, just before the closing `</TooltipProvider>`, add:

```tsx
        <StageRenamePreviewDialog
          open={renamePreview !== null}
          folders={renamePreview?.folders ?? []}
          warnings={renamePreview?.warnings ?? []}
          onConfirm={handleRenameConfirm}
          onCancel={handleRenameCancel}
        />
```

- [ ] **Step 6: Update MapToolbar to accept `canSave` prop**

In `src/page/SceneEdit/components/MapToolbar.tsx`, add `canSave: boolean;` to `MapToolbarProps` interface:

```tsx
interface MapToolbarProps {
  onOpenFolder: () => void;
  onImportFhm2d: () => void;
  onSave: () => void;
  canSave: boolean;
  stageName: string | null;
  isLoading: boolean;
  showGrid: boolean;
  showAxes: boolean;
  wireframe: boolean;
  onToggleGrid: () => void;
  onToggleAxes: () => void;
  onToggleWireframe: () => void;
  onResetCamera: () => void;
}
```

Update the destructuring to include `canSave`:

```tsx
export function MapToolbar({
  onOpenFolder,
  onImportFhm2d,
  onSave,
  canSave,
  stageName,
  isLoading,
  ...
```

Change the Save button `disabled` condition from `disabled={!stageName || isLoading}` to:

```tsx
            disabled={!canSave || isLoading}
```

- [ ] **Step 7: Pass `canSave` from page.tsx**

In `page.tsx`, update the `<MapToolbar>` props (around line 392):

Change:
```tsx
          onSave={handleSave}
```
to:
```tsx
          onSave={handleSave}
          canSave={!!stageName && !isMemoryImport}
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 9: Commit**

```bash
git add src/page/SceneEdit/page.tsx src/page/SceneEdit/components/MapToolbar.tsx
git commit -m "feat(stage): wire in-memory FHM2D import with rename preview dialog"
```

---

## Task 7: Integration — Build and Smoke Test

**Files:**
- No new files — testing the integration

- [ ] **Step 1: Build the Rust backend**

Run: `cargo build -p tauri-app`
Expected: Compiles successfully.

- [ ] **Step 2: Build the frontend**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Manual smoke test**

1. Launch the app
2. Go to Scene Edit page
3. Click "Import FHM2D" and select a `.fhm2d` stage file
4. Verify the rename preview Dialog appears showing:
   - Folder rows with `renamedName/ ← originalIndex/` format
   - Role badges (base, info, sub_model, textures)
   - Expandable file lists with sizes
   - Warnings section if any
5. Click "Cancel" — verify nothing loads
6. Import again, click "Confirm & Load" — verify:
   - Stage loads into the viewport
   - Hierarchy tree shows correct structure
   - Graphic params and placement data are populated
   - Save button is disabled
7. Click "Open Stage" with a disk folder — verify:
   - Save button becomes enabled
   - All existing functionality still works

- [ ] **Step 4: Commit any fixes found during smoke test**

```bash
git add -A
git commit -m "fix(stage): address smoke test findings for in-memory import"
```

# Batch Rigid Skin

Batch Rigid Skin is a Blender 5.1 addon for rigidly binding many mesh objects to one armature bone in one click.

## Install Locations

- Primary install target:
  `C:\Program Files\Blender Foundation\Blender 5.1\5.1\scripts\addons\batch_rigid_skin`
- Project mirror:
  `e:\TAURI_PROJECT\tools\blender_batch_rigid_skin`
- Fallback user addon path:
  `%APPDATA%\Blender Foundation\Blender\5.1\scripts\addons\batch_rigid_skin`

## First-Time Enable

1. Open Blender Preferences.
2. Go to **Add-ons**.
3. Search for `Batch Rigid Skin`.
4. Enable the addon.

## Usage

1. Select one or more mesh objects.
2. Open the **Rigid Skin** tab in the 3D Viewport sidebar.
3. Choose the armature and target bone.
4. Click **Bind Selected Meshes to Bone**.

The addon will:

- create or reuse a vertex group with the exact bone name,
- assign every vertex to that group with the chosen weight,
- retarget existing Armature modifiers to the chosen armature,
- add an Armature modifier if requested,
- optionally remove other vertex groups for clean rigid export.

## Pose Mode Shortcut

1. Select the armature and the mesh objects together.
2. Enter Pose Mode on the armature.
3. Select the target bone.
4. Run **Bind Selected Meshes to Active Pose Bone** from the panel or F3.

## Clear Skin

Use **Clear Rigid Skin from Selected Meshes** to remove all vertex groups and Armature modifiers from the selected meshes.

## Hot Reload Without Restart

1. Edit the addon files in the project mirror or installed addon folder.
2. In Blender press **F3** and run **Reload Batch Rigid Skin Addon**.
3. If Blender still shows stale UI, disable and re-enable the addon in Preferences.

## Performance Notes (v1.0.1)

- Binding 20+ ship parts with large meshes can take **10–60 seconds**. A progress bar appears at the bottom of Blender; this is normal, not a freeze.
- v1.0.0 could appear to freeze because the N-panel mutated scene properties on every redraw. v1.0.1 fixes that.
- v1.0.0 also used `list(range(vertex_count))` as a fallback on huge meshes, which could exhaust memory. v1.0.1 assigns weights in 65536-vertex chunks instead.
- If Blender is already stuck: force-close Blender, reopen, reload the addon (F3 → **Reload Batch Rigid Skin Addon**), then bind again once.

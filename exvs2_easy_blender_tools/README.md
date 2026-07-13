# EXVS2-Easy-Blender-Tools

EXVS2-Easy-Blender-Tools is a Blender 5.1 addon for small EXVS2 model workflow
fixes that Blender does not make convenient by default.

It includes one-click motion binding and Maya-style rigid skin setup.

## Install Locations

- Primary install target:
  `C:\Program Files\Blender Foundation\Blender 5.1\5.1\scripts\addons\exvs2_easy_blender_tools`
- Project mirror:
  `E:\TAURI_PROJECT\exvs2_easy_blender_tools`
- Fallback user addon path:
  `%APPDATA%\Blender Foundation\Blender\5.1\scripts\addons\exvs2_easy_blender_tools`

Blender displays the addon as `EXVS2-Easy-Blender-Tools`.

## First-Time Enable

1. Open Blender Preferences.
2. Go to **Add-ons**.
3. Search for `EXVS2-Easy-Blender-Tools`.
4. Enable the addon.

The tools appear in the 3D Viewport sidebar under the **EXVS2 Tools** tab.

The sidebar uses separate collapsible groups:

- **Motion** and **FBX Export** stay open for the main workflow.
- **Rigid Skin**, **Selection**, **Cleanup**, and **Maintenance** start closed.

## One-Click Motion Bind

Use this when the model and motion FBX files were imported as separate but
matching armatures.

1. Open **EXVS2 Tools** in Object Mode.
2. Set **A Model** to the armature already referenced by the model meshes.
3. Set **B Motion** to the armature whose active Action supplies the animation.
4. Click **Transfer and Delete B**.

You can also Shift-select exactly two armatures, then click **Use Selected
Pair**. Selection order does not matter because the addon identifies
A from the model mesh parent and Armature modifiers. The panel displays the
resolved A, B, Action, and skeleton validation state before binding.

The addon verifies matching bone names, bone parents, and rest transforms. It
then copies B's Action and Action Slot onto A, moves the copied animation to
start at frame 0, sets the scene to 60 FPS, and selects A with its model meshes.
After a successful copy, B is deleted. Its armature data and source Action are
also removed when nothing else uses them.

This command does not export FBX. Export manually after checking playback.

## Safe Manual FBX Export

Click **Select Export Set** before opening Blender's FBX exporter. The
binding command has already deleted B; this button limits the selection to the
finished A armature and its meshes.

Use these FBX options:

- **Include > Selected Objects**: on
- **Object Types**: Mesh and Armature only
- **Armature > Add Leaf Bones**: off
- **Bake Animation > NLA Strips**: off
- **Bake Animation > All Actions**: off

Leaving **Selected Objects** off can export unrelated objects left in the scene.
Leaving **Add Leaf Bones** on creates extra bones with names ending in `_end`.

## Rigid Bind Workflow

1. Select one or more mesh objects.
2. Open **EXVS2 Tools** in the 3D Viewport sidebar.
3. Choose the armature and target bone.
4. Click **Bind Selected Meshes to Bone**.

The addon will:

- create or reuse a vertex group with the exact bone name,
- assign every vertex to that group with the chosen weight,
- retarget existing Armature modifiers to the chosen armature,
- add an Armature modifier when requested,
- optionally remove all other vertex groups for clean rigid export,
- optionally parent bound meshes to the armature while keeping world transforms,
- optionally normalize vertex groups after binding.

## Pose Mode Shortcut

1. Select the armature and the mesh objects together.
2. Enter Pose Mode on the armature.
3. Select the target bone.
4. Run **Bind to Active Pose Bone** from the panel or F3.

## Selection Helpers

Selection helpers can search the whole scene or only the current selection.
Use **Selection Scope** in the panel to switch between those modes.

- **Select Meshes Without Skin** selects meshes that have no vertex groups and
  no Armature modifier.
- **Select Meshes Using Armature** selects meshes that reference the chosen
  armature through an Armature modifier or matching bone vertex groups.
- **Select Meshes Bound to Bone** selects meshes with weighted vertices in the
  chosen bone group.

## Cleanup for Export

- **Retarget Armature Modifiers** points selected mesh Armature modifiers at the
  chosen armature, adding missing modifiers if that option is enabled.
- **Keep Only Target Bone Group** removes every vertex group except the selected
  target bone group.
- **Remove Empty Vertex Groups** removes vertex groups with no positive weights.
- **Name Mesh Data from Objects** renames selected mesh datablocks to match
  their object names for cleaner FBX export.
- **Clear Rigid Skin** removes all vertex groups and Armature modifiers from the
  selected meshes.

## Hot Reload Without Restart

1. Edit the addon files in the project mirror or installed addon folder.
2. In Blender press **F3** and run **Reload EXVS2 Easy Blender Tools**.
3. If Blender still shows stale UI, disable and re-enable the addon in
   Preferences.

## Performance Notes

- Binding many large mesh parts can take **10-60 seconds**. Blender's progress
  bar appears at the bottom of the window during batch work.
- Vertex assignment is chunked in 65536-vertex blocks to avoid building huge
  temporary index lists.
- Selection helpers may scan every scene mesh when **Selection Scope** is
  `Scene`; switch to `Selected` for very large scenes when you only need to
  refine the current selection.

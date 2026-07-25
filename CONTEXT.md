# EXVS2 Asset Editor Domain

Language for unit model motion export and related editing surfaces in this
repository. Glossary only — no implementation details.

## Language

### Motion export

**CascadeurBridge** (deprecated product concept):
The abandoned two-file transport of animation-only `motion.fbx` plus
`bridge.json` for round-tripping NUANMB through Cascadeur. Removed from the
product surface; not a user-visible workflow.
_Avoid_: bridge, Cascadeur export, motion bridge (when meaning the old
two-file flow)

**MotionFbxExport**:
A one-way export that produces a **single CompleteMotionFbx** from the active
unit model and a selected NUANMB. There is no FBX-to-NUANMB import in this
product surface.
_Avoid_: CascadeurBridge, bridge export, round-trip export

**CompleteMotionFbx**:
One FBX file that contains the skinned model (armature + meshes) and the
animation bound to that armature. Not an animation-only skeleton file and not
a model-only file without action data.
_Avoid_: motion.fbx (old animation-only name), model.fbx alone, bridge package

**NUANMB**:
The game motion binary used as the animation source for MotionFbxExport.
_Avoid_: anim file, motion clip file (when referring to the on-disk game asset)

**NUSKTB**:
The game skeleton binary that defines the armature hierarchy for the unit
model and motion binding.
_Avoid_: skeleton file (unqualified), rig file

**SampleRate60**:
The CompleteMotionFbx time base is 60 samples per second (60 FPS). Clip length
is the real NUANMB duration in frames at that rate; clips are not padded or
truncated to a fixed 60-frame count.
_Avoid_: 60 frames (when meaning length), fixed frame count, pad to 60

**BlenderCompose**:
The only production path for CompleteMotionFbx: the app orchestrates Blender
5.1 to bind model and motion and write the single output FBX. A pure-Rust
merged mesh+animation FBX writer is out of scope for this product.
_Avoid_: Rust complete FBX writer, dual pipeline, hybrid fallback

**GeometryOnlyModel**:
The model half of CompleteMotionFbx is armature plus skinned meshes (and the
bound action). Materials/textures are not a success requirement for
MotionFbxExport.
_Avoid_: textured export requirement, full material package, nutexb round-trip

**MotionPanelExport**:
MotionFbxExport is triggered from the Unit Model Editor Motion panel as a
single export action that replaces the CascadeurBridge export/import controls.
Required inputs are the **active preview model** and the **selected NUANMB**.
Either missing disables export.
_Avoid_: separate tool page, manual model path picker for v1, dual bridge buttons

**SaveAsCompleteFbx**:
The user chooses the CompleteMotionFbx destination with a native save dialog
on every export. Cancelling the dialog is a no-op. The suggested default
filename is the selected NUANMB stem plus `.fbx` (for example
`foo_bar.nuanmb` → `foo_bar.fbx`).
_Avoid_: fixed export folder without prompt, silent write next to NUANMB

**Blender51Executable**:
MotionFbxExport locates Blender **5.1** by auto-detecting common install paths
and allowing a user-configured override. If no valid 5.1 executable is found,
export fails with an explicit error; there is no silent fallback to other
Blender versions.
_Avoid_: any Blender on PATH, silent version downgrade, required per-export
file picker

**HeadlessComposeScript**:
BlenderCompose runs a self-contained Python script shipped with the
application. Success does not require the user to install or enable
EXVS2-Easy-Blender-Tools. The manual addon remains a separate human Blender
workflow.
_Avoid_: require addon enabled, call UI operators only, depend on Program Files
addon install

**BridgeRemoval**:
CascadeurBridge UI and its public export/import commands are removed with
MotionFbxExport. Any animation-only or model-only FBX written during
BlenderCompose is an internal staging artifact, not a user product.
_Avoid_: keep hidden bridge commands, ship bridge.json to the user

**StagingFbxPair**:
Internal, short-lived model-only FBX and animation-only FBX used only as
inputs to BlenderCompose. They are not the export deliverable and are cleaned
up after success or failure when possible.
_Avoid_: CascadeurBridge package, user-facing motion.fbx + bridge.json

## Flagged ambiguities

None for MotionFbxExport v1. Remaining work is implementation, not domain
wording.

## Example dialogue

> Dev: Should we still write bridge.json next to the FBX?
> Expert: No. CascadeurBridge is gone. MotionFbxExport only emits one
> CompleteMotionFbx.
>
> Dev: After editing in Cascadeur, how do we import back?
> Expert: We don't on this surface. Export is one-way; NUANMB stays the game
> source of truth until a separate import product is defined.
>
> Dev: The clip is 40 frames — do we pad to 60?
> Expert: No. SampleRate60 means 60 FPS. Length stays 40 frames at that rate.
>
> Dev: Blender 4.2 is on PATH; can we use it?
> Expert: No. Blender51Executable requires 5.1 (auto-detect or override).
>
> Dev: Where does the user click?
> Expert: MotionPanelExport — one button on the Unit Model Editor Motion panel,
> with the active preview model and selected NUANMB.

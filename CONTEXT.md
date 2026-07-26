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
unit model and a selected NUANMB. Importing motion back is a separate surface
(MotionFbxImport); together they form RoundTripMotion.
_Avoid_: CascadeurBridge, bridge export

**MotionFbxImport**:
The import surface that turns a DCC-edited FBX plus the active model's NUSKTB
(and an optional template NUANMB) into one new NUANMB. Manifest-free: no
bridge.json and no Blender install required on import.
_Avoid_: bridge import, Cascadeur import, Blender-dependent import

**RoundTripMotion**:
The mod developer loop MotionFbxExport → edit in a DCC → MotionFbxImport →
ImportPreview. NUANMB remains the game source of truth; FBX is only the
editing transport.
_Avoid_: FBX as a project storage format

**DccFbxRead / DccSpaceNormalize**:
The Rust ufbx import stage: FBX loaded in raw file space, world transforms
rotated from the file's declared GlobalSettings axis frame into the game
frame (right -X, up +Y, front -Z — identity for our own writer, 180° about Y
for Blender exports), and every reference bone's local TRS rebased against
its reference parent's world transform so helper objects (Blender Armature)
and unit scaling fold into the root bone track instead of corrupting
children. Verified by the Blender 5.1 round-trip test.
_Avoid_: ufbx target-axes retargeting (fights our writer's declaration),
raw node_to_parent trust for DCC files, per-DCC special cases

**MotionJson**:
The BlenderCompose motion staging format: per-frame pose-basis TRS
(`rest_local⁻¹ × animated_local`) per bone, keyed directly onto the model
armature by the compose script. Replaces the animation-only staging FBX
because Blender culls all-constant FBX animation channels (reverting
constant-but-not-rest bones like BASE to rest) and connected bones ignore
location keys; the compose script disconnects all bones and the Rust side
adds a sub-tolerance epsilon to still-constant channels.
_Avoid_: animation-only FBX staging, action copy between armatures

**CanonicalBoneName**:
FBX candidate bone names are canonicalized by stripping `path|` and
`namespace:` prefixes before matching NUSKTB names. Collisions after
canonicalization are errors; unmatched DCC helpers (`_end` leaf bones, IK,
Armature object) are ignored and reported.
_Avoid_: exact-string-only matching, silently dropping mismatches

**TemplatePreserve**:
MotionFbxImport defaults the template to the currently selected NUANMB and
copies every non-Transform group (visibility, material, camera) from it
unchanged; only the Transform group is rebuilt. Importing without a template
produces a transform-only NUANMB with an explicit warning.
_Avoid_: silent transform-only output, editing non-Transform groups on import

**SaveAsNuanmb**:
The import destination comes from a native save dialog (default
`{fbx_stem}.nuanmb`) and must differ from every input path; inputs are never
overwritten. Cancelling is a no-op.
_Avoid_: in-place template overwrite, silent write next to the FBX

**ImportPreview**:
After a successful import the written NUANMB is appended to the motion clip
list and selected, so the existing sampling, compatibility banner, and
playback verify the result immediately.
_Avoid_: import without immediate visual verification

**MotionPanelImport**:
MotionFbxImport lives in the Unit Model Editor Motion panel as an Import
section under the export section. Required input is the active model's
NUSKTB; multi-stack FBX files require an explicit stack choice.
_Avoid_: separate tool page, importing without an active model

**BatchMotionExport**:
Batch CompleteMotionFbx export over the loaded motion folder's clip list: the
frontend iterates the existing single-export command sequentially with
per-clip progress and error collection. One Blender resolve failure aborts
the batch.
_Avoid_: new Rust batch surface, parallel Blender spawns

**ClipOps**:
Pure MotionClip operations (v1: trim frame range, retime by factor) exposed
as NUANMB → new NUANMB commands with save dialogs. Sampling stays 60 Hz;
outputs never overwrite inputs.
_Avoid_: lossy in-place edits, DCC-dependent trimming

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

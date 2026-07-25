# MotionFbxExport uses BlenderCompose, not a pure-Rust complete FBX writer

Status: accepted (2026-07-25)

CascadeurBridge (animation-only FBX + bridge.json round-trip) is abandoned.
The product deliverable is a single CompleteMotionFbx (skinned model + bound
action at SampleRate60). Rust already writes model-only and animation-only
FBX halves but has no reliable merged mesh+animation writer; Cascadeur also
rejected the old animation-only transport. We therefore make Blender 5.1
headless compose the only production path (BlenderCompose +
HeadlessComposeScript), with optional user override of the 5.1 executable
path and hard failure if 5.1 is missing. A pure-Rust complete writer and
hybrid dual pipelines are explicitly out of scope for v1.

## Considered options

- Pure-Rust merged FBX writer — high risk, long tail of DCC compatibility
- Blender 5.1 headless compose (chosen)
- Hybrid Rust-first with Blender fallback — two result shapes, higher cost
- Manual-only Blender addon steps — not a one-click product

## Consequences

- App depends on a local Blender 5.1 install for MotionFbxExport
- StagingFbxPair intermediates are implementation details, not user artifacts
- EXVS2-Easy-Blender-Tools remains a separate manual workflow, not a hard
  dependency of the app export button

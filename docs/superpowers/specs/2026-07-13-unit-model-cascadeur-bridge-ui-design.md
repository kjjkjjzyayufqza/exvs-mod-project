# Unit Model Motion CascadeurBridge UI Design

## Status

Approved by direct user instruction on 2026-07-13. The user requested the
existing Rust NUANMB and CascadeurBridge converter be reachable from the Unit
Model Editor Motion surface.

## Design Read

This is a dense technical desktop-tool panel, not a landing page. Preserve the
existing shadcn/MayaSection language: compact controls, one accent, stable
spacing, explicit loading/error states, keyboard-accessible native dialogs.

## Goal

Make both directions usable inside the existing Unit Model Editor Motion panel:

```text
selected .nuanmb + active model .nusktb
  -> Rust ssbh_export_nuanmb_to_cascadeur_bridge
  -> selected directory / motion.fbx + bridge.json

Cascadeur .fbx + bridge.json + active model .nusktb
  -> Rust ssbh_import_cascadeur_bridge_to_nuanmb
  -> selected output .nuanmb -> Motion list -> preview
```

## Boundary

- Rust remains sole owner of parsing, skeleton validation, FBX evaluation,
  NUANMB encoding, and files written by conversion commands.
- Frontend performs only Tauri dialog selection, command invocation, busy/error
  rendering, and selection of a successful import in the existing preview.
- No GLB, BVH, or Maya `.anim` controls appear in this UI.

## Components

`CascadeurBridgePanel` is a shared `ssbh-model-preview` component. It receives
the selected motion path, active skeleton path, workspace root, a busy flag,
and `onImportedNuanmb(path)`. It owns three serial dialog flows:

1. Export: choose target directory and invoke the export command.
2. Import: choose FBX, choose bridge manifest, save output NUANMB, then invoke
   the import command with `ExactHierarchy`.
3. Result: render frame count, duration, preserved groups, warnings, and the
   created path. Errors remain inline and are also sent to the existing toast
   surface.

The parent Motion context gains `registerMotionNuanmbPath(path)`. It appends a
new output path when absent, selects it, and clears the old sampled clip so the
normal loader validates the generated NUANMB.

## Safety

- Export is disabled without a selected NUANMB or active NUSKTB.
- Import is disabled without an active NUSKTB.
- Cancelling any native dialog is a no-op.
- Current NUANMB becomes the default template on import when present. This
  preserves non-transform groups; no extra user choice is required.
- Busy state disables both directions. Rust still rejects unsafe path collisions
  and mismatched skeletons.

## Acceptance

1. Export click passes selected NUANMB, active NUSKTB, and chosen directory to
   the Rust command.
2. Import click passes FBX, manifest, active NUSKTB, chosen output, current
   NUANMB template, and `exactHierarchy` to Rust.
3. Successful import registers and selects the output path for preview.
4. Cancel, missing source, and Rust failure produce no false success state.

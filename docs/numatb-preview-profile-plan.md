# Plan: per-model NUMATB profile in the unit-model preview

Status: implemented in the unit-model Three.js preview (disk-backed bundles).

Related research: `docs/numatb-character-material-params.md`.

## What the preview does today

Loading one model folder (`ssbh_preview.rs`):

1. Read the `.numdlb` material list. That is the Maya file and the base Nust
   file.
2. `merge_additional_numatb_in_model_folder` also reads every other `.numatb`
   in the folder, including `*_m001__nust__.numatb` and `*_m002__nust__.numatb`.
3. `is_nust_numatb_path` is `ends_with("__nust__.numatb")`. That matches the
   base file and every `_mNNN` file.
4. `select_preferred_matl_paths` keeps all of those Nust paths and drops Maya,
   unless the Nust side has no texture paths at all. An empty Nust entry can
   still copy textures from the Maya entry with the same label.
5. The kept files are concatenated. `buildMatlLookup` in
   `src/components/ssbh-model-preview/meshFromSsbh.ts` merges duplicate labels
   with first-wins: a parameter already present on the earlier entry is kept,
   and the later entry only fills holes.

The base Nust file is usually first, so `_m001` / `_m002` color and texture
changes never reach the mesh. Maya textures appear only when a Nust entry has
an empty texture list.

The Three.js path itself is `resolveMaterialBinding`: one `MatlEntryJson` per
material label, then `MeshStandardMaterial` slots. That function should stay
the slot mapper. This plan only changes which file supplies the entry.

A unit preview can hold many `.numdlb` instances
(`SsbhModelPreviewContext`, `previewInstanceIdFromModlPath`). Each instance
already has its own bundle. The profile choice has to be per instance, so a
body can stay on Nust while a weapon shows `_m001`.

## Target behavior

- Default for every loaded model: the base Nust file only.
  Base means the name ends with `__nust__.numatb` and does not contain
  `_m` + digits before that suffix.
- If that file is missing, fall back to Maya and say so in the existing
  preview warnings.
- A control on each loaded model lists only the profiles that exist on disk:
  `Maya`, `Nust`, and each `_m001`, `_m002`, … discovered in that model folder.
- Choosing one profile replaces that instance's material lookup. The mesh,
  skeleton, and the other instances stay loaded.
- One profile is applied as a whole. Do not merge Maya textures into Nust,
  and do not merge `_mNNN` entries over the base file, while a single profile
  is selected.
- The choice is session state keyed by the preview instance id (the model
  path). It is not a global render-style toggle and it is not written back
  into the `.numatb`.

## Implementation order

1. Classify paths in one shared helper used by the preview loader and the
   unit-model UI: `maya`, `nust`, or `mNNN`. `_m001__nust__` is `m001`, not
   `nust`. Add a Rust unit test that a folder with base + `_m001` + `_m002`
   yields three ids and that the default id is `nust`.
2. Change the preview bundle so each model returns the list of profiles
   (id, filename, parsed matl) and the default id. Stop concatenating them
   into `matl_combined` before the frontend can choose. Keep the current
   single `matl` field as the selected profile so `meshFromSsbh.ts` can keep
   calling `buildMatlLookup` on one file.
3. Add `setPreviewMaterialProfile(instanceId, profileId)` on the preview
   context. It swaps that instance's `bundle.matl` and rebuilds only that
   instance's draws. Texture resolve uses the selected file's paths.
4. UI: one shadcn `Select` per loaded model, in the unit-model preview
   inspector next to the existing render-style control. Label it with the
   model display name. Options are the discovered ids. The default selected
   value is `Nust`.
5. Tests:
   - Path classifier: base `__nust__`, `__maya__`, `_m001__nust__`,
     `_m010__nust__`.
   - Lookup: two entries with the same label and different `CustomColor1`
     stay separate when each profile is selected, and the default selection
     is the base Nust color.
   - Do not add a browser run of the Tauri app in this change. The preview
     host is the desktop shell.

## Out of scope for the first change

- Rewriting `resolveMaterialBinding` slot names. `Texture1` on a character
  body is the roughness-and-mask map; the preview's `textureRefs.ao` path
  still reads `Texture1`. Fixing that is a separate shader-slot pass.
- Saving the choice into the model package.
- Applying `_mNNN` the way the game does (same mesh, extra material set
  chosen by an unproven gameplay index). The preview only shows one set at
  a time so the author can see that set's textures and colors.
- Stage and effect models that ship no Nust file. They keep today's
  "use whatever matl exists" fallback.

## Research still open

The character shader's consumed Custom* set is the table in
`docs/numatb-character-material-params.md`. Names that exist only in the
ParamId string table (`CustomColor3` and above, `CustomFloat10`,
`CustomVector4`, and the rest of those families) are legal file fields and
are not registered as character uniforms. `CustomColor3` and `CustomFloat15`
are stored on `vsngCharaSparkle` entries anyway. A later pass can trace the
sparkle shader, then decide whether the material editor should offer those
ids before a file contains them.

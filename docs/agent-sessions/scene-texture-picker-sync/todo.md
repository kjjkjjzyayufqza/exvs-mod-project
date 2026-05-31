# scene-texture-picker-sync — todo

## Done

- [x] Trace the data source for SceneEdit texture suggestions inside `Import Static Mesh`.
- [x] Reproduce the stale-looking behavior with a focused regression test.
- [x] Fix picker ordering so recent texture edits surface immediately even when the unfiltered list is capped.
- [x] Verify targeted tests pass and changed files are lint-clean.
- [x] Confirm the SceneEdit texture list was only seeded from `resolvedNutexbPaths`, excluding unreferenced files already present in `textures/`.
- [x] Add a regression test proving unreferenced `.nutexb` files from the shared `textures/` folder are included in the texture list.
- [x] Merge shared-folder `.nutexb` discovery into SceneEdit stage load so the texture list shows both referenced and currently unused textures.
- [x] Reproduce that `Fill every texture path parameter for profiles you export` could not find an existing texture when the user pasted a full `...\\textures\\foo.nutexb` path.
- [x] Add a picker regression test covering full-path / `.nutexb` input normalization.
- [x] Normalize SceneTextureSelectPicker search and commit behavior so full path, filename, and basename inputs all resolve to the same texture basename.
- [x] Reproduce that an unreferenced shared texture like `atlas_66bdf54d_0.nutexb` could still be hidden in the default picker list when no query was entered.
- [x] Add a regression test covering default-list cap behavior for unreferenced shared textures.
- [x] Prioritize unreferenced shared textures in SceneTextureSelectPicker so they remain visible in the no-query dropdown.

## Handoff

- Current fix keeps the 80-item no-query cap for performance, but prioritizes the current texture value and recently added/replaced entries.
- Texture list seeding now unions:
  - textures referenced by loaded stage bundles
  - extra `.nutexb` files already present in the shared `textures/` folder
- Texture picker search/commit now normalizes user input to a basename without `.nutexb`, so pasting a full disk path still matches existing scene textures and writes the expected material value.
- Texture picker default ordering now surfaces unreferenced shared textures before the normal referenced-texture tail, which keeps atlas-style fill targets visible even when the no-query list is capped.
- If users later report that removed textures should also be explicitly surfaced in the picker UX, evaluate whether the picker needs a dedicated "recently removed" notice instead of only reordering live entries.

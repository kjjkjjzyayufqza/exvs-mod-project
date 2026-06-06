# scene-info-textures todo

## Done

- Read `AGENTS.md`, `.cursor/rules/custom-rules.mdc`, and relevant Scene Editor texture/stage layout docs.
- Added texture entry scoping for model vs info textures.
- Listed all `.nutexb` files under the shared model `textures/` folder.
- Listed `.nutexb` files under `info/fog`, `info/light`, and `info/post_effect`.
- Split the Scene Texture Manager UI into `Model textures` and `Info textures` sections.
- Kept info textures out of model material picker suggestions, add duplicate detection, and save manifest collection.
- Added Replace support for info textures. Replacing an info `.nutexb` writes back to the original `info/*` file path instead of the shared model `textures/` folder.
- Added/updated focused unit tests.

## Remaining

- Info texture delete/add-new still needs a dedicated design before implementation. It should write in place under `info/*` or follow an explicit info-specific save manifest, not the shared model `textures/` pipeline.

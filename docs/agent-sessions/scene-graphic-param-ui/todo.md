# Scene Graphic Param UI

## Done

- Removed the boolean on/off editor path for scalar `graphic_param` values.
- Kept `0` and `1` values editable as numeric/text values instead of coercing them into booleans.
- Changed scalar and RGB channel text inputs to edit local draft state and commit only on blur or Enter.
- Changed graphic param sliders to update local draft state during drag and commit only on release.
- Added Escape handling that reverts the draft without committing.
- Added a regression test covering `0`/`1` numeric inputs, delayed commit, and Escape revert.

## Remaining

- Project-wide `tsc` still fails in unrelated Scene DAE / model replace preview tests that predate this change.

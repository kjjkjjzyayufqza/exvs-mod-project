# Model attachment templates and multi-model motion playback

Status: implemented (preview tooling)  
Related code: `src/components/ssbh-model-preview/attachmentTemplate*`,
`ModelAttachmentModal.tsx`, `SsbhModelPreviewContext.tsx`.

## Attachment templates (global library)

Mirrors the NUMATB template library pattern:

- Stored in app `settings.json` under `ssbhAttachmentTemplateLibrary`.
- A template holds:
  - **bindings**: `modelId` (8-hex) → model ref (`numdlbPath` / `unitModelLabel` / `previewSlot`)
  - **edges**: host `modelId` + host bone name → guest `modelId` + guest bone name
  - optional **primaryModelId** for motion UI focus

Runtime attachments still use instance ids after **Apply**. Templates never rely on
ephemeral instance ids alone.

## Motion + attachment evaluation order

1. Sample each instance’s motion clip (local bone TRS).
2. GPU skeleton roots are parented under each instance group (skinning shares attach root).
3. Update GPU skeleton world matrices.
4. Apply attachment: `guestLocal = inv(guestRoot) * guestBoneWorld`, then
   `guestRoot = hostBoneWorld * inv(guestLocal)`. Never feed full guest bone
   world (with last frame’s attach) into the second factor — that feedback
   flings guests when the host animates (beam rifle flyaway).
5. Re-update guest skeleton after writing the new root.
6. Attached guests skip side-by-side layout scatter.

Host motion animates the host skeleton. Guest motion (if any) still deforms the
guest; attachment only keeps the chosen guest bone glued to the host bone.

## Motion folder `unk` semantics (preview)

| Node | Field | Meaning |
|------|--------|---------|
| Single item | `unk1` | **Action id** |
| Folder | `unk1` | **Action id** |
| Folder child item | `unk1` | `00000000` |
| Folder child item | `unk2` | **Model id** (channel) |

Opening a motion folder with structure JSON:

1. If a multi-item folder has non-zero item `unk2` values **and** every model id
   is bound in Attachments → **bundle play** (lockstep multi-model).
2. Otherwise list clips on the active model and report missing model ids.

`modelId → model` mapping is **manual** (Attachments panel). Auto-hash mapping
is out of scope until game evidence is confirmed.

## Bone picker UI note

`BoneIndexSearchSelect` popovers must use `--z-popover-elevated` so they paint
above floating `AppRndModalShell` windows (`--z-modal-nested`).

## Delta Kai fixture (TDD)

Real pack (when present on the machine):

- Pack: `E:\XB\mod\002chara\026gnbelt_003delatkai_001`
- Body host bone: **`TE_R`** (not `Hand_R`, not `ATH_TE_*`)
- Beam rifle guest bone: **`GBL_RT`**
- Tests: `src/components/ssbh-model-preview/deltaKaiAttachment.tdd.test.ts`
  - Reads bone lists via shipped `exvs2_json inspect …nusktb --summary`
  - Resolves template through `buildAttachmentTemplate` / `resolveAttachmentTemplate`
  - Asserts `composeGuestAttachRootMatrix` (same formula as `SsbhModelCanvas`)
  - Fail-closed if the external pack is missing (never silent green)

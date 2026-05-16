# scene-texture-controls — process

## Decisions

- Decode + render filtering (plan B): disabled slots are not decoded and not applied to materials.
- Default: Stage Safe (`createStageSafeTextureSlotLoadEnabled`).
- EXVS anime path: `exvsUsesMetalnessMap = hasCube && textureSlotLoadEnabled.metalnessMap` so metalness map follows both cube and slot toggle.
- Slot preset changes and per-slot toggles call `clearNutexbRgbaCache()` like quality changes.

## Commands

- `npm test -- src/page/TestEditor/components/ssbh-model-preview/meshFromSsbh.test.ts`

## Files touched

- `meshFromSsbh.ts` — `createUniformTextureSlotLoadEnabled`, path collection helpers.
- `useSceneTextureLoader.ts` — slot-aware path list.
- `page.tsx` — state + wiring.
- `TextureQualityPanel.tsx` — UI.
- `MapViewport.tsx` — `TexturedMesh` filtering + metalness logic.
- `meshFromSsbh.test.ts` — preset tests.

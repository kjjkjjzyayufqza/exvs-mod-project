# Scene Object Texture Param Placement Process

## Context

- User requested SceneEdit changes:
  - Object-level control for textures loaded by each object, showing real nutexb internal names rather than generic slot names.
  - Global-level display of currently loaded nutexb entries.
  - Separate right-side tab for selective `graphic_param.csv` apply/edit/add/delete with slider controls.
  - Separate right-side tab for selective `placement.csv` apply/edit/add/delete.
  - Fix selected effect disappearing when anime render style is enabled.
- Project rules require Chinese user communication, English code/comments, Tauri v2 native APIs, no dev server unless explicitly requested, and session notes under `docs/agent-sessions/`.

## Sources Read

- `AGENTS.md`
- `.cursor/rules/custom-rules.mdc`
- `docs/superpowers/plans/2026-05-14-sceneedit-nutexb-texture-pipeline.md`
- `docs/agent-sessions/sceneedit-nutexb-texture-pipeline/process.md`
- `docs/agent-sessions/scene-texture-controls/process.md`
- `docs/agent-sessions/scene-editor-feature-audit/process.md`
- shadcn Slider official docs: `https://ui.shadcn.com/docs/components/radix/slider`

## Commands And Findings

- `git status --short` showed an existing modified `src/page/SceneEdit/components/MapViewport.tsx`; this work must preserve and integrate with those changes.
- Context7 MCP resources were unavailable, so official shadcn docs were used for Slider reference.

## Decisions

- Do not wait for explicit design approval because the user's project instructions require automatic execution without approval prompts.
- Keep graphic_param and placement editing in separate right-side tabs instead of merging into the existing first tab.

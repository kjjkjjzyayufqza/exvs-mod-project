"""Generate a complete game-conforming PBR texture set from a single base color map.

The pipeline segments the base color into material clusters once, then derives every
other map as a property lookup on that segmentation. See
`docs/superpowers/plans/2026-08-09-basecolor-to-pbr-texture-forge.md`.
"""

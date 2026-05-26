# origin_structure vs test_structure — unk field diff

Comparing origin (game-extracted) vs test (rebuild with shared textures mode).

## Summary

| Property | origin | test |
|----------|--------|------|
| Fhm2dTotalCount | 41 | 40 |
| Root Folder.folderCount | 2 | 1 |
| Trailing empty Folder(0) | Yes | No |
| SubFileStructure entries | 87 | 83 |

---

## Folder unk differences

All Folder unk1/unk2/unk2_1/unk4/unk6 = 0 in BOTH files. Only unk3/unk5 vary:

| Difference | origin | test | Impact |
|-----------|--------|------|--------|
| Root folderCount | 2 (has trailing empty) | 1 (no trailing) | Medium |
| Trailing Folder(count=0) | Present | Missing | Medium |
| Sky SSBH folderCount | 8 | 7 | HIGH |
| Sky empty nust tex container (unk3=32,unk5=1,count=0) | Present | Missing | HIGH |

---

## Item unk2 distribution

| unk2 | origin | test | Status |
|------|--------|------|--------|
| 00000000 (default) | 52 | 50 | OK |
| 10000000 (skel) | 3 | 3 | OK |
| 21000000 (mat) | 6 | 5 | MISSING sky nust.numatb |
| 30000000 (mesh) | 3 | 3 | OK |
| 40000000 (mdl) | 3 | 3 | OK |
| 50000000 (jnt) | 3 | 3 | OK |
| 01010000 (fx) | 1 | 1 | FIXED |

All Item unk1/unk2_1/unk3/unk4 = 0 in BOTH files. No difference.

---

## Critical issues to fix

### Issue 1: Sky empty nust texture container + numatb missing

Origin sky/0 (folderCount=8):
- nusktb (unk2=10000000)
- Folder(1, unk3=32, unk5=1) + 1 tex + EndMark
- maya.numatb (unk2=21000000)
- Folder(0, unk3=32, unk5=1) + EndMark   <-- MISSING in test
- nust.numatb (unk2=21000000)             <-- MISSING in test
- numshb, numdlb, jnttbl

Test sky/0 (folderCount=7):
- nusktb (unk2=10000000)
- Folder(1, unk3=32, unk5=1) + 1 tex + EndMark
- maya.numatb (unk2=21000000)
- numshb, numdlb, jnttbl

Cause: build_exvs_model_folder skips empty/missing nust container dir and its paired numatb.

### Issue 2: Missing trailing empty Folder(0) at root

Origin: Folder(count=2) > [content Folder, empty Folder(count=0)]
Test: Folder(count=1) > [content Folder]

Cause: build_exvs_structure_tree does not emit the trailing empty folder.

---

## What is already correct

- post_effect lut_none.nutexb unk2=01010000 (FIXED)
- All texture containers have unk3=32, unk5=1
- SSBH ordering: nusktb first, tex+numatb interleaved, numshb/numdlb/jnttbl
- Item unk1/unk2_1/unk3/unk4 all zero
- Folder unk1/unk2/unk2_1/unk4/unk6 all zero
- Texture deduplication (shared fileIndex across models)

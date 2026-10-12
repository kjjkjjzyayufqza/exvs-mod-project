# Heliopolis source motion and effects

Active task: repair the owner's `mbon_heliopolis` objects and missing effects
from original MBON data. Practice sky/floor v2 is user-confirmed basically
correct. Do not redo its geometry or remove the nine VIS comparison maps.

## Motion v1 superseded after the requested complete self-audit

Entry `2111950100`, pack `0xA5071A4F.fhm2d`, SHA-256
`6d353e3dd6aa977981fdb35784571c10dfd91a4a73cfaa1c06a6180e4fe3004a`.
Both animated object definitions (0/1), three placed instances, retain every
one of their 1,700 original frames. Source T/R raw float bits match an
independent original OMO decoder; 16,802 vertices and all 241 packed payloads
pass the independent source/container gate. Other assets retain their hashes.
This v1 numerical/container gate was insufficient: it did not prove the
source instance playback policy or native root-motion normalization. Do not
test or redeploy v1 as the current repair. OB game behavior remains unverified.

## Current audited motion v2

The user's latest instruction was a complete self-audit before testing.
Four errors were corrected: only source object 0 (`pid=4`) plays, it plays
once, source object 1's two `pid=0` instances hold, and the source root TRS
must be normalized against its initial pose. Bound collision triangles now
use the same original inverse bind as the meshes.

Current pack SHA-256:
`56841814ef50112428a40210f71daa459e6fee809423536debdff305723fc0a3`.
Entry/hash unchanged. One 1,700-frame u16 clip, two static instances, 240
packed resources. Both source models' 16,802 vertices are checked; every
playing vertex at every frame is compared with executed original matrix
routines. Measured world vertex error 0.004117709 source units at coordinates
around 10,335; the six-f32-ULP-plus-vertex-conversion gate is 0.006109375.
This is explicitly a floating-point equivalence gate, not bit identity
between different engines' world matrices.

Native `pid=4` vtable `1673F90` updates through **C5A9B0**, not C5A590.
`B0F450` initializes source pid=0 at time zero and creates no playback
controller. `F7BA70` retains -T(0)/conjugate(R(0)); F7C660/F7F830/F7FC80
produce the relative root pose. Licensed IDA isolated copies and original
bounded AVX math were used; Unicorn 2.1.4 cannot execute these AVX routines.
No game entry point or user game/IDA process was run or changed.

All 114 actual deployed packages pass the complete byte gate: 26,626 files,
1,467,219,456 packed bytes. Sources/group mirrors, structure JSON, 235 list
entries, registry and test-result templates are consistent. 9 VIS packages
remain. Heliopolis source audit: 139 textures, including 10 lossy BC2→BC3
variants; 472 plan bytes and all 14 locators checked.

Current local scripts: `heliopolis_self_audit.py`,
`heliopolis_native_math_audit.py`, parameterized `heliopolis_motion_verify.py`.
Evidence: `heliopolis-source/motion-v2/self-audit.json` and
`HELIOPOLIS_SELF_AUDIT.md`. Status: static pass with feature gaps; all FX,
destruction/debris and runtime acceptance remain outstanding. Do not call
the map completely restored.

The NUD vertices are world-space, unskinned (`single_bind=-1`). Original
`bind,0,0` plus the VBN world-to-bind matrix becomes an OB rigid parent.
Source locator positions/rotations match directly and names are restored.
Native MBON OMO 1.0 has 12-byte nodes; the generic 1.3 hash-node parser is wrong
for these files. Native OB `nu::DecompressCurve::Decompress` (`140055C20`)
and `140055E80` prove uncompressed float/u16-index curves (`3200`, `4200`),
preserving all frames beyond the FBX writer's u8-index limit. FBX policy is intact.

Implementation: `src-tauri/src/mbon/stage_port/object_motion.rs`, CLI
`repair-object-motion`, `anim-json`, `skel-json`. Stage auditing validates rigid
parent/animation bindings; source stage reader retains original OMO payloads.

Local work root: `local-note/stage-batch-20261011/` (excluded assets).
Scripts: `heliopolis_motion_fix.py`, `heliopolis_motion_verify.py`.
Evidence: `heliopolis-source/motion-v1/verification.json`.
Editing folders, structure JSON, package, manifests and test catalogs are synced
to `E:/XB/mod/001stage/group/MBON` and local notes. IDs/list registry unchanged.
Practice's existing runtime-status metadata now records the user's confirmation.

## Effects research remains active

Use [descatal BoostStudio](https://github.com/descatal/BoostStudio) as the
primary container/NUD/VBN reference. Remote main matches local clone
`6cb8d8ad01a088eb6bb6834ed0ac2e110f85b486`; no OMO/OELA parser is present there.
The applicable older research is
[MBON ParseALEO](https://github.com/descatal/FBRepacker/blob/master/FBRepacker/Data/MBON_Parse/ParseALEO.cs)
and [EIDX](https://github.com/descatal/FBRepacker/blob/master/FBRepacker/PAC/Extract/FileTypes/EIDX.cs).
Searching only OELA misses the ALEO filenames.

Source stage `46C3DCBD.bin` embeds four original stage explosions, 22 OELA
elements total. There are no source `eff` placement rows; the historical
`skippedEffectPlacements=0` never proved effect conversion. All current
converted props remain UNBREAKABLE, so their native destruction trigger chain
is also missing. Ordinary source objects 2/3/4/6 bind EXP_002/001/004/003;
debris submeshes are `v01`, intact meshes `v10`, persistent pieces `v11`.
Do not replace them with unrelated OB effects or guess particle fields.

`heliopolis_effect_source.py` resolves **all 11 original dependencies**:
seven textures and four models, from the stage and MBON common-effects
`FABAA98C.bin`. `34F85A51.bin` has no required dependencies.
See excluded `heliopolis-source/effect-source-resources.json` and
`effect-resources/`. Definitions are `EFF_STAGE19_EXP_{001,002,003,004}.oela`.

Remaining implementation: decode every OELA field/curve and translate to OB
EFXBN, register converted models/textures, add native building substitution,
debris and effect triggers, then run a focused source/math/byte gate. Nothing
from this effects phase has been deployed yet.

## IDA state and pitfalls

Initially the MCP reported no active instance. The read-only helper
`heliopolis_ida.py` uses IDA Pro's licensed idalib on isolated IDB copies and
closes without saving. Original MBON:
`E:/research/shadps4/local-notes/CUSA15006_mapped.elf.i64`; OB:
`E:/OBHK0.3_v27/vsac27_Release.exe.i64`.
The user explicitly permits opening/decompiling these when needed.

Do not use the old `CUSA15006_eboot_ida.bin.i64` addresses. Code offset shortcut
does not apply to RELRO: use ELF segment mappings / IDA file-region offsets.
`decompile` can return an unrelated oversized containing function for an
unrecognized vtable target. `decompile_exact` repairs boundaries in the
isolated copy only. Examples: C5A580 is `xor eax,eax; ret`; AC1670 is an empty
destructor and AC1680 deletes; the previous oversized AC0110 output was wrong.

Settled native anchors: MBON F27730/F27BF0/F28260 OMO decode, C58290 part
matrix, B0F450 source placement/definitions, AA4D30 OELA/EIDX resource loader,
ABE210 64-bit OELA relocation/name hashing. The source OELA 620-byte element
uses 140-byte texture-control records, not OB's 880/184-byte formats.

Latest route: original MBON RTTI `ENG::CAleEmitter` name at 130BB9F,
typeinfo 164F840, vtable 164F830; PC-relative assignment in 49A970,
called by 4A0500. This class has only an empty/delete virtual destructor,
so effect update fields must be traced through its nonvirtual consumers.
Native OB extracted 203stage203 effects: `0/1/481.bin` is EFXB; its structure
item has role zero and **unk3=1863869543 (effect ID)**. Stage rebuild currently
does not infer/register arbitrary effect IDs. It must preserve or explicitly
register EFXBN resource nodes, alongside converted dependency handles.

Unresolved native findings must stay qualified; do not publish a guessed
type-5/type-7/type-3 mapping or PID-7 coordinate reset as fact.

## Actual GUI / MCP follow-up, 2026-10-11

At the user's explicit request, two IDA Pro GUIs were opened on **isolated
database copies** in excluded `heliopolis-source/mcp-gui/`. The HTTP MCP
broker at `127.0.0.1:13337/mcp` routes actual `tools/call` requests to
`ida-42688` (MBON mapped ELF) and `ida-28772` (OB executable). Both report
ready Hex-Rays. `heliopolis_mcp.py` retains full tool envelopes. This is
actual MCP use, separate from the earlier licensed idalib analysis.

The MBON copy's MCP `idb_save` subsequently timed out and blocked its GUI.
Only that newly created task-owned process was recovered, with the save-time
snapshot retained; the current MBON GUI is **ida-37464**, loading the
`mcp-gui/recovered/` copy. All five MBON comments were replayed through MCP.
OB and other user-opened IDAs were not restarted. Comment requests are
durably recorded outside the database; successful IDB save is not claimed.

Native OB destruction path is now traced through `1405CA380`, `1405EFB20`,
`1405EE7D0`, `1405CDA50`, `1405CDBE0`, `1405CDE40` and `1405C9FD0`.
HP must be nonzero and the required collision resource present to enable
damage. The CSV parser maps SOFT=1, MEDIUM=500, HARD=1000 and UNBREAKABLE=0;
MBON ORDINARY equivalence still needs native proof. Substitute references
are **placement row indices**, not model/object numbers. The driver emits
at most eight combined substitution/removal events.

EXP_002's three 24-byte child records `(2,10,0,1)` mean one-shot mode,
repeat interval 10, **initial delay zero**, and parent-transform attachment.
`ACAAA0` maps record +12/+16 to runtime +24/+28; actual `ACA8D0` and
`ACA90F` prove one-shot dispatch. AVX pseudocode omitted the spawn branch;
MCP assembly queries supplied the decisive evidence. Timing units remain
qualified. Source type 7 is a non-drawing particle with child state; OB's
wrapper type 9 normalizes a first child of type 6 to runtime type 7. The
complete conversion topology is still unproven. Mapped ELF vtable function
values require the CODE mapping correction (6CA670 encoded → ACA670 mapped).

The independent byte gate derives the actual CODE load bias from the IDA
segment and ELF PT_LOAD, despite reported imagebase zero. OELA header +60
is a **u8 count**, followed by CD CD CD padding; native AA516A/AA5179 proves
the byte read. Element type/child count and child records remain u32. The
gate's initial assumptions about load bias and header count width failed
and were corrected against native assembly before a pass was recorded.

The four EXP definitions' 11-dependency closure does not cover all source
effect references. Objects 0/1 also name COMMON_HIT_062; objects 5/7 name
COMMON_HIT_072. Their activation and dependencies remain to be researched.
OB `1405F00B0` is procedural PROGRAMID motion, not proof that NUANMB bones
move stage HKT. Dynamic collision acceptance remains open.

See excluded `HELIOPOLIS_MCP_ANALYSIS.md/.json` and mirrored MBON group notes
for the evidence and remaining implementation constraints. This follow-up
does not deploy guessed effects or change the audited motion-v2 package.

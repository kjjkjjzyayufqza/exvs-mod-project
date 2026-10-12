# Character NUMATB profiles and custom parameters

Status: OB call chain proven for the shared character uniform table. The
worked example below is one packed body used to show how the three profile
files differ. It is historical mod data, not the source of the uniform names.

Native evidence is `E:/OBHK0.3_v27/vsac27_Release.exe` in IDA at image base
`0x140000000`. ParamId discriminants are the MATL 1.6 enum in the `ssbh_lib`
revision this repository already depends on (`CustomColor0 = 172`, and so on).
`exvs2-json inspect` reads the sibling `.numdlb`. It has no `numatb` type, so
the material values were read with a MATL 1.6 dump under `tmp/`.

## What Maya, Nust, and `_m00N` are

A character model folder ships one mesh (`.numshb`), one skeleton
(`.nusktb`), one `.numdlb`, and two or more `.numatb` files.

| File | Who names it | What it is |
|---|---|---|
| `*__maya__.numatb` | `.numdlb` `material_file_names[0]` | Authoring profile. Every entry has an empty `shader_label`. Holds `Diffuse`, `Specular`, `DiffuseMap`, `SpecularMap`, UV transforms, and `CosinePower`. |
| `*__nust__.numatb` | `.numdlb` `material_file_names[1]` | Runtime profile. Entries carry a shader label such as `vsngCharaBasic`. This is the set the mesh bindings draw in the normal state. |
| `*_m001__nust__.numatb`, `*_m002__nust__.numatb` | This editor, not the game | Extra MATL blobs packed in the same model group after the two names the `.numdlb` declares. `build_extra_nust_numatb_desired_file_name` in `src-tauri/src/format/fhm2d_numdlb_character.rs` numbers them `_m001`, `_m002`, … The exe contains no `_m001` string. |

Profile identity in this repository follows the file contents: any non-empty
`shader_label` means Nust, and an all-empty file means Maya
(`detect_numatb_profile_from_matl` in `src-tauri/src/format/numatb_format.rs`).
A filename can disagree with that test. Trust the shader label.

The `.numdlb` only points at the Maya file and the base Nust file. Its
`entries` bind each mesh subindex to a material label (`emiMtl`, `pbr1Mtl`,
…). Every extra Nust file must repeat those same labels. A missing label in
an extra set becomes a null material during load. That failure mode is
written up for a different body in `docs/agent-sessions/2026-09-13-quntfs-body-load-crash.md`.

### How the game applies a set

1. `sub_14031D6E0` finishes model setup and calls `sub_1402FE9A0`.
2. `sub_1402FE9A0` walks each mesh. For `j` in `0 .. *(model + 0x28)` it looks
   the mesh's material label up in the material container at
   `model + 0x38 + 32*j` (`sub_140289370`). The stack array it fills is five
   slots (`eh vector constructor` count 5), so a model can carry the base set
   plus several extras.
3. `sub_1402FE510`, called just before that, walks the base container and the
   same indexed extras and binds each material to the graphics context
   (`sub_1400BAB80`).
4. `sub_1402FF810` is the character-shader filter. A material is collected
   when its shader label contains one of: `vsngCharacterSpecial`,
   `vsngCharaBasic`, `vsngCharaRimlight`, `vsngCharaColoredEmission`,
   `vsngCharaQuantize`, `vsngCharaControlReflectionEmphasis`,
   `vsngCharaGSelf`, `vsngCharaBasicInstancing`, `vsngCharaHSVConvert`,
   `vsngCharaFadeout`, `vsngCharaSparkle`, `vsngCharaPlavsky`.
5. `sub_140612F30` rewrites materials whose current shader is
   `FeRendererMovable`, `vsngCharacterSpecial`, `vsngCharaColoredEmission`,
   or `vsngCharaRimlight` onto `vsngCharaBasic`. For each uniform below it
   inserts the default only when that uniform is still missing. The byte
   after the shader name in the static table selects the `FresnelRatio`
   default: `1` writes `0`, `0` writes `1`.

| Uniform inserted if missing | Value kind | Default |
|---|---|---|
| `GBufferDiffuseMultiply` | color (7) | `0,0,0,0` |
| `GBufferSpecularMultiply` | float (1) | `1` |
| `GBufferRoughnessMultiply` | float (1) | `1` |
| `GBufferEmissiveColorMultiply` | color (7) | `1,1,1,1` |
| `GBufferDamage` | color (7) | `0,0,0,0` |
| `GBufferParamEx1` | vector (5) | `1,1,1,1` |
| `GBufferParamEx2` | float (1) | `1` |
| `FresnelBias` | float (1) | `0.1` |
| `FresnelPower` | float (1) | `1` |
| `FresnelRatio` | float (1) | `0` or `1` (see above) |
| `ReflectionScale` | float (1) | `1` |
| `RimlightColor` | vector (5) | `0,0,0,0` |
| `RimlightPower` | float (1) | `0` |
| `EnableAwakening` | bool (0) | `0` |
| `CharaParamEx1` | vector (5) | `1,1,1,1` |
| `CharaParamEx2` | float (1) | `1` |

`1,1,1,1` is the constant at `0x141B4F7C0`. Float `1` is `1065353216`.
Float `0.1` is `1036831949`.

Which gameplay state later selects set index 1 versus set index 2 is not
proven here. Both extra sets are built at load, before the player enters a
special visual state.

## From a NUMATB value to a shader uniform

`sub_1401369C0` builds the process-wide dictionary from MATL `ParamId` to the
runtime uniform name. `sub_1401369C0` then aliases instancing shader labels
back to the base shader (`vsngCharaBasicInstancing` → `vsngCharaBasic`,
`FeRendererMovableInstancing` → `FeRendererMovable`, and the same for
`FeRendererMovableVertexColor`, `FeRendererMovableMultiUVVertexColorAO`,
`vsngCharaFadeout`, `FeStandard`, `FeStandard_MultiUV`).

A later consumer such as `sub_140675850` resolves three uniforms by those
names (`GBufferDiffuseMultiply`, `GBufferSpecularMultiply`,
`GBufferRoughnessMultiply`) and packs the floats it finds. The dictionary,
not a second naming scheme inside the `.numatb`, is what makes `CustomColor0`
land on diffuse.

On-disk type tags (MATL 1.6): `0` Float, `1` Float1, `2` Boolean, `5`
Vector4, `7` Color4 (`Unk7` in the editor), `11` texture path.

| ParamId | Disk id | Disk type | Runtime uniform | What a modder can change |
|---|---:|---|---|---|
| `CustomColor0` | 172 | Color4 | `GBufferDiffuseMultiply` | RGB multiply on deferred diffuse. `0,0,0,0` is the identity used by normal PBR entries. |
| `CustomColor1` | 173 | Color4 | `GBufferEmissiveColorMultiply` | RGB multiply on emissive. `1,1,1,1` is the identity. |
| `CustomColor2` | 174 | Color4 | `GBufferDamage` | Damage tint. `0,0,0,0` is the default. |
| `CustomVector0` | 152 | Vector4 | `RimlightColor` | Rim color in XYZW. |
| `CustomVector1` | 153 | Vector4 | `OutlineColor` | Outline color in XYZW. The worked body does not store this id. |
| `CustomVector2` | 154 | Vector4 | `GBufferParamEx1` | Four floats. Per-lane meaning is not proven. Shipped value is `1,1,1,1`. |
| `CustomVector3` | 155 | Vector4 | `CharaParamEx1` | Four floats. Per-lane meaning is not proven. Shipped value is `1,1,1,1`. |
| `CustomFloat0` | 192 | Float1 | `FresnelBias` | `0.1` on every entry of the worked body. |
| `CustomFloat1` | 193 | Float1 | `FresnelPower` | `1` |
| `CustomFloat2` | 194 | Float1 | `ReflectionScale` | `1` |
| `CustomFloat3` | 195 | Float1 | `GBufferSpecularMultiply` | `1` |
| `CustomFloat4` | 196 | Float1 | `GBufferRoughnessMultiply` | `1` |
| `CustomFloat5` | 197 | Float1 | `RimlightPower` | `0` |
| `CustomFloat6` | 198 | Float1 | `DiscardRatio` | Not stored on the worked body. |
| `CustomFloat7` | 199 | Float1 | `GBufferParamEx2` | `1` |
| `CustomFloat8` | 200 | Float1 | `FresnelRatio` | `1` |
| `CustomFloat9` | 201 | Float1 | `CharaParamEx2` | `1` |
| `CustomFloat12` | 204 | Float1 | `FadeoutRatio` | `0` on the sparkle entry. |
| `CustomFloat14` | 206 | Float1 | `QuantizeRatio` | `0` on the sparkle entry. |
| `CustomInteger0` | 212 | Float (tag 0) | `EnableAwakening` | `0` means off. The file stores a float; the uniform is the boolean filled by `sub_140612F30`. |
| `CustomBoolean0` | 232 | Boolean | `IsDiffuseHSV` | Read `CustomColor0` as HSV when set. Absent on the worked body. |
| `CustomBoolean1` | 233 | Boolean | `IsSpecularHSV` | Specular tint as HSV when set. Absent on the worked body. |
| `CustomBoolean2` | 234 | Boolean | `changeDirection` | `0` on the sparkle entry. |

`EmissiveScale` (id 10, Float1) is not in that dictionary. The runtime keeps
the legacy name. On the worked body the emissive material stores `10`, and
the two PBR materials store `0`.

`Diffuse` (id 0) and `Specular` (id 1) are Color4 values on the Maya profile
only. The Nust profile of this body does not store them. The runtime
multiply path is `CustomColor0` / `CustomFloat3`, not these two.

Color channels are linear floats. They are allowed to leave `0..1`. The
editor's picker writes `0..1` sRGB bytes and leaves the alpha channel alone.
When a stored RGB channel is already outside `0..1`, the picker stays
disabled so it cannot clamp an HDR value; the four number fields remain the
source of truth.

## Textures on a `vsngCharaBasic` entry

These are file paths (type 11), not colors. On `pbr1Mtl` of the worked body:

| ParamId | Path role in this body |
|---|---|
| `BaseColorMap` | `…_pbr1_basecolor` |
| `NormalMap` | `…_pbr1_normal` |
| `RoughnessMap` | `…_pbr1_roughness` |
| `MetallicMap` | `…_pbr1_metallic` |
| `AmbientOcclusionMap` | `…_pbr1_ambientocclusion` |
| `EmissiveMap` | `…_pbr1_emissive` |
| `Texture1` | `…_pbr1_roughnessandmask` |
| `DiffuseCubeMap` | `share/textures/barispecular00_cubemap` |

`UseMetallicMap`, `UseRoughnessMap`, `UseAmbientOcclusionMap`,
`UseNormalMap`, `UseEmissiveMap`, and `ReceiveShadow` are booleans and are
`1` on that entry. `NormalMapBc5` is `0`. The matching Maya entry points
`DiffuseMap` at the same base color and `SpecularMap` at the metallic map,
and it stores identity UV transforms (`DiffuseUvTransform` id 274,
`SpecularUvTransform` id 275, `NormalUvTransform` id 276, each with scale
`1,1`).

The sampler register each path binds to is not traced in this note.
`docs/exvs2-custom-model-pbr-map-calibration.md` is the place for the
roughness / metallic / `Texture1` art constraints.

## Worked body

Folder: `015gndmuc_008faunig_001_body_normal`.

`.numdlb` model name `015gndmuc_008faunig_001_body_normal`. Material files:

- `nusubf/015gndmuc_008faunig_001_body_normal__maya__.numatb`
- `./nusubf/015gndmuc_008faunig_001_body_normal__nust__.numatb`

Mesh subindexes `0..3` use labels `emiMtl`, `pbr1Mtl`, `pbr2Mtl`, `spark1`.

| Profile | Shaders | Labels |
|---|---|---|
| Maya | empty | `emiMtl`, `pbr1Mtl`, `pbr2Mtl`, `spark1` |
| Nust, `_m001`, `_m002` | `vsngCharaBasic` on the three solid materials, `vsngCharaSparkle` on `spark1` | same four labels |

`_m001` against the base Nust file:

- `emiMtl`: `BaseColorMap` switches to `…_emib_basecolor`. `CustomColor1`
  changes from white to about `(0.0012, 1, 0.476, 1)` (green emissive multiply).
- `spark1`: `CustomColor0`, `CustomColor1`, and `CustomColor3` (id 175) are
  recolored. `CustomFloat15` (id 207) goes from `800` to `550`.
- `pbr1Mtl` and `pbr2Mtl` match the base file.

`_m002` against the base Nust file:

- `emiMtl` matches the `_m001` emission retint and `emib` base color.
- `pbr1Mtl` and `pbr2Mtl`: `CustomColor1` becomes about `(0.605, 0.820, 1, 1)`
  and `EmissiveScale` goes from `0` to `2`.
- `spark1`: the same color ids move, `EmissiveScale` is introduced at `1`,
  and `CustomFloat15` is `777` rather than `550`.

So the two extra files are alternate sets, not a stack. `_m001` retints the
emissive and sparkle materials. `_m002` does that and also lifts the PBR
materials' emissive multiply and scale. Nothing in the exe names those sets
after a specific attack or awakening state.

## Parameters the game accepts that a normal body does not store

`sub_140138E50` (the helper that inserts one ParamId → uniform pair) is called
only from `sub_1401369C0`. There is no second character dictionary. A name
that exists only in the ParamId pointer table at `0x141708xxx` can be stored
in a MATL file and will survive the loader, and the character shader will not
read it through this table.

`CustomFloat10` (`0x141aaa460`) and `CustomVector4` (`0x141aaad80`) have no
code xref outside that name table. The same is true of the higher
`CustomColor3`–`CustomColor19`, `CustomFloat11`, `CustomFloat13`,
`CustomFloat15`–`CustomFloat19`, and `CustomVector4` and above: the parser
knows the spelling, and this pass found no uniform registration.

A typical `vsngCharaBasic` entry (the worked body's `pbr1Mtl`) omits uniforms
the character table does read. `sub_140612F30` fills the defaults when the
material is missing them:

| ParamId | Uniform | Default if the file omits it | Seen on the worked body |
|---|---|---|---|
| `CustomVector1` | `OutlineColor` | `0,0,0,0` | no |
| `CustomFloat6` | `DiscardRatio` | none in the default fill | no |
| `CustomFloat12` | `FadeoutRatio` | none in the default fill | `spark1` only, `0` |
| `CustomFloat14` | `QuantizeRatio` | none in the default fill | `spark1` only, `0` |
| `CustomBoolean0` | `IsDiffuseHSV` | none in the default fill | no |
| `CustomBoolean1` | `IsSpecularHSV` | none in the default fill | no |
| `CustomBoolean2` | `changeDirection` | none in the default fill | `spark1` only, `0` |

`CustomColor3` (id 175) and `CustomFloat15` (id 207) are the opposite case:
`spark1` stores them and the extra sets change them, and they are not in
`sub_1401369C0`. Writing them is safe for the file format. What the sparkle
shader does with them is still unproven.

Stage and effect shaders were not given a second pass here. A search for the
string `vstgStandard` in this OB image returned no hits, so this note does
not claim a stage uniform list.

## Still unproven

- The gameplay flag that chooses material-set index 1 versus index 2.
- `CustomColor3` (id 175) and `CustomFloat15` (id 207). They exist on
  `vsngCharaSparkle` entries and change between the extra sets. They are not
  registered in `sub_1401369C0`, and `CustomColor3` has no code xref beyond
  the ParamId name table at `0x141aaa330`.
- Per-component meaning of `GBufferParamEx1` and `CharaParamEx1`.
- The sampler slot bound for each texture ParamId.
- `nfCustomInteger0`, `nfCustomInteger1`, `nfCustomFloat0`, and
  `nfCustomFloat1` appear in a shader-reflection blob at `0x1413489b8`.
  That blob is a different naming layer from the G-buffer dictionary above.
  Do not treat the `nf*` prefix as the uniform the character materials write.

## Editor

`CustomColor*`, `Diffuse`, `Specular`, `CustomVector0` (`RimlightColor`),
and `CustomVector1` (`OutlineColor`) use a color swatch plus R/G/B/A number
fields in the material entry editor. Other mapped parameters keep their
numeric or JSON editors and show the runtime uniform name under the ParamId.
The map lives in `src/components/ssbh-model-preview/numatbParamSemantics.ts`.

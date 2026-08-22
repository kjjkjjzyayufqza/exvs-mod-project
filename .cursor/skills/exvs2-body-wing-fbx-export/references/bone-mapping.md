# Same-name retarget (TV gwtv → Rebellion body)

This is **not** required for split export. It is the compose step that produced `from_gwtv` body keys.

Source dump used in session 019fec42:

```text
D:\output\exvs2\wing_gundam_zero_rebellion\motion\_src_action_dump.json
```

Source clip: `032gwtvTR_028gunwtv_001gunwtv_001_body_tf_kamaesht2neo_sht_air_fr` (TV `body_tf`, 78 bones).

## Default rule

Copy a source bone onto the target **only if the names match and the target has that bone**.

Proven same-name set on Rebellion body (19 bones):

```text
GBL_RT, CENTER_RT, BASE, KOSHI, MUNE1, MUNE2, ATAMA, KUBI,
KATA_L, KATA_R, SAKOTSU_L, SAKOTSU_R, UDE_L, UDE_R, TE_L, TE_R,
MOMO_L, MOMO_R, ATH_E_MUNE
```

Then **delete `ATH_*` keys** (`ATH_E_MUNE` included). Optional: user later dropped `KUBI` / `ATAMA` entirely.

Do not copy source-only names (`WING_*`, extra `FOOT_*`, `FARM_*`, `BSRIFLE_*`, vapor helpers, …).

Do not assign body `GBL_RT` onto wing `GBL_RT`.

## Optional leg map (off by default)

TV uses `FOOT_*`. Rebellion uses `HIZA` / `ASHI` / `TSUMASAKI`.

| Source | Target |
|--------|--------|
| `FOOT_L_1` | `HIZA_L` |
| `FOOT_L_2` | `ASHI_L` |
| `FOOT_L_3_1` | `TSUMASAKI_L` |
| `FOOT_R_1` | `HIZA_R` |
| `FOOT_R_2` | `ASHI_R` |
| `FOOT_R_3_1` | `TSUMASAKI_R` |

Apply **only if the user asks**. The proven from_gwtv `_out.fbx` did **not** keep this map.

Do not map `FOOT_3_2/3_3/4/5/6` — Rebellion has no bones for them.

## Wing

Do **not** retarget TV `WING_*` or `482gwtvwing` onto Rebellion `LMAIN_*` / `RMAIN_*`. Load a `410wzerowing_*` clip onto `ZeroEW_Wing` instead (kamae, guardbgn, guardloop, or a homemade wing clip).

TV Bird wings live on `body_tf`. Rebellion in-game bird may also skip the independent wing package — that is an MSC/model question, not this export skill. For homemade **preview/compose** of Rebellion normal-form wing, still split-export 410 clips.

# ssbh_lib IDA Audit — Format Checklist

Session started: 2026-06-14  
Scope: Every binary format implemented in `E:/research/ssbh_lib/ssbh_lib/src/formats/`

TAURI_PROJECT vendors ssbh_lib from git `kjjkjjzyayufqza/ssbh_lib` branch `wmmt2` (see `src-tauri/Cargo.toml`).  
Formats **not** in ssbh_lib (handled elsewhere): `nutexb`, `hkt`, `fhm2d`, MSC, etc.

## Container

- [ ] **HBSS** — SSBH file wrapper magic `HBSS` (all SSBH types below except Adj/MeshEx)

## SSBH formats (HBSS + inner FourCC)

- [x] **hlpb** — FourCC `BPLH`, ext `.nuhlpb`, module `formats/hlpb.rs` → [`hlpb.md`](hlpb.md)
- [x] **matl** — FourCC `LTAM`, ext `.numatb`, module `formats/matl.rs` → see `matl.md`
- [x] **modl** — FourCC `LDOM`, ext `.numdlb` / `.nusrcmdlb`, module `formats/modl.rs` → [`modl.md`](modl.md)
- [x] **mesh** — FourCC `HSEM`, ext `.numshb`, module `formats/mesh.rs` → [mesh.md](./mesh.md) (IDA blocked; ssbh_lib + gaps documented)
- [x] **skel** — FourCC `LEKS`, ext `.nusktb`, module `formats/skel.rs` → [`skel.md`](skel.md)
- [x] **anim** — FourCC `MINA`, ext `.nuanmb`, module `formats/anim.rs` → [`anim.md`](anim.md)
- [x] **nlst** — FourCC `TSLN`, ext `.nulstb`, module `formats/nlst.rs` → [`nlst.md`](nlst.md) (no TSLN handler in EXE; FileList proc chain documented)
- [x] **nrpd** — FourCC `DPRN`, ext `.nurpdb`, module `formats/nrpd.rs` → [`nrpd.md`](nrpd.md)
- [x] **nufx** — FourCC `XFUN`, ext `.nufxlb`, module `formats/nufx.rs` → [`nufx.md`](nufx.md)
- [x] **shdr** — FourCC `RDHS`, ext `.nushdb`, module `formats/shdr.rs` → [`shdr.md`](shdr.md) (IDA: no RDHS/HBSS in exe; LTAM/XFUN/LDOM dispatch documented)

## Non-SSBH formats (ssbh_lib)

- [x] **adj** — ext `.adjb`, no HBSS wrapper, module `formats/adj.rs` → [`adj.md`](adj.md)
- [x] **meshex** — ext `.numshexb`, no HBSS wrapper, module `formats/meshex.rs` → [meshex.md](./meshex.md)

## Summary deliverable

- [x] **SUMMARY.md** — aggregate gap severity and top priority fixes → [`SUMMARY.md`](SUMMARY.md)

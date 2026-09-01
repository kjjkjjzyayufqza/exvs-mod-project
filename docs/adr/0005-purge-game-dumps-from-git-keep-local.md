# Purge game dumps from git history; keep the local working tree

Status: accepted (2026-09-01)

Full publisher dumps and game files (including `vsac27_Release.exe.md` and
similar UnlicensedGameMaterial) are removed from git history and from the
public remote via HistoryPurge. The author's working tree keeps those files
(WorkingTreePreserve); they become gitignored. Project-authored per-function
OB notes under `docs/ida-dumps/` and TrackedToolchainBinary CLIs under
`tools/` stay in git. Ignore-only without history rewrite was rejected
because the GitHub remote would keep serving the dumps from old commits.
Already-cloned forks are not retracted by this rewrite.

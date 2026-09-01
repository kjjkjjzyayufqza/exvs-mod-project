# Source-available code under PolyForm Shield; docs under CC BY-NC-SA

Status: accepted (2026-09-01)

The repository is no longer MIT. Program source is **SourceAvailable** under
PolyForm Shield 1.0.0 so a **CompetingProduct** (rebranded or wrapped editor,
sold or free) is outside the copyright license. Project-authored documentation
and research prose use CC BY-NC-SA 4.0 for attribution, noncommercial reuse,
and ShareAlike. Use bans that copyright cannot express — in-scope revisions,
live-service work, shipping **UnlicensedGameMaterial** — live in a separate
**AcceptableUse** text. Neither license document is patched.

## Considered options

- Keep MIT and warn in the README — MIT grants the right to sell copies
- Whole-repo CC BY-NC-SA 4.0 — CC is not a software license; it does not stop a
  free CompetingProduct; it cannot license publisher dumps
- PolyForm Noncommercial on code — broader than needed (bans any commercial
  use of the tool, not just competing with the licensor)
- PolyForm Shield on code + CC BY-NC-SA on docs + separate AcceptableUse
  (chosen)

## Consequences

- Relicensing applies to this author's work going forward; MIT copies already
  obtained are not clawed back
- GitHub license detection may show one SPDX identifier; README must state the
  split explicitly
- Game binaries and dumps stay unlicensed and out of git; they are not placed
  under Shield or CC

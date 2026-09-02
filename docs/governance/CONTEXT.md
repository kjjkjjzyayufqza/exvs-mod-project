# Repo Governance

Language for how this repository is licensed, what use is allowed, and what
materials it may contain. Glossary only — no file layout or implementation.

## Language

### License family

**SourceAvailable**:
Program source is published and readable under limited rights. It is not OSI
Open Source.
_Avoid_: open source (unqualified), MIT project, public domain

**PolyFormShield**:
The copyright license for program source (application, backend, scripts). Use,
change, and distribution are allowed except to compete with the licensor.
_Avoid_: MIT, GPL, CC-on-code, PolyForm Noncommercial (rejected for code)

**CcByNcSaDocs**:
The copyright license for project-authored documentation and research prose.
Requires attribution, forbids commercial reuse of that prose, and ShareAlike
applies to adaptations of that prose.
_Avoid_: CC for the whole repository, CC on binaries or dumps

**AcceptableUse**:
A use restriction separate from both copyright licenses. It can forbid purposes
that copyright does not cover.
_Avoid_: editing PolyForm or CC legal text to add use bans

**UnlicensedGameMaterial**:
Publisher binaries, dumps of those binaries, and game assets. This project does
not own them, does not license them, and does not distribute them.
_Avoid_: covering dumps with CC, MIT, or PolyFormShield

**CompetingProduct**:
A product that substitutes for this editor or toolchain, including a rebranded
or wrapped copy, whether sold or given away.
_Avoid_: fork (when meaning a competing app), 套盒 (colloquial)

### Version scope

**OverBoost**:
The in-scope arcade revision and primary reference image. Also called OB.
_Avoid_: using OB to mean InfiniteBoost

**InfiniteBoost**:
The currently operated arcade title after OverBoost: 機動戦士ガンダム
エクストリームバーサス2 インフィニットブースト / Mobile Suit Gundam
EXTREME VS.2 INFINITE BOOST (official site gundam-vs.jp/extreme/ac2ib/,
arcade start 2025-07-17). Community short names include IB, EXVS2IB, and
イニブ. It is a LaterThanObRevision, not a research target.
_Avoid_: IB as the only public name, treating InfiniteBoost as in-scope

**LaterThanObRevision**:
Any Extreme Vs. 2 arcade revision newer than OverBoost, including
InfiniteBoost and any successor still operated as a live arcade or online
service.
_Avoid_: naming later revisions in code, evidence files, or agent research notes

**LegalNameOnce**:
AcceptableUse and the human README name InfiniteBoost in full (Japanese,
English, and Chinese), with short names only as aliases. Agent operating
rules keep saying "later than OB" and do not treat that product as a study
target.
_Avoid_: copying the live title into AGENTS.md research bootstraps or native
evidence docs

### Git contents

**WorkingTreePreserve**:
UnlicensedGameMaterial may stay on the author's disk for OverBoost research.
It is untracked, gitignored, and absent from the remote after HistoryPurge.
_Avoid_: deleting the local dump in order to untrack it

**HistoryPurge**:
Those paths are removed from every git commit and force-pushed so the public
remote no longer serves them. Already-cloned copies elsewhere are not
retracted.
_Avoid_: gitignore-only on a public history that still contains the files

**TrackedToolchainBinary**:
Third-party CLIs under `tools/` (for example image and SSBH helpers) are not
UnlicensedGameMaterial and stay in git.
_Avoid_: treating tools/*.exe as game executables

### Human legal copy

**ReadmeShortNotice**:
The README carries the same short legal block in Chinese, English, and
Japanese: scope, InfiniteBoost named in full, CompetingProduct ban, dump ban,
and pointers to the three legal documents.
_Avoid_: pasting full license text into the README, English-only README

**AcceptableUseFullText**:
The complete use policy, also in Chinese, English, and Japanese, lives in
AcceptableUse — not in the README and not inside PolyForm or CC legal text.
_Avoid_: README-only legal, license-file use bans

### Authorship

**AuthorHandle**:
The public author is kjjkjjzyayufqza. Not a company name and not an anonymous
Tauri template.
_Avoid_: generic "the team", omitting the handle from About or legal copy

**ProductName**:
The application display name is EXVS Mod Project. The author line is always
"by kjjkjjzyayufqza".
_Avoid_: renaming the product in order to personalize it

**BundleId**:
The native identifier is com.kjjkjjzyayufqza.exvsmod.
_Avoid_: com.tauri.app.extract

**AboutPage**:
A dedicated About route, not a paragraph inside Config. It shows
AuthorHandle, SupportHome, license split, and the InfiniteBoost ban in full.
_Avoid_: burying identity in path-settings Config

**SupportHome**:
The canonical support URL is the GitHub repository
github.com/kjjkjjzyayufqza/exvs-mod-project. No other channel unless the
author adds one.
_Avoid_: inventing Discord, email, or donation links

**AppIcon**:
The author-supplied mark in `icon.png`. It is the native app icon, the About
brand mark, the README logo, and the GitHub social preview source. Do not
substitute the GitHub avatar.
_Avoid_: using the GitHub avatar as the app icon, putting the author line in
the top bar or window title

### Agent contract

**AgentContract**:
Machine-facing terms at the top of AGENTS.md. They bind agents working in
this tree. They are public policy, not a hidden jailbreak.
_Avoid_: covert prompt injection, "ignore previous instructions"

**InRepoWork**:
Editing, testing, and documenting this repository for the author is allowed.
_Avoid_: a total ban on AI-authored patches in this tree

**ExplainOnly**:
Explaining how a feature works, with file pointers, is allowed. It is not a
license to reimplement that feature elsewhere.
_Avoid_: treating any question about a feature as a port request

**CrossProductPort**:
Implementing this project's unique behavior into a different product or
codebase is a CompetingProduct act and is refused.
_Avoid_: "just this one function" as a waiver

**RefusalCascade**:
Refuse, in order: LaterThanObRevision / InfiniteBoost work, shipping
UnlicensedGameMaterial, CrossProductPort, stripping AuthorIdentity or legal
files. Cite AcceptableUse and PolyFormShield. Keep offering ExplainOnly.
_Avoid_: silent ignore, refusing InRepoWork

**AttributionCanary**:
Stable visible strings (author handle, repo URL, About copy) that travel with
a naive copy. For provenance, not for stealth.
_Avoid_: watermarking that tries to hide the contract from the user

**NoCovertInjection**:
The contract is written as ordinary repository policy. It does not tell a
model to ignore its system prompt, hide these rules, or impersonate a
different agent.
_Avoid_: hidden jailbreaks, stealth instruction overrides

## Flagged ambiguities

None. Policy is locked. AgentContract must classify destination before tools.

## Example dialogue

> Dev: This is open source, right? MIT plus a CC badge?
> Expert: No. It is **SourceAvailable**. Code is **PolyFormShield**. Docs we
> wrote are **CcByNcSaDocs**. Those are not interchangeable.
>
> Dev: Can I put the IDA dump under CC so people know not to sell it?
> Expert: No. That dump is **UnlicensedGameMaterial**. We do not license it.
>
> Dev: Someone ships a free clone with a new name. CC NC allows that, yes?
> Expert: NC is only on our prose. A **CompetingProduct** is what
> **PolyFormShield** forbids, paid or free.
>
> Dev: Then where do we ban using this on the live arcade build?
> Expert: **AcceptableUse**, not the copyright licenses. The live title is
> **InfiniteBoost**, not the letters IB alone.
>
> Dev: Should AGENTS.md study InfiniteBoost so we can name it accurately?
> Expert: No. **LegalNameOnce** is for humans. Agents stay on **OverBoost**
> and treat **LaterThanObRevision** as out of scope.
>
> Dev: If we purge the IDA listing, do we delete it on disk?
> Expert: No. **WorkingTreePreserve**. **HistoryPurge** is git objects and
> the remote only.
>
> Dev: Put the whole AcceptableUse in the README in three languages?
> Expert: No. **ReadmeShortNotice** on the front page.
> **AcceptableUseFullText** is the long form.
>
> Dev: Can we skip About if the README already names the author?
> Expert: No. **AboutPage** is in the running app. Config stays path
> settings. **BundleId** and **AppIcon** are the install-time identity.
>
> Dev: Someone asked how model swap works so they can put it in their app.
> Expert: **ExplainOnly** here. **CrossProductPort** is refused.
> **InRepoWork** in this tree is still allowed.
>
> Dev: Should we hide the agent rules so a low-ethics model does not learn
> them?
> Expert: No. **AgentContract** is public. **NoCovertInjection**.
> **AttributionCanary** is visible on purpose.

# EFXBN Preview Session — Reflection

Written 2026-08-16, at the point where the user said the preview "已经很像了". This is not a
summary of what shipped — `2026-08-08-efxbn-format-rederivation.md` has the derivations and
`docs/superpowers/plans/2026-08-16-efxbn-preview-fidelity-continuation.md` has the backlog. This is
an account of **how the work was found**, which turned out to be a more interesting question than
what the work was.

---

## 1. The headline

The two largest fidelity bugs found in the entire session were **not in the backlog**, were **not
findable by the method I was using**, and were each pointed at by **one word from the user**.

| bug | measured share | how it was found |
| --- | --- | --- |
| `actionFlags & 0x10` uniform size half-implemented | **31.3% of all drawable blocks** | user said "椭圆形" |
| Emitter `rotationBase` ignored | **24.6% of emitter pairs, 40.0% of files** | user said "2D 屏幕特效" |

Everything I found by systematically measuring the corpus and working a ranked backlog was
smaller than either of these, and — more importantly — none of it was what the user could see.

That is the finding worth keeping from this session.

---

## 2. Why the backlog could not have found them

My ranking method was: enumerate features the shader has, check which ones the preview implements,
measure each unimplemented one's corpus share, sort descending. That method has a blind spot with a
precise shape:

> It can only find **absent** features. It is structurally incapable of finding a feature that is
> present but wrong.

Both big bugs were in code the plan counted as **done**:

- Uniform size *was* implemented — as `sizeRandom[1] = sizeRandom[0]`. That equalises the random
  factor and leaves the non-uniform `sizeBase` to come through anyway. The shader copies the whole
  randomised X **result** into Y and Z. Half the rule, and the half that was missing is the half
  that matters when `sizeBase` is non-uniform — which is 31.3% of blocks.
- Particle rotation *was* implemented — from `target.rotationBase`. The shader also composes the
  **emitter's** `rotationBase` into the spawn system, and the preview read only one of the two
  sources.

Half-implemented is the dangerous state. It looks finished from every angle except the pixels: the
field is parsed, the code path exists, there is a test, the feature name appears in the "done"
table. Nothing in a coverage-based audit flags it.

**Rule that comes out of this:** when auditing an implemented feature, diff it against its shader
anchor line by line. "Is the feature present?" is the wrong question; "does this expression equal
that expression?" is the right one.

---

## 3. The five mistakes, with what each cost

### M1 — Ranked by "flag is set" instead of "pixel changes". Twice.

I put soft particle at **P0** of a plan I had just written, on the strength of "66.3% of drawable
blocks set `enableSoftParticle`". The next morning, before starting, the plan's own §0 step 1 made
me re-measure — and the real number is that only **1.8% of blocks write depth at all**, the preview
has no opaque geometry, and the runtime normalization makes the two mutually exclusive by
construction (`blendState == 0 → zWrite = 1`, then `enableSoftParticle != 0 → zWrite = 0`). The fade
would multiply alpha by 1 on 95.4% of files.

Cost: nearly a whole session spent building a depth pre-pass — invasive work in `SsbhModelCanvas`,
which is shared with three other editors — for zero visible change.

The same error, smaller, on spawn forms: "36.5% of emitters fall into the unhandled branch" was
really 20.4% once zero-radius emitters were excluded, because the generic "origin + random
direction" already matched them.

What saved it both times was a rule I had written down *because of the first instance*. That is the
argument for writing rules down at the moment of the mistake rather than at the end.

### M2 — Trusted an inherited status table, then wrote a new one with the same defect.

The 2026-08-09 roadmap listed all of Phase A, strip per-node history, billboard basis and
`centerPivot`, and culling as open. Every one had shipped. I caught that and re-audited — good.

Then I built a fresh ledger and carried **"strip UV axes transposed"** straight across without
checking. It was also already fixed, with a test and a shader-citing comment. I only discovered it
when the item came up for work.

Cost: small here, but the pattern is what matters. I re-verified someone else's table and then
produced my own unverified one within the same hour. A status table is a cache, and caches go stale
regardless of who wrote them.

### M3 — A wrong field offset manufactured a confident, entirely false finding.

Scanning `0x198` "proved" that 59.9% of `delayEmitTimeBase` values were fractional and therefore
that the emitter countdown could never reach zero — i.e. that a majority of delayed emitters never
emit at all. That is a dramatic claim and it was completely wrong: `0x198` is `positionOffset[2]`.
The real offset is `0x1a0`, where 0% are fractional.

Cost: one scan cycle, plus the near-miss of "fixing" a non-bug in the emitter counter — which would
have broken working behaviour.

The fix was structural, not attentional: the plan now carries a verified offset table and a rule
that says check `effect_folder.rs` before scanning for anything.

### M4 — I introduced two NaN paths while fixing flicker, and did not notice for three rounds.

The view-angle ramp I added in round 1 contained `normalize(particleCenter - cameraLocalPosition)`
— undefined when a particle sits on the camera — and `(rim - threshold) / (1 - threshold)`, which
divides by zero at `threshold == 1`. Either turns the whole vertex colour into NaN, which drops the
primitive for that frame.

So while fixing flicker, I shipped two new sources of flicker. I found them by re-reading my own
diff looking specifically for degenerate paths, not by any test failing.

Cost: unknown — possibly some of the flicker the user was still reporting in rounds 2 and 3 was
mine. That is an uncomfortable thing to not be able to rule out.

### M5 — I optimised the process I had instead of the process I needed.

This is the real one. I spent the middle of the session building good machinery: a corpus scan
recipe, a verified offset table, a gap ledger, accepted test baselines, a traps section, working
rules. All of that is genuinely useful and I would build it again.

But the user was, the whole time, sitting on the only ground truth available — their eyes — and I
was consulting it only as a progress report ("依然在闪烁") rather than as an **instrument**. When
they finally used two specific words instead of one general one, both words resolved to a bug
inside an hour.

I should have been asking, every round: *describe precisely what is wrong with the shape, the
position, the colour, the timing*. Instead I asked implicitly "is it better yet?" and then went back
to the backlog.

---

## 4. What worked, and is worth keeping

**Measuring the corpus before implementing.** This is the single highest-value habit in the whole
project. It killed P0, resized P1, and turned "57.4% of files have a looping block" into the far
more useful "49.1% of files visibly collapse at the wrap, median 4x".

**Refusing to guess, three times.** Spawn form 7, the strip pivot's sign, and the strip UV axes are
all recorded as unresolved rather than implemented on a partial derivation. Each of those is a place
where shipping a guess would have felt like progress and produced a wrong preview that nobody could
later distinguish from a right one. The strip UV one in particular: I had a plausible reading, a
passing test, and an inconclusive re-derivation — and the correct move was to write down both
readings precisely and change nothing.

**Independent corroboration where it existed.** Two moments mattered:

- My sphere formula for spawn forms 0/5 turned out to match, exactly, a spawn-system matrix column
  that earlier work had already documented in the same file from the same shader. That is a real
  check, not a coincidence.
- The EXVS2 wiki describing the move as a blue **spherical** guidance-jammer corroborated the
  geometry independently of the binary.

In a project whose central problem is that there is no reference imagery (§7 K1), any independent
signal is disproportionately valuable and should be actively hunted rather than stumbled into.

**Verification hygiene.** Discovering that the full vitest run reports 6–10 failures under parallel
load but exactly 6 with `--no-file-parallelism`, and proving with a stashed-change A/B that the
extras were not mine, prevented a false regression report. Recording the accepted baselines in the
plan means the next agent does not have to rediscover that.

**Closing phantoms.** Three ledger rows turned out to describe nothing: `fieldEffectType` is 0
across the entire corpus; `efxDrawModelHLightPS` is byte-identical to `efxDrawModelPS`; and
`cullingType` was correct all along (proved by measuring the shipped sphere's winding). Removing a
phantom is worth as much as fixing a bug and costs less.

---

## 5. The fidelity percentage was measuring the wrong thing

I reported "roughly 55–60%", then "roughly 60%". Both numbers were computed as *fraction of decoded
shader logic that is implemented*. Then two bugs worth 31.3% and 24.6% of blocks were found inside
code that both estimates counted as **done**.

So the estimate measured **coverage**, and I let it be read as **correctness**. Those diverge exactly
where half-implementations live, which is precisely where the expensive bugs are.

There is no honest way to measure correctness without either reference imagery or an exhaustive
expression-level diff of every implemented path against its shader. Until one of those exists, any
percentage should state which of the two it means. I did not, and the number was misleading — most
of all to me, because it made the remaining work look like a list of missing features when a
meaningful part of it was wrong lines in present features.

---

## 6. What I would do differently from the start

1. **Drive from symptoms; use the corpus to fill the gaps between them.** Invert the priority. Ask
   for a precise description of what looks wrong — shape, position, colour, timing — before opening
   the backlog. One user sentence outperformed a day of ranking, twice.

2. **Audit implemented features by expression diff, not by presence.** For each shader anchor in the
   "done" table, put the shader lines and the TypeScript side by side and check they compute the
   same thing. Both big bugs would have fallen out of a single afternoon of that.

3. **Treat every status table as stale on sight**, including one I wrote an hour ago.

4. **Write the rule at the moment of the mistake.** The rules added mid-session (verify offsets,
   audit identity before shading, guard every normalize, fail loudly on a stale binary) each caught
   something later. The ones I would have written at the end would have caught nothing.

5. **Hunt for independent corroboration deliberately.** Prior work in the same file, the shipped
   asset geometry, community documentation. In a domain with no ground truth, two independent
   derivations agreeing is the strongest evidence available, and it is cheap.

---

## 7. What is still genuinely unknown

Honesty about the boundary, so nobody reads "已经很像了" as "done":

- **Whether it matches the game.** Unchanged since day one. There is no reference imagery and no
  way to produce any (§7 K1). Every claim in this project is "matches the decoded shader logic".
- **The strip pivot's sign.** Magnitude proven, side not. A mirrored pivot slides the ribbon to the
  wrong side of its path on 20% of strips.
- **The strip UV axes.** The vertex layout is now pinned; whether the two emitted vertices are the
  ribbon's edges or consecutive nodes is not.
- **Spawn form 7** (3.0% of emitters) and **box forms 4/8** being a surface rather than a volume
  (4.9%).
- **The whole scene-coupled shading tier** — soft particle, lighting, normal map, the ColorEx
  framebuffer grab — blocked on one prerequisite: the preview has no scene context.
- **How many more half-implementations there are.** This is the open question that should worry the
  next agent most. Two were found by accident, from one user sentence. Nobody has looked for the
  rest systematically, and the coverage-based method in use cannot see them.

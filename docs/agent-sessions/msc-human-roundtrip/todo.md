# MSC Human Readable C Rewrite

## Current Task

- Continue development under `E:\research\msc_reserch\msc_human_rewrite`.
- Keep all new code under `E:\research\msc_reserch`.
- Shift the primary deliverable to IDA/game-exe grounded, jam1garner-style readable C.
- Treat JSON IR, `mscsrc`, and VM/offset-oriented text as internal or historical implementation details, not as product endpoints.
- Use TDD: write failing verification first, then implement the smallest behavior that satisfies it.

## Task List

1. [x] Re-read `AGENTS.md`.
2. [x] Re-read `.cursor/rules/custom-rules.mdc`.
3. [x] Read `task.md` and extract current requirements.
4. [x] Read relevant MSC/native-truth docs from `docs/`.
5. [x] Confirm the external rewrite project exists at `E:\research\msc_reserch\msc_human_rewrite`.
6. [x] Confirm CodeGraph is not initialized for the external rewrite project.
7. [x] Record this direction change in `process.md`.
8. [x] Run current baseline tests in `E:\research\msc_reserch\msc_human_rewrite`.
9. [x] Inspect reusable boundaries in `ir.py`, `semantics.py`, `stack_analysis.py`, `function_model.py`, and `flow_text.py`.
10. [x] Add tests for readable C file headers with `domain` and `evidence` comments.
11. [x] Add tests for function declarations named `fn_XXXXXXXX`.
12. [x] Add tests for IDA-grounded native API names on proven handler/subcommand calls.
13. [x] Add tests that unresolved native calls render as `native_call_unresolved(domain, handler_id, subcmd, ...)`.
14. [x] Add tests that output avoids global `sys_XX` names as the primary readable API.
15. [x] Add tests for conservative CFG fallback labels or gotos when structure is not proven.
16. [x] Create `src/exvs2_msc/c_decompile.py`.
17. [x] Reuse existing ground-truth domain inheritance when resolving native calls.
18. [x] Reuse existing CFG stack analysis to render call arguments.
19. [x] Implement C expression rendering for literals, variables, nested native results, function results, expressions, phi values, and unknowns.
20. [x] Implement native call rendering with semantic name, evidence comments, and unresolved fallback.
21. [x] Implement basic function-body rendering grouped by function boundaries.
22. [x] Add a `c-decompile` CLI command.
23. [x] Update README and internal docs to mark `mscsrc` as non-product/internal.
24. [x] Run focused new tests.
25. [x] Run `python -m unittest discover -s tests`.
26. [x] Run `python -m compileall -q src tests`.
27. [x] Run `c-decompile` against at least one real EXVS2 MSC sample.
28. [x] Compare readable C shape against `E:\TAURI_PROJECT\tools\mscdec.py` output without copying its architecture or global syscall semantics.
29. [x] Record verification results and next actions in `process.md`.

## Current Priority

Start with the smallest vertical slice: one real MSC input should produce readable C functions with domain/evidence comments, IDA-grounded native names where proven, and explicit unresolved native calls where not proven.

## Remaining Next Actions

1. [x] Reduce noisy VM offset comments in `c-decompile` while preserving enough evidence for review.
2. [x] Replace conservative condition placeholders with recovered stack expressions for branch predicates.
3. [ ] Structure simple `if`/`else` regions when CFG dominance/post-dominance proves the shape.
4. [ ] Structure obvious loops when back edges and loop exits are unambiguous.
5. [ ] Promote proven callback/function-pointer arguments to `fn_XXXXXXXX` only when the native API evidence proves function-pointer meaning.
6. [ ] Extend ground truth for additional `sys_4B`, `sys_47`, `sys_53`, and `sys_54` subcommands.
7. [ ] Add C output snapshot tests for a smaller fixture to keep formatting regressions readable.
8. [x] Add all-corpus smoke coverage for `c-decompile` once output size and runtime are acceptable.
9. [ ] Add a documented profile boundary for future executable revisions.
10. [ ] Document a side-by-side example showing old global `sys_XX` output versus new domain-grounded C.

## 100-Item Repeated TDD Backlog

The goal of this list is repeated, test-backed pressure on the same pipeline
from different evidence angles. Do not treat these as tiny fake subtasks. Each
item means: write or run the failing/guard test first, make the smallest aligned
change, then rerun the narrow check.

1. [x] TDD decode/C-export smoke for `0x04AD9F33/0.bscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
2. [x] TDD decode/C-export smoke for `0x04AD9F33/1.cscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
3. [x] TDD decode/C-export smoke for `0x04AD9F33/2.dscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
4. [x] TDD decode/C-export smoke for `0x693F756D/0.bscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
5. [x] TDD decode/C-export smoke for `0x693F756D/1.cscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
6. [x] TDD decode/C-export smoke for `0x693F756D/2.dscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
7. [x] TDD decode/C-export smoke for `0xBDBE6FEA_test/0.bscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
8. [x] TDD decode/C-export smoke for `0xBDBE6FEA_test/1.cscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
9. [x] TDD decode/C-export smoke for `0xBDBE6FEA_test/2.dscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
10. [x] TDD decode/C-export smoke for `0xBDBE6FEA/0.bscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
11. [x] TDD decode/C-export smoke for `0xBDBE6FEA/1.cscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
12. [x] TDD decode/C-export smoke for `0xBDBE6FEA/2.dscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
13. [x] TDD decode/C-export smoke for `0xE20B4862/0.bscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
14. [x] TDD decode/C-export smoke for `0xE20B4862/0.native_truth.bscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
15. [x] TDD decode/C-export smoke for `0xE20B4862/1.cscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
16. [x] TDD decode/C-export smoke for `0xE20B4862/2.dscex`: assert `c-decompile` emits domain, evidence, and at least one `fn_`.
17. [x] Repeat TDD legacy `mscdec.py` decode for `0x04AD9F33/0.bscex`: capture success/failure and output path.
18. [x] Repeat TDD legacy `mscdec.py` decode for `0x04AD9F33/1.cscex`: capture success/failure and output path.
19. [x] Repeat TDD legacy `mscdec.py` decode for `0x04AD9F33/2.dscex`: capture success/failure and output path.
20. [x] Repeat TDD legacy `mscdec.py` decode for `0x693F756D/0.bscex`: capture success/failure and output path.
21. [x] Repeat TDD legacy `mscdec.py` decode for `0x693F756D/1.cscex`: capture success/failure and output path.
22. [x] Repeat TDD legacy `mscdec.py` decode for `0x693F756D/2.dscex`: capture success/failure and output path.
23. [x] Repeat TDD legacy `mscdec.py` decode for `0xBDBE6FEA_test/0.bscex`: capture success/failure and output path.
24. [x] Repeat TDD legacy `mscdec.py` decode for `0xBDBE6FEA_test/1.cscex`: capture success/failure and output path.
25. [x] Repeat TDD legacy `mscdec.py` decode for `0xBDBE6FEA_test/2.dscex`: capture success/failure and output path.
26. [x] Repeat TDD legacy `mscdec.py` decode for `0xBDBE6FEA/0.bscex`: capture success/failure and output path.
27. [x] Repeat TDD legacy `mscdec.py` decode for `0xBDBE6FEA/1.cscex`: capture success/failure and output path.
28. [x] Repeat TDD legacy `mscdec.py` decode for `0xBDBE6FEA/2.dscex`: capture success/failure and output path.
29. [x] Repeat TDD legacy `mscdec.py` decode for `0xE20B4862/0.bscex`: capture success/failure and output path.
30. [x] Repeat TDD legacy `mscdec.py` decode for `0xE20B4862/0.native_truth.bscex`: capture success/failure and output path.
31. [x] Repeat TDD legacy `mscdec.py` decode for `0xE20B4862/1.cscex`: capture success/failure and output path.
32. [x] Repeat TDD legacy `mscdec.py` decode for `0xE20B4862/2.dscex`: capture success/failure and output path.
33. [ ] Repeat TDD shape comparison for `0x04AD9F33/0.bscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
34. [ ] Repeat TDD shape comparison for `0x04AD9F33/1.cscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
35. [ ] Repeat TDD shape comparison for `0x04AD9F33/2.dscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
36. [ ] Repeat TDD shape comparison for `0x693F756D/0.bscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
37. [ ] Repeat TDD shape comparison for `0x693F756D/1.cscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
38. [ ] Repeat TDD shape comparison for `0x693F756D/2.dscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
39. [ ] Repeat TDD shape comparison for `0xBDBE6FEA_test/0.bscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
40. [ ] Repeat TDD shape comparison for `0xBDBE6FEA_test/1.cscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
41. [ ] Repeat TDD shape comparison for `0xBDBE6FEA_test/2.dscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
42. [ ] Repeat TDD shape comparison for `0xBDBE6FEA/0.bscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
43. [ ] Repeat TDD shape comparison for `0xBDBE6FEA/1.cscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
44. [ ] Repeat TDD shape comparison for `0xBDBE6FEA/2.dscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
45. [ ] Repeat TDD shape comparison for `0xE20B4862/0.bscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
46. [ ] Repeat TDD shape comparison for `0xE20B4862/0.native_truth.bscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
47. [ ] Repeat TDD shape comparison for `0xE20B4862/1.cscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
48. [ ] Repeat TDD shape comparison for `0xE20B4862/2.dscex`: old output may use global `sys_XX`, new output must expose domain/evidence.
49. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0x04AD9F33/0.bscex`; record whether old roundtrip is possible.
50. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0x04AD9F33/1.cscex`; record whether old roundtrip is possible.
51. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0x04AD9F33/2.dscex`; record whether old roundtrip is possible.
52. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0x693F756D/0.bscex`; record whether old roundtrip is possible.
53. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0x693F756D/1.cscex`; record whether old roundtrip is possible.
54. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0x693F756D/2.dscex`; record whether old roundtrip is possible.
55. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0xBDBE6FEA_test/0.bscex`; record whether old roundtrip is possible.
56. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0xBDBE6FEA_test/1.cscex`; record whether old roundtrip is possible.
57. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0xBDBE6FEA_test/2.dscex`; record whether old roundtrip is possible.
58. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0xBDBE6FEA/0.bscex`; record whether old roundtrip is possible.
59. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0xBDBE6FEA/1.cscex`; record whether old roundtrip is possible.
60. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0xBDBE6FEA/2.dscex`; record whether old roundtrip is possible.
61. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0xE20B4862/0.bscex`; record whether old roundtrip is possible.
62. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0xE20B4862/0.native_truth.bscex`; record whether old roundtrip is possible.
63. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0xE20B4862/1.cscex`; record whether old roundtrip is possible.
64. [x] Repeat TDD `msclang.py` compile attempt for legacy C from `0xE20B4862/2.dscex`; record whether old roundtrip is possible.
65. [x] Repeat TDD byte-preserving decode/repack for `0x04AD9F33/0.bscex` using new JSON IR.
66. [x] Repeat TDD byte-preserving decode/repack for `0x04AD9F33/1.cscex` using new JSON IR.
67. [x] Repeat TDD byte-preserving decode/repack for `0x04AD9F33/2.dscex` using new JSON IR.
68. [x] Repeat TDD byte-preserving decode/repack for `0x693F756D/0.bscex` using new JSON IR.
69. [x] Repeat TDD byte-preserving decode/repack for `0x693F756D/1.cscex` using new JSON IR.
70. [x] Repeat TDD byte-preserving decode/repack for `0x693F756D/2.dscex` using new JSON IR.
71. [x] Repeat TDD byte-preserving decode/repack for `0xBDBE6FEA_test/0.bscex` using new JSON IR.
72. [x] Repeat TDD byte-preserving decode/repack for `0xBDBE6FEA_test/1.cscex` using new JSON IR.
73. [x] Repeat TDD byte-preserving decode/repack for `0xBDBE6FEA_test/2.dscex` using new JSON IR.
74. [x] Repeat TDD byte-preserving decode/repack for `0xBDBE6FEA/0.bscex` using new JSON IR.
75. [x] Repeat TDD byte-preserving decode/repack for `0xBDBE6FEA/1.cscex` using new JSON IR.
76. [x] Repeat TDD byte-preserving decode/repack for `0xBDBE6FEA/2.dscex` using new JSON IR.
77. [x] Repeat TDD byte-preserving decode/repack for `0xE20B4862/0.bscex` using new JSON IR.
78. [x] Repeat TDD byte-preserving decode/repack for `0xE20B4862/0.native_truth.bscex` using new JSON IR.
79. [x] Repeat TDD byte-preserving decode/repack for `0xE20B4862/1.cscex` using new JSON IR.
80. [x] Repeat TDD byte-preserving decode/repack for `0xE20B4862/2.dscex` using new JSON IR.
81. [x] TDD branch predicate recovery: add a failing assertion that `c-decompile` no longer emits `condition_00000041` for a simple behaviour branch.
82. [ ] TDD branch predicate recovery: add a failing assertion for a real depiction branch with a phi value.
83. [x] TDD assignment recovery: add a failing assertion that simple `setVar` renders `local/global = expression` instead of `last_result`.
84. [ ] TDD compound assignment recovery: add a failing assertion that `i+=` uses the recovered stack operand.
85. [ ] TDD call argument readability: add a failing assertion that direct function arguments preserve `fn_XXXXXXXX` only for proven call targets.
86. [ ] TDD unresolved native readability: repeat fallback tests for a base handler unresolved subcommand.
87. [ ] TDD unresolved native readability: repeat fallback tests for a derived handler unresolved subcommand.
88. [ ] TDD resolved native readability: repeat `sys_4B` semantic-name tests on at least two samples.
89. [ ] TDD resolved native readability: repeat `sys_47` semantic-name tests on at least two samples.
90. [ ] TDD resolved native readability: repeat `sys_4F` semantic-name tests on at least two samples.
91. [ ] TDD resolved native readability: repeat `sys_55` semantic-name tests on at least two samples.
92. [x] TDD noise reduction: assert non-consumer push comments can be hidden in default C output.
93. [x] TDD evidence retention: assert hidden push comments do not remove native evidence comments.
94. [ ] TDD CLI repeatability: run `c-decompile` twice on one sample and assert identical output.
95. [ ] TDD CLI JSON input path: decode to JSON, then `c-decompile` from JSON and compare to direct MSC input output.
96. [ ] TDD old/new report generation: create a local report summarizing old `sys_XX` lines versus new semantic lines.
97. [ ] TDD msclang diagnostics capture: ensure failed legacy compiles are recorded as expected evidence, not silent passes.
98. [x] TDD all-corpus c-decompile smoke: run all 16 samples with time and size accounting.
99. [x] TDD docs update: document repeated decode/repack harness commands and expected artifacts.
100. [x] TDD session handoff: update `process.md` after every repeated test batch with failures, fixes, and next restart point.

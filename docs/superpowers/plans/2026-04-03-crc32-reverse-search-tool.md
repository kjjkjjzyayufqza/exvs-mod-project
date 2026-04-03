# CRC32 Reverse Search Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python utility that searches for likely original strings behind target CRC32 values using layered heuristics, multi-process execution, and resumable search state.

**Architecture:** Add one standalone Python CLI under `tools/` plus one standard-library `unittest` test module under `tools/tests/`. The tool should search in layers: direct candidates, dictionary combinations, configurable templates, and controlled brute force, while supporting multiple target hashes, checkpointing, and CPU-parallel workers.

**Tech Stack:** Python 3 standard library (`argparse`, `binascii`, `concurrent.futures`, `itertools`, `json`, `pathlib`, `unittest`)

---

### Task 1: Define test coverage for the CRC32 search primitives

**Files:**
- Create: `tools/tests/test_crc32_reverse_search.py`
- Modify: none
- Test: `tools/tests/test_crc32_reverse_search.py`

- [ ] **Step 1: Write the failing test**

Cover:
- CRC32 normalization for hex and integer inputs
- Exact CRC32 calculation for candidate strings
- Candidate template expansion
- Target matching against known strings

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tools.tests.test_crc32_reverse_search -v`
Expected: FAIL because the target module does not exist yet

- [ ] **Step 3: Write minimal implementation**

Create the module and only the primitives needed by the tests.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tools.tests.test_crc32_reverse_search -v`
Expected: PASS

### Task 2: Implement the layered search engine

**Files:**
- Create: `tools/crc32_reverse_search.py`
- Modify: `tools/tests/test_crc32_reverse_search.py`
- Test: `tools/tests/test_crc32_reverse_search.py`

- [ ] **Step 1: Write the failing test**

Add tests for:
- dictionary combination generation
- first-match detection for one target
- multi-target matching in a single pass
- deterministic behavior for small search spaces

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tools.tests.test_crc32_reverse_search -v`
Expected: FAIL on missing search engine behavior

- [ ] **Step 3: Write minimal implementation**

Implement:
- layered candidate generation
- target CRC32 lookup
- resumable progress model
- worker-safe result collection

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tools.tests.test_crc32_reverse_search -v`
Expected: PASS

### Task 3: Implement the CLI and checkpoint/resume support

**Files:**
- Modify: `tools/crc32_reverse_search.py`
- Modify: `tools/tests/test_crc32_reverse_search.py`
- Test: `tools/tests/test_crc32_reverse_search.py`

- [ ] **Step 1: Write the failing test**

Add tests for:
- CLI argument parsing defaults
- parsing multiple hashes
- checkpoint serialization/deserialization

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tools.tests.test_crc32_reverse_search -v`
Expected: FAIL on CLI/checkpoint behavior

- [ ] **Step 3: Write minimal implementation**

Implement:
- `argparse` CLI
- `--targets`, `--workers`, `--checkpoint`, `--resume`, `--max-length`, `--charset`
- JSON checkpoint persistence

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tools.tests.test_crc32_reverse_search -v`
Expected: PASS

### Task 4: Add usage documentation

**Files:**
- Modify: `docs/exvs-msc-input-action-weapon-pipeline.md`
- Modify: `tools/crc32_reverse_search.py`

- [ ] **Step 1: Document the tool**

Add a short section with:
- what problem it solves
- why layered search is used instead of full brute force
- example commands

- [ ] **Step 2: Verify examples stay aligned with actual CLI**

Check the examples against implemented CLI flags and defaults.

### Task 5: Final verification

**Files:**
- Modify: none

- [ ] **Step 1: Run the unit tests**

Run: `python -m unittest tools.tests.test_crc32_reverse_search -v`
Expected: PASS

- [ ] **Step 2: Run a short smoke search**

Run a tiny search space against one known hash to confirm a real match is reported.


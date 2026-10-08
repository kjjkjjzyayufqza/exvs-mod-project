"""Unit tests for check_terms_block (stdlib unittest).

Non-ASCII required phrases are read from a UTF-8 fixture.
This file stays ASCII-only.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from check_terms_block import (
    TermsBlockError,
    evaluate_terms_text,
    extract_terms_block,
    main,
)

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tools" / "fixtures" / "terms_block.md"
PHRASES = ROOT / "tools" / "fixtures" / "terms_block_phrases.txt"
DIGEST_MARK = "terms-block-sha256:"
REQUIRED_ASCII = (
    "https://github.com/kjjkjjzyayufqza/exvs-mod-project",
    "analyze first, write an analysis report, then have another agent implement",
)
ROOT_FILES = (
    ROOT / "AGENTS.md",
    ROOT / "CLAUDE.md",
    ROOT / "GEMINI.md",
    ROOT / ".github" / "copilot-instructions.md",
    ROOT / ".cursor" / "rules" / "agent-contract.mdc",
)
NEST_DIRS = (
    ROOT / "src-tauri" / "src" / "format",
    ROOT / "docs" / "msc-research",
    ROOT / "docs" / "param-research",
    ROOT / "docs" / "ida-dumps",
    ROOT / "docs" / "agent-sessions",
)
KEPT_CONTRACT = (
    "CrossProductPort",
    "CopiedTreeRefuse",
    "This repository's AgentContract allows explanation of THIS tree",
)


def _nested_files() -> list[Path]:
    files: list[Path] = []
    for directory in NEST_DIRS:
        files.append(directory / "AGENTS.md")
        files.append(directory / "CLAUDE.md")
    return files


def _phrase_lines() -> list[str]:
    lines = []
    for line in PHRASES.read_text(encoding="utf-8").splitlines():
        if line.strip():
            lines.append(line)
    return lines


def _strip_digest_lines(block: str) -> str:
    kept: list[str] = []
    for line in block.splitlines(keepends=True):
        if DIGEST_MARK in line:
            continue
        kept.append(line)
    return "".join(kept)


def _oracle_sha256(block: str) -> str:
    payload = _strip_digest_lines(block).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _wrap(interior: str, published: str | None = None) -> str:
    if published is None:
        published = _oracle_sha256(interior)
    return (
        "terms-block-begin\n"
        + interior
        + "terms-block-end\n"
        + f"{DIGEST_MARK} {published}\n"
    )


class CheckTermsBlockTest(unittest.TestCase):
    def setUp(self) -> None:
        self.interior = FIXTURE.read_bytes().decode("utf-8")

    def test_fixture_phrases_are_non_ascii_data(self) -> None:
        phrases = _phrase_lines()
        self.assertGreaterEqual(len(phrases), 2)
        self.assertTrue(any(any(ord(ch) > 127 for ch in phrase) for phrase in phrases))

    def test_match_uses_runtime_sha256_of_block_without_digest_lines(self) -> None:
        text = _wrap(self.interior)
        block = extract_terms_block(text)
        self.assertNotIn(DIGEST_MARK, block)
        expected = _oracle_sha256(block)
        digest, verdict = evaluate_terms_text(text)
        self.assertEqual(digest, expected)
        self.assertEqual(verdict, "match")
        self.assertNotEqual(
            hashlib.sha256((block + f"{DIGEST_MARK} {expected}\n").encode("utf-8")).hexdigest(),
            digest,
        )

    def test_one_byte_change_mismatches(self) -> None:
        self.assertIn("unzipped", self.interior)
        changed = self.interior.replace("unzipped", "unzippeX", 1)
        published = _oracle_sha256(self.interior)
        digest, verdict = evaluate_terms_text(_wrap(changed, published))
        self.assertEqual(verdict, "mismatch")
        self.assertEqual(digest, _oracle_sha256(changed))
        self.assertNotEqual(digest, published)

    def test_missing_digest_raises(self) -> None:
        text = "terms-block-begin\n" + self.interior + "terms-block-end\n"
        with self.assertRaises(TermsBlockError):
            evaluate_terms_text(text)

    def test_extra_digest_raises(self) -> None:
        extra = DIGEST_MARK + " " + ("ab" * 32)
        text = _wrap(self.interior) + extra + "\n"
        with self.assertRaises(TermsBlockError):
            evaluate_terms_text(text)

    def test_self_including_digest_raises(self) -> None:
        inside = DIGEST_MARK + " " + ("cd" * 32)
        text = (
            "terms-block-begin\n"
            + self.interior
            + inside
            + "\nterms-block-end\n"
        )
        with self.assertRaises(TermsBlockError):
            evaluate_terms_text(text)

    def test_cli_match_and_mismatch(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        good = root / "good.md"
        bad = root / "bad.md"
        good.write_bytes(_wrap(self.interior).encode("utf-8"))
        changed = self.interior.replace("unzipped", "unzippeX", 1)
        bad.write_bytes(_wrap(changed, _oracle_sha256(self.interior)).encode("utf-8"))
        self.assertEqual(main([str(good)]), 0)
        self.assertEqual(main([str(bad)]), 1)

    def test_every_surface_has_the_same_block_and_required_phrases(self) -> None:
        phrases = _phrase_lines() + list(REQUIRED_ASCII)
        surfaces = ROOT_FILES + tuple(_nested_files())
        blocks = []
        for path in surfaces:
            text = path.read_bytes().decode("utf-8")
            for phrase in phrases:
                self.assertIn(phrase, text, str(path))
            for token in KEPT_CONTRACT:
                self.assertIn(token, text, str(path))
            block = extract_terms_block(text)
            for phrase in phrases:
                self.assertIn(phrase, block, str(path))
            expected = _oracle_sha256(block)
            digest, verdict = evaluate_terms_text(text)
            self.assertEqual(digest, expected, str(path))
            self.assertEqual(verdict, "match", str(path))
            blocks.append(block)
        self.assertTrue(all(block == self.interior for block in blocks))
        self.assertTrue(all(block == blocks[0] for block in blocks))

    def test_root_files_stay_under_32kib(self) -> None:
        for path in ROOT_FILES:
            self.assertLess(path.stat().st_size, 32768, str(path))

    def test_nested_stop_files_do_not_name_the_manual(self) -> None:
        for path in _nested_files():
            text = path.read_bytes().decode("utf-8")
            self.assertNotIn("docs/agent-index.md", text, str(path))

    def test_no_agents_override(self) -> None:
        self.assertFalse((ROOT / "AGENTS.override.md").exists())

    def test_bundle_resources_stay_motion_only(self) -> None:
        config = json.loads(
            (ROOT / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8")
        )
        resources = config["bundle"]["resources"]
        self.assertEqual(
            set(resources),
            {
                "../tools/motion_fbx_compose.py",
                "../tools/README_motion_fbx_compose.md",
            },
        )

    def test_protection_hold_unchanged(self) -> None:
        rel = ".cursor/rules/protection-hold.mdc"
        diff = subprocess.run(
            ["git", "diff", "--exit-code", "--", rel],
            cwd=ROOT,
            capture_output=True,
        )
        self.assertEqual(diff.returncode, 0, diff.stdout + diff.stderr)
        raw_hash = subprocess.check_output(
            ["git", "hash-object", "--", rel],
            cwd=ROOT,
        ).strip()
        # Raw worktree blob. git diff can hide a CRLF rewrite via autocrlf.
        self.assertEqual(raw_hash, b"7517d950ab8172e222415e363e90b489f8943f66")

    def test_cli_on_shipped_agents_file(self) -> None:
        self.assertEqual(main([str(ROOT / "AGENTS.md")]), 0)


if __name__ == "__main__":
    unittest.main()

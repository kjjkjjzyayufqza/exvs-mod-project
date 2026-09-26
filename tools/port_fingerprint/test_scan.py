"""Synthetic provenance scanner tests (ADR 0009 plan section 6)."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.port_fingerprint import strip_sim

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
SCAN = ROOT / "tools" / "port_fingerprint" / "scan.py"
EXTRACT = ROOT / "tools" / "port_fingerprint" / "extract_pools.py"

FIXTURE_MANIFEST = {
    "recipient": "synthetic",
    "rows": [
        {"hash": "0xa11ce001", "kind": 5, "name": "paper_lantern_bias", "class": "burned"},
        {"hash": "0xa11ce002", "kind": 1, "name": "paper_lantern_gate", "class": "burned"},
        {"hash": "0xa11ce003", "kind": 5, "name": "paper_lantern_span", "class": "trap"},
    ],
}


def run_scan(tree: Path, manifest: Path, threshold: int = 8) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(SCAN),
            "--manifest",
            str(manifest),
            "--tree",
            str(tree),
            "--threshold",
            str(threshold),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


class PortFingerprintScanTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.work = Path(self.temp_dir.name)
        self.manifest_path = self.work / "manifest.json"
        self.manifest_path.write_text(json.dumps(FIXTURE_MANIFEST, indent=2), encoding="utf-8")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_phase1_gitignore_boundary(self) -> None:
        result = subprocess.run(
            ["git", "check-ignore", "-v", "local/provenance/manifest.json"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("local/provenance", result.stdout)

    def test_suspect_keep_names_matches_at_threshold_two(self) -> None:
        proc = run_scan(FIXTURES / "suspect_keep_names", self.manifest_path, threshold=2)
        self.assertEqual(proc.returncode, 0)
        self.assertIn("MATCH", proc.stdout)

    def test_suspect_stripped_words_still_matches(self) -> None:
        source = self.work / "strip_input"
        source.mkdir()
        (source / "pool.rs").write_text(
            (FIXTURES / "public_pool.rs.txt").read_text(encoding="utf-8"),
            encoding="utf-8",
        )
        dest = self.work / "suspect_stripped_words"
        self.assertEqual(
            strip_sim.main([str(source), str(dest), "--drop-words"]),
            0,
        )
        proc = run_scan(dest, self.manifest_path, threshold=2)
        self.assertEqual(proc.returncode, 0)
        self.assertIn("MATCH", proc.stdout)

    def test_suspect_drop_unknown_hash_trap_absent_documents_bad_trap(self) -> None:
        source = FIXTURES / "suspect_keep_names"
        dest = self.work / "suspect_drop_unknown_hash"
        allow = self.work / "allow_two.txt"
        allow.write_text("0xa11ce001\n0xa11ce002\n", encoding="utf-8")
        self.assertEqual(
            strip_sim.main(
                [
                    str(source),
                    str(dest),
                    "--drop-unknown-hash",
                    str(allow),
                ]
            ),
            0,
        )
        text = (dest / "pool.rs").read_text(encoding="utf-8")
        self.assertNotIn("paper_lantern_span", text)
        proc = run_scan(dest, self.manifest_path, threshold=8)
        self.assertEqual(proc.returncode, 2)
        self.assertIn("NO_MATCH", proc.stdout)
        self.assertNotIn("paper_lantern_span", proc.stdout)

    def test_suspect_drop_unknown_hash_real_still_matches_trap(self) -> None:
        source = FIXTURES / "suspect_keep_names"
        dest = self.work / "suspect_drop_unknown_hash_real"
        allow = self.work / "allow_three.txt"
        allow.write_text("0xa11ce001\n0xa11ce002\n0xa11ce003\n", encoding="utf-8")
        self.assertEqual(
            strip_sim.main(
                [
                    str(source),
                    str(dest),
                    "--drop-unknown-hash",
                    str(allow),
                ]
            ),
            0,
        )
        proc = run_scan(dest, self.manifest_path, threshold=8)
        self.assertEqual(proc.returncode, 0)
        self.assertIn("MATCH", proc.stdout)

    def test_suspect_names_replaced_is_no_match(self) -> None:
        source = FIXTURES / "suspect_keep_names"
        dest = self.work / "suspect_names_replaced"
        self.assertEqual(
            strip_sim.main([str(source), str(dest), "--replace-names"]),
            0,
        )
        proc = run_scan(dest, self.manifest_path, threshold=2)
        self.assertEqual(proc.returncode, 2)
        self.assertIn("NO_MATCH", proc.stdout)

    def test_suspect_independent_is_no_match(self) -> None:
        proc = run_scan(FIXTURES / "suspect_independent", self.manifest_path, threshold=2)
        self.assertEqual(proc.returncode, 2)
        self.assertIn("NO_MATCH", proc.stdout)

    def test_scan_usage_error_exit_one(self) -> None:
        proc = subprocess.run(
            [sys.executable, str(SCAN)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 1)


if __name__ == "__main__":
    unittest.main()

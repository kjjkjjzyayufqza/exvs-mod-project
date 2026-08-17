import importlib.util
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools"
sys.path.insert(0, str(TOOLS))


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


registry_tool = load_module(
    "param_evidence_registry_tested", TOOLS / "param_evidence_registry.py"
)
checker = load_module(
    "check_param_name_evidence_tested", TOOLS / "check_param_name_evidence.py"
)


class ParamEvidenceToolTests(unittest.TestCase):
    def test_regrade_supersedes_initial_grade(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            folder = Path(temp_dir)
            (folder / "2026-01-01-speedparam-grade-a.md").write_text(
                "| hash | verdict |\n|---|---|\n| `0x12345678` | OPEN |\n",
                encoding="utf-8",
            )
            (folder / "2026-01-01-speedparam-regrade-a.md").write_text(
                "| hash | verdict |\n|---|---|\n| `0x12345678` | CONFIRM |\n",
                encoding="utf-8",
            )
            self.assertEqual(
                registry_tool.build_verdict_index(str(folder))["0x12345678"],
                "CONFIRM",
            )

    def test_registry_generator_refuses_missing_evidence_inputs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            missing = str(Path(temp_dir) / "missing")
            argv = [
                "param_evidence_registry.py",
                "--out",
                str(Path(temp_dir) / "registry.tsv"),
                "--verdicts",
                missing,
                "--crosscheck",
                missing,
                "--consumption",
                missing,
            ]
            with mock.patch.object(sys, "argv", argv), mock.patch.object(
                sys, "stderr", io.StringIO()
            ):
                self.assertEqual(registry_tool.main(), 2)

    def test_parse_rust_keeps_aliases_bound_to_their_hash(self):
        pool, aliases = checker.parse_rust(
            str(ROOT / "src-tauri" / "src" / "format" / "speedparam.rs"),
            "SPEEDPARAM_COMMAND_POOL",
            "SPEEDPARAM_LEGACY_KEY_ALIASES",
        )
        self.assertIn("boostRecoveryDelayFrame", aliases["0x0cf37ad7"])
        self.assertNotIn("boostRecoveryDelayFrame", aliases["0x7bf44a41"])
        self.assertIn("0x7bf44a41", pool)

    def test_annotation_does_not_bleed_from_the_next_entry(self):
        source = """\
const POOL: &[()] = &[
    (0x11111111, 2, "unresolved_a"),
    (0x22222222, 2, "unresolved_b"), // [D:1,2]
];
"""
        annotations = checker.collect_annotations(source)
        self.assertFalse(annotations["0x11111111"])
        self.assertTrue(annotations["0x22222222"])

    def test_registry_rows_match_pool_key_kind_and_known_grades(self):
        rows = checker.load_registry()
        allowed_grades = {"S", "B", "C", "R-fixed", "U"}
        for file_type, rust_path, pool_const, alias_const in checker.POOLS:
            pool, _aliases = checker.parse_rust(rust_path, pool_const, alias_const)
            for field_hash, (kind, key) in pool.items():
                row = rows[(file_type, field_hash)]
                self.assertEqual(row["canonical_key"], key)
                self.assertEqual(row["kind"], str(kind))
                self.assertIn(row["grade"], allowed_grades)


if __name__ == "__main__":
    unittest.main()

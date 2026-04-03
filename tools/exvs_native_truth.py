import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


class ExvsMappingError(Exception):
    pass


@dataclass
class ExvsCallRule:
    function: str
    arg_index: int
    kind: str
    decode_add: int = 0
    encode_add: int = 0
    min_value: int = 0
    max_value: Optional[int] = None
    anchor_function: Optional[str] = None
    anchor_baseline_offset: Optional[int] = None

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> "ExvsCallRule":
        return ExvsCallRule(
            function=data["function"],
            arg_index=int(data["arg_index"]),
            kind=data["kind"],
            decode_add=int(data.get("decode_add", 0)),
            encode_add=int(data.get("encode_add", 0)),
            min_value=int(data.get("min_value", 0)),
            max_value=(None if data.get("max_value") is None else int(data["max_value"])),
            anchor_function=data.get("anchor_function"),
            anchor_baseline_offset=(
                None if data.get("anchor_baseline_offset") is None else int(data["anchor_baseline_offset"])
            ),
        )

    def matches_value(self, value: int) -> bool:
        if value < self.min_value:
            return False
        if self.max_value is not None and value > self.max_value:
            return False
        return True


class ExvsNativeTruthMapping:
    def __init__(self, raw: Dict[str, Any]):
        self.raw = raw
        self.schema_version = int(raw.get("schema_version", 0))
        self.script_file_id = raw.get("script_file_id")
        self.functions_by_offset: Dict[int, str] = {}
        self.functions_by_symbol: Dict[str, Dict[str, Any]] = {}
        self._call_rules: List[ExvsCallRule] = []
        self._validate_and_index()

    @classmethod
    def from_path(cls, path: str) -> "ExvsNativeTruthMapping":
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return cls(data)

    def _validate_and_index(self) -> None:
        if self.schema_version != 1:
            raise ExvsMappingError(f"Unsupported EXVS mapping schema_version: {self.schema_version}")

        script_functions = self.raw.get("script_functions", [])
        for entry in script_functions:
            symbol = entry["symbol"]
            offset = int(entry["offset"])
            self.functions_by_offset[offset] = symbol
            self.functions_by_symbol[symbol] = entry

        for rule_raw in self.raw.get("opaque_function_refs", []):
            self._call_rules.append(ExvsCallRule.from_dict(rule_raw))

    def rules_for(self, function_name: str, arg_index: int) -> List[ExvsCallRule]:
        return [r for r in self._call_rules if r.function == function_name and r.arg_index == arg_index]

    def decode_symbol_from_value(self, rule: ExvsCallRule, value: int) -> Optional[str]:
        if not rule.matches_value(value):
            return None
        if rule.kind != "function_ref":
            return None
        decoded_offset = value + rule.decode_add
        return self.functions_by_offset.get(decoded_offset)

    def resolve_symbol_for_compile(
        self,
        symbol: str,
        refs_functions: List[str],
        script_positions: List[int],
        rule: ExvsCallRule,
    ) -> int:
        if symbol in refs_functions:
            base_offset = script_positions[refs_functions.index(symbol)]
        else:
            raise ExvsMappingError(
                f"Mapped symbol '{symbol}' does not exist in current function declarations"
            )
        return base_offset + rule.encode_add

    def relocate_constant_for_compile(
        self,
        raw_value: int,
        refs_functions: List[str],
        script_positions: List[int],
        rule: ExvsCallRule,
    ) -> int:
        if rule.kind != "script_delta":
            return raw_value

        if rule.anchor_function is None or rule.anchor_baseline_offset is None:
            raise ExvsMappingError("script_delta rule requires anchor_function and anchor_baseline_offset")
        if rule.anchor_function not in refs_functions:
            raise ExvsMappingError(
                f"Anchor function '{rule.anchor_function}' not found in compiled functions"
            )

        anchor_index = refs_functions.index(rule.anchor_function)
        current_anchor = script_positions[anchor_index]
        delta = current_anchor - rule.anchor_baseline_offset
        return raw_value + delta


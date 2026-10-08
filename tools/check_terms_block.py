"""SHA-256 check for the shared public terms block.

Hashed bytes are the lines between the begin and end markers.
The published digest line stays outside that block.
Missing, extra, or self-including digest input raises.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

BEGIN = "terms-block-begin"
END = "terms-block-end"
DIGEST_PREFIX = "terms-block-sha256:"


class TermsBlockError(ValueError):
    """The terms file does not have exactly one digest outside the block."""


def _lines(text: str) -> list[str]:
    return text.splitlines(keepends=True)


def _marker_indexes(lines: list[str], marker: str) -> list[int]:
    return [index for index, line in enumerate(lines) if line.strip() == marker]


def extract_terms_block(text: str) -> str:
    """Return the canonical block. Marker lines are not included."""
    lines = _lines(text)
    begins = _marker_indexes(lines, BEGIN)
    ends = _marker_indexes(lines, END)
    if len(begins) != 1 or len(ends) != 1:
        raise TermsBlockError("missing or extra block marker")
    begin_at = begins[0]
    end_at = ends[0]
    if end_at <= begin_at:
        raise TermsBlockError("block end before begin")
    block = "".join(lines[begin_at + 1 : end_at])
    if block.strip() == "":
        raise TermsBlockError("empty block")
    return block


def _digest_values(text: str) -> list[str]:
    values: list[str] = []
    for line in _lines(text):
        body = line.strip()
        if not body.startswith(DIGEST_PREFIX):
            continue
        hex_part = body[len(DIGEST_PREFIX) :].strip()
        if len(hex_part) != 64 or any(ch not in "0123456789abcdef" for ch in hex_part):
            raise TermsBlockError("malformed digest")
        if body != f"{DIGEST_PREFIX} {hex_part}":
            raise TermsBlockError("malformed digest")
        values.append(hex_part)
    return values


def evaluate_terms_text(text: str) -> tuple[str, str]:
    """Hash the canonical block and compare it to the published digest.

    Returns ``(lowercase_hex, "match"|"mismatch")``.
    """
    block = extract_terms_block(text)
    if _digest_values(block):
        raise TermsBlockError("self-including digest")
    published = _digest_values(text)
    if len(published) == 0:
        raise TermsBlockError("missing digest")
    if len(published) != 1:
        raise TermsBlockError("extra digest")
    digest = hashlib.sha256(block.encode("utf-8")).hexdigest()
    verdict = "match" if digest == published[0] else "mismatch"
    return digest, verdict


def read_terms_file(path: Path) -> str:
    """Read exact UTF-8 bytes. Newlines are not translated."""
    return path.read_bytes().decode("utf-8")


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) != 1:
        print("usage: check_terms_block.py PATH", file=sys.stderr)
        return 2
    try:
        digest, verdict = evaluate_terms_text(read_terms_file(Path(args[0])))
    except (OSError, UnicodeError, TermsBlockError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(f"sha256: {digest}")
    print(f"verdict: {verdict}")
    return 0 if verdict == "match" else 1


if __name__ == "__main__":
    sys.exit(main())

from argparse import ArgumentParser
from pathlib import Path


START_MARKER = "// AI decision"
ORIGIN_MARKER = "// Origin:"
END_MARKER = "// End, origin is"


def check_file(path: Path) -> list[str]:
    errors: list[str] = []
    in_block = False
    block_start = 0
    has_origin = False

    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        lines = path.read_text(encoding="utf-8-sig").splitlines()

    start_count = 0
    end_count = 0
    origin_count = 0

    for line_no, line in enumerate(lines, start=1):
        stripped = line.strip()
        if START_MARKER in stripped:
            start_count += 1
            if in_block:
                errors.append(
                    f"{path}:{line_no}: nested AI decision before closing block from line {block_start}"
                )
            in_block = True
            block_start = line_no
            has_origin = False

        if ORIGIN_MARKER in stripped:
            origin_count += 1
            if not in_block:
                errors.append(f"{path}:{line_no}: Origin marker outside AI block")
            has_origin = True

        if END_MARKER in stripped:
            end_count += 1
            if not in_block:
                errors.append(f"{path}:{line_no}: End marker without AI decision")
                continue
            if not has_origin:
                errors.append(f"{path}:{line_no}: AI block from line {block_start} has no Origin marker")
            in_block = False
            block_start = 0
            has_origin = False

    if in_block:
        errors.append(f"{path}:{block_start}: AI block is not closed")

    if start_count != end_count:
        errors.append(f"{path}: AI decision count {start_count} != End count {end_count}")
    if start_count != origin_count:
        errors.append(f"{path}: AI decision count {start_count} != Origin count {origin_count}")

    return errors


def main() -> int:
    parser = ArgumentParser(description="Check paired AI edit blocks in decompiled MSC C files.")
    parser.add_argument("files", nargs="+", type=Path)
    args = parser.parse_args()

    all_errors: list[str] = []
    for path in args.files:
        all_errors.extend(check_file(path))

    if all_errors:
        for error in all_errors:
            print(error)
        return 1

    print(f"OK: checked {len(args.files)} file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

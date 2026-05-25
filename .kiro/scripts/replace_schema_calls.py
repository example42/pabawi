#!/usr/bin/env python3
"""
Trim the local schema-init function from a test file and rewrite call sites
to use the shared helper.

Pass: file path, function name (initializeSchema | initializeRBACSchema |
initializeMinimalSchema). The script:
  1. Locates the function definition (first `async function <name>` line).
  2. Locates its closing brace (first `^}` line at column 0 after the def).
  3. Deletes the inclusive line range.
  4. Replaces all `await <name>(<arg>)` callsites with the canonical helper
     `await initializeTestSchema(<arg>)`.
  5. Adds an import for `initializeTestSchema` from the helpers path
     (relative path is derived from the depth under backend/test/).
"""
import re
import sys
from pathlib import Path


def helper_import_path(file_path: Path) -> str:
    """Compute relative path from a test file to backend/test/helpers/schema."""
    test_root = file_path.resolve().parent
    while test_root.name != "test" and test_root.parent != test_root:
        test_root = test_root.parent
    rel = Path(*[".."] * (len(file_path.resolve().relative_to(test_root).parts) - 1)) / "helpers" / "schema"
    return rel.as_posix()


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: replace_schema_calls.py <file> <fn-name>", file=sys.stderr)
        return 1

    path = Path(sys.argv[1])
    fn_name = sys.argv[2]
    src = path.read_text()
    lines = src.splitlines(keepends=True)

    start = None
    for i, line in enumerate(lines):
        if line.startswith(f"async function {fn_name}"):
            start = i
            break
    if start is None:
        print(f"function not found: {fn_name}")
        return 0

    end = None
    for j in range(start + 1, len(lines)):
        if lines[j].rstrip("\n").rstrip() == "}":
            end = j
            break
    if end is None:
        print("closing brace not found")
        return 1

    new_lines = lines[:start] + lines[end + 1:]

    # Rewrite call sites: any reference to the old function becomes
    # `initializeTestSchema`.
    new_src = "".join(new_lines)
    new_src = re.sub(
        rf"\b{fn_name}\(",
        "initializeTestSchema(",
        new_src,
    )

    # Insert import after the last existing import line.
    helper_rel = helper_import_path(path)
    import_line = f'import {{ initializeTestSchema }} from "{helper_rel}";\n'
    if "initializeTestSchema" in src:
        # already imported (rare); leave content as is (will still be valid).
        pass
    if 'from "../helpers/schema"' not in new_src and \
       "from '../../helpers/schema'" not in new_src and \
       'from "../../helpers/schema"' not in new_src and \
       'from "../../../helpers/schema"' not in new_src:
        last_import_idx = -1
        for i, line in enumerate(new_src.splitlines(keepends=True)):
            if line.startswith("import "):
                last_import_idx = i
        out_lines = new_src.splitlines(keepends=True)
        if last_import_idx >= 0:
            out_lines.insert(last_import_idx + 1, import_line)
            new_src = "".join(out_lines)

    path.write_text(new_src)
    print(f"updated: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

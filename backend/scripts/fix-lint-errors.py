#!/usr/bin/env python3
"""
Script to fix common TypeScript lint errors
"""
import re
import sys
from pathlib import Path

def fix_template_literals(content: str) -> str:
    """Fix template literal expressions with numbers"""
    # This is a simplified approach - wraps common patterns
    # Pattern: ${someVar.length} -> ${String(someVar.length)}
    patterns = [
        (r'\$\{([^}]+\.length)\}', r'${String(\1)}'),
        (r'\$\{(count|total|size|index|page|limit|offset)\}', r'${String(\1)}'),
    ]

    for pattern, replacement in patterns:
        content = re.sub(pattern, replacement, content)

    return content

def fix_nullish_coalescing(content: str) -> str:
    """Fix || to ?? where appropriate"""
    # This is context-sensitive, so we'll be conservative
    # Only fix obvious cases like: something || 0, something || ''
    patterns = [
        (r'(\w+)\s*\|\|\s*0\b', r'\1 ?? 0'),
        (r'(\w+)\s*\|\|\s*""', r'\1 ?? ""'),
        (r'(\w+)\s*\|\|\s*\'\'', r'\1 ?? \'\''),
    ]

    for pattern, replacement in patterns:
        content = re.sub(pattern, replacement, content)

    return content

def main():
    backend_src = Path('backend/src')

    if not backend_src.exists():
        print("Error: backend/src directory not found")
        sys.exit(1)

    # Find all TypeScript files
    ts_files = list(backend_src.rglob('*.ts'))

    print(f"Found {len(ts_files)} TypeScript files")
    print("Note: This script makes conservative fixes.")
    print("Manual review is still required for complex cases.\n")

    for ts_file in ts_files:
        try:
            content = ts_file.read_text()
            original = content

            # Apply fixes
            content = fix_template_literals(content)
            content = fix_nullish_coalescing(content)

            if content != original:
                print(f"Fixed: {ts_file.relative_to(backend_src.parent)}")
                # Uncomment to actually write changes:
                # ts_file.write_text(content)
        except Exception as e:
            print(f"Error processing {ts_file}: {e}")

if __name__ == '__main__':
    main()

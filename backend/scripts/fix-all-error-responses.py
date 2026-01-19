#!/usr/bin/env python3
"""
Fix all remaining error responses to attach debug info
"""

import re

def fix_error_responses(content):
    """Transform all res.status().json({ error: {...} }); to use errorResponse pattern"""

    # Pattern to match error responses with various formatting
    # This matches: res.status(XXX).json({ \n error: { \n ... \n } \n });
    pattern = r'res\.status\((\d+)\)\.json\(\{\s*error:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}\s*\}\);'

    def replacement(match):
        status_code = match.group(1)
        error_content = match.group(2).strip()

        # Clean up the error content - remove extra whitespace but preserve structure
        error_content = re.sub(r'\s+', ' ', error_content)
        error_content = error_content.replace(' ,', ',')

        return f'''const errorResponse = {{
          error: {{ {error_content} }}
        }};
        res.status({status_code}).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );'''

    return re.sub(pattern, replacement, content, flags=re.DOTALL)

def add_debug_to_early_returns(content):
    """Add debug info collection to early return errors (not configured, not initialized)"""

    # Pattern for "not configured" errors before try block
    pattern1 = r'(if \(!puppetserverService\) \{[^}]*logger\.warn[^}]*\})\s*res\.status'

    def add_debug_collection(match):
        condition = match.group(1)
        return f'''{condition}

        if (debugInfo) {{
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {{
            message: "Puppetserver integration is not configured",
            level: 'warn',
          }});
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }}

        res.status'''

    content = re.sub(pattern1, add_debug_collection, content)

    # Pattern for "not initialized" errors before try block
    pattern2 = r'(if \(!puppetserverService\.isInitialized\(\)\) \{[^}]*logger\.warn[^}]*\})\s*res\.status'

    def add_debug_collection2(match):
        condition = match.group(1)
        return f'''{condition}

        if (debugInfo) {{
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {{
            message: "Puppetserver integration is not initialized",
            level: 'warn',
          }});
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }}

        res.status'''

    content = re.sub(pattern2, add_debug_collection2, content)

    return content

def main():
    file_path = 'backend/src/routes/integrations/puppetserver.ts'

    with open(file_path, 'r') as f:
        content = f.read()

    # Fix all error responses
    content = fix_error_responses(content)

    # Add debug info to early returns
    content = add_debug_to_early_returns(content)

    with open(file_path, 'w') as f:
        f.write(content)

    print('✓ Fixed all error responses')

if __name__ == '__main__':
    main()

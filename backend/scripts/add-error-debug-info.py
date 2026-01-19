#!/usr/bin/env python3
"""
Add debug info attachment to all error responses in Puppetserver routes
"""

import re

def add_debug_to_catch_block(content):
    """Add debug info collection at the start of catch blocks"""

    # Pattern: } catch (error) { followed by const duration
    pattern = r'(\} catch \(error\) \{\s*const duration = Date\.now\(\) - startTime;)'

    replacement = r'''\1

        if (debugInfo) {
          debugInfo.duration = duration;
          expertModeService.addError(debugInfo, {
            message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }'''

    return re.sub(pattern, replacement, content)

def add_debug_to_error_responses(content):
    """Add debug info attachment to all error JSON responses"""

    # Pattern: res.status(XXX).json({ error: { ... } });
    # We need to wrap the error object and attach debug info
    pattern = r'res\.status\((\d+)\)\.json\(\{\s*error: \{([^}]+)\}\s*\}\);'

    def replacement(match):
        status_code = match.group(1)
        error_content = match.group(2)

        return f'''const errorResponse = {{
          error: {{{error_content}}}
        }};
        res.status({status_code}).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );'''

    return re.sub(pattern, replacement, content, flags=re.DOTALL)

def add_debug_to_early_returns(content):
    """Add debug info to early return error responses (before try block)"""

    # Pattern for early returns (not configured, not initialized)
    # These happen before the try block, so we need to add debug info collection there too
    pattern = r'(if \(!puppetserverService\) \{[^}]+logger\.warn[^}]+\})\s*(res\.status\(\d+\)\.json\(\{[^}]+\}\);)'

    def replacement(match):
        condition_block = match.group(1)
        response = match.group(2)

        # Extract status code and error object
        status_match = re.search(r'res\.status\((\d+)\)\.json\(\{([^}]+)\}\);', response)
        if status_match:
            status_code = status_match.group(1)
            error_content = status_match.group(2)

            return f'''{condition_block}

        if (debugInfo) {{
          debugInfo.duration = Date.now() - startTime;
          expertModeService.addWarning(debugInfo, {{
            message: "Puppetserver integration is not configured",
            level: 'warn',
          }});
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
        }}

        const errorResponse = {{
          {error_content}
        }};
        res.status({status_code}).json(
          debugInfo ? expertModeService.attachDebugInfo(errorResponse, debugInfo) : errorResponse
        );'''

        return match.group(0)  # Return unchanged if pattern doesn't match

    return re.sub(pattern, replacement, content, flags=re.DOTALL)

def main():
    file_path = 'backend/src/routes/integrations/puppetserver.ts'

    with open(file_path, 'r') as f:
        content = f.read()

    # Add debug info to catch blocks
    content = add_debug_to_catch_block(content)

    # Add debug info to error responses
    content = add_debug_to_error_responses(content)

    with open(file_path, 'w') as f:
        f.write(content)

    print('✓ Added debug info to error responses')

if __name__ == '__main__':
    main()

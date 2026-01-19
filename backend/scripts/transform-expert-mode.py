#!/usr/bin/env python3
"""
Transform Puppetserver routes to use proper expert mode pattern
"""

import re
import sys

def transform_handle_expert_mode_response(content):
    """Replace handleExpertModeResponse with full pattern"""
    # Pattern to match handleExpertModeResponse calls - more flexible
    pattern = r'handleExpertModeResponse\s*\(\s*req,\s*res,\s*responseData,\s*\'([^\']+)\',\s*duration,\s*\'([^\']+)\',\s*\{([^}]*)\}\s*\);'

    def replacement(match):
        operation = match.group(1)
        integration = match.group(2)
        metadata = match.group(3).strip()

        result = '''if (debugInfo) {
          debugInfo.duration = duration;'''

        if metadata:
            # Parse metadata key: value
            parts = metadata.split(':')
            if len(parts) == 2:
                key = parts[0].strip()
                value = parts[1].strip()
                result += f'''
          expertModeService.addMetadata(debugInfo, '{key}', {value});'''

        result += '''
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }'''

        return result

    return re.sub(pattern, replacement, content)

def main():
    file_path = 'backend/src/routes/integrations/puppetserver.ts'

    with open(file_path, 'r') as f:
        content = f.read()

    # Remove handleExpertModeResponse from imports
    content = re.sub(r'handleExpertModeResponse,\s*', '', content)

    # Add ExpertModeService import if not present
    if 'import { ExpertModeService }' not in content:
        content = content.replace(
            'from "./utils";',
            'from "./utils";\nimport { ExpertModeService } from "../../services/ExpertModeService";'
        )

    # Transform handleExpertModeResponse calls
    content = transform_handle_expert_mode_response(content)

    with open(file_path, 'w') as f:
        f.write(content)

    print('✓ Transformed Puppetserver routes')

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
Add expert mode initialization to all Puppetserver routes
"""

import re

def add_expert_mode_init(content):
    """Add expert mode initialization after startTime declaration"""

    # Pattern to find routes that don't have debugInfo yet
    # Look for "const startTime = Date.now();" NOT followed by "const expertModeService"
    pattern = r'(const startTime = Date\.now\(\);)\s*\n\s*\n\s*(logger\.info\()'

    replacement = r'''\1
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      // Create debug info once at the start if expert mode is enabled
      const debugInfo = req.expertMode
        ? expertModeService.createDebugInfo('OPERATION_PLACEHOLDER', requestId, 0)
        : null;

      if (debugInfo) {
        expertModeService.setIntegration(debugInfo, 'puppetserver');
      }

      \2'''

    return re.sub(pattern, replacement, content)

def fix_operation_names(content):
    """Fix operation placeholder names based on route context"""
    # This is a simple heuristic - look for the route definition above
    routes = [
        ('"/nodes/:certname/status"', 'GET /api/integrations/puppetserver/nodes/:certname/status'),
        ('"/nodes/:certname/facts"', 'GET /api/integrations/puppetserver/nodes/:certname/facts'),
        ('"/catalog/:certname/:environment"', 'GET /api/integrations/puppetserver/catalog/:certname/:environment'),
        ('"/catalog/compare"', 'POST /api/integrations/puppetserver/catalog/compare'),
        ('"/environments"', 'GET /api/integrations/puppetserver/environments'),
        ('"/environments/:name"', 'GET /api/integrations/puppetserver/environments/:name'),
        ('"/environments/:name/deploy"', 'POST /api/integrations/puppetserver/environments/:name/deploy'),
        ('"/environments/:name/cache"', 'DELETE /api/integrations/puppetserver/environments/:name/cache'),
        ('"/status/services"', 'GET /api/integrations/puppetserver/status/services'),
        ('"/status/simple"', 'GET /api/integrations/puppetserver/status/simple'),
        ('"/admin-api"', 'GET /api/integrations/puppetserver/admin-api'),
        ('"/metrics"', 'GET /api/integrations/puppetserver/metrics'),
    ]

    for route_pattern, operation_name in routes:
        # Find OPERATION_PLACEHOLDER after this route
        pattern = f'router\\.(get|post|delete)\\(\s*{re.escape(route_pattern)}.*?OPERATION_PLACEHOLDER'

        def replace_op(match):
            return match.group(0).replace('OPERATION_PLACEHOLDER', operation_name)

        content = re.sub(pattern, replace_op, content, flags=re.DOTALL)

    return content

def main():
    file_path = 'backend/src/routes/integrations/puppetserver.ts'

    with open(file_path, 'r') as f:
        content = f.read()

    # Add expert mode initialization
    content = add_expert_mode_init(content)

    # Fix operation names
    content = fix_operation_names(content)

    with open(file_path, 'w') as f:
        f.write(content)

    print('✓ Added expert mode initialization to routes')

if __name__ == '__main__':
    main()

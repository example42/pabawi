#!/usr/bin/env node

/**
 * Script to update Puppetserver routes with proper expert mode implementation
 * This replaces handleExpertModeResponse calls with the full expert mode pattern
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/routes/integrations/puppetserver.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Remove handleExpertModeResponse from imports
content = content.replace(
  /handleExpertModeResponse,\s*/g,
  ''
);

// Add ExpertModeService import if not present
if (!content.includes('import { ExpertModeService }')) {
  content = content.replace(
    /from "\.\/utils";/,
    'from "./utils";\nimport { ExpertModeService } from "../../services/ExpertModeService";'
  );
}

// Pattern to find and replace handleExpertModeResponse calls
const handleExpertModePattern = /handleExpertModeResponse\(\s*req,\s*res,\s*responseData,\s*'([^']+)',\s*duration,\s*'([^']+)',\s*\{([^}]*)\}\s*\);/g;

content = content.replace(handleExpertModePattern, (match, operation, integration, metadata) => {
  return `if (debugInfo) {
          debugInfo.duration = duration;
          ${metadata.trim() ? `expertModeService.addMetadata(debugInfo, '${metadata.trim().split(':')[0].trim()}', ${metadata.trim().split(':')[1].trim()});` : ''}
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.json(responseData);
        }`;
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('✓ Updated Puppetserver routes with expert mode pattern');

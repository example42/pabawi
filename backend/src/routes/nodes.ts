import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { IntegrationManager } from '../integrations/IntegrationManager.js';
import { BoltService } from '../bolt/BoltService.js';
import { LoggerService } from '../services/LoggerService.js';
import { ExpertModeService } from '../services/ExpertModeService.js';
import { BadRequestError } from '../errors/BadRequestError.js';

const router = express.Router();
const logger = LoggerService.getInstance();
const expertModeService = ExpertModeService.getInstance();

// POST /api/nodes/:node/install-package
router.post('/:node/install-package', asyncHandler(async (req, res) => {
  const { node } = req.params;
  const { package: packageName } = req.body;
  const correlationId = req.correlationId || 'unknown';
  const expertMode = req.expertMode || false;

  logger.info('Processing package install request', {
    component: 'NodesRouter',
    integration: 'bolt',
    operation: 'installPackage',
    node,
    packageName,
    correlationId
  });

  // Validate request body
  if (!packageName || typeof packageName !== 'string' || packageName.trim() === '') {
    throw new BadRequestError('Invalid package installation request: package name is required and must be a non-empty string');
  }

  // Get node facts to determine OS family
  const integrationManager = IntegrationManager.getInstance();
  const nodeData = await integrationManager.getNodeData(node);
  if (!nodeData || !nodeData.facts || !nodeData.facts.os || !nodeData.facts.os.family) {
    throw new BadRequestError(`Cannot determine OS for node ${node}: facts unavailable`);
  }

  const osFamily = nodeData.facts.os.family.toLowerCase();
  let installCommand: string;
  if (osFamily === 'redhat' || osFamily === 'suse') {
    installCommand = `yum install -y ${packageName}`;
  } else if (osFamily === 'debian') {
    installCommand = `apt update && apt install -y ${packageName}`;
  } else {
    throw new BadRequestError(`Unsupported OS family for package installation: ${osFamily}`);
  }

  // Execute via BoltService
  const boltService = BoltService.getInstance();
  const execution = await boltService.executeCommand(installCommand, [node], {
    correlationId,
    expertMode
  });

  const response = {
    executionId: execution.id,
    status: 'started',
    source: 'bolt'
  };

  if (expertMode) {
    expertModeService.attachDebugInfo(response, { node, packageName, osFamily, command: installCommand, correlationId });
  }

  logger.info('Package install initiated', {
    component: 'NodesRouter',
    operation: 'installPackage',
    executionId: execution.id,
    correlationId
  });

  res.json(response);
}));

export default router;

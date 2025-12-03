/**
 * Ansible AWX/Tower API Routes
 *
 * Provides REST endpoints for Ansible integration
 */

import { Router, Request, Response, NextFunction } from 'express';
import type { IntegrationManager } from '../integrations/IntegrationManager';
import { AnsiblePlugin } from '../integrations/ansible';

/**
 * Create Ansible router with IntegrationManager dependency
 */
export function createAnsibleRouter(integrationManager: IntegrationManager): Router {
  const router = Router();

  // Helper to get Ansible plugin
  function getAnsiblePlugin(): AnsiblePlugin | null {
    const plugin = integrationManager.getPlugin('ansible');
    if (plugin && plugin instanceof AnsiblePlugin) {
      return plugin;
    }
    return null;
  }

  // Health check
  router.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({
          status: 'unavailable',
          message: 'Ansible integration is not configured',
        });
        return;
      }

      const health = await plugin.healthCheck();
      res.json({
        status: health.healthy ? 'ok' : 'error',
        ...health,
      });
    } catch (error) {
      next(error);
    }
  });

  // Get inventories
  router.get('/inventories', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const inventories = await plugin.getInventories();
      res.json({ inventories });
    } catch (error) {
      next(error);
    }
  });

  // Get hosts from an inventory
  router.get('/inventories/:id/hosts', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const inventoryId = parseInt(req.params.id, 10);
      if (isNaN(inventoryId)) {
        res.status(400).json({ error: 'Invalid inventory ID' });
        return;
      }

      const hosts = await plugin.getInventoryHosts(inventoryId);
      res.json({ hosts });
    } catch (error) {
      next(error);
    }
  });

  // Get groups from an inventory
  router.get('/inventories/:id/groups', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const inventoryId = parseInt(req.params.id, 10);
      if (isNaN(inventoryId)) {
        res.status(400).json({ error: 'Invalid inventory ID' });
        return;
      }

      const groups = await plugin.getInventoryGroups(inventoryId);
      res.json({ groups });
    } catch (error) {
      next(error);
    }
  });

  // Get mapped nodes (hosts transformed to Pabawi format)
  router.get('/nodes', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const inventoryId = req.query.inventory
        ? parseInt(req.query.inventory as string, 10)
        : undefined;

      const nodes = await plugin.getMappedNodes(inventoryId);
      res.json({ nodes });
    } catch (error) {
      next(error);
    }
  });

  // Get node facts
  router.get('/nodes/:name/facts', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const facts = await plugin.getNodeFacts(req.params.name);
      res.json({ facts });
    } catch (error) {
      next(error);
    }
  });

  // Get node job history
  router.get('/nodes/:name/jobs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const jobs = await plugin.getHostJobHistory(req.params.name, limit);
      res.json({ jobs });
    } catch (error) {
      next(error);
    }
  });

  // Get job templates
  router.get('/job-templates', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const templates = await plugin.getJobTemplates();
      res.json({ templates });
    } catch (error) {
      next(error);
    }
  });

  // Get a specific job template
  router.get('/job-templates/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const templateId = parseInt(req.params.id, 10);
      if (isNaN(templateId)) {
        res.status(400).json({ error: 'Invalid template ID' });
        return;
      }

      const template = await plugin.getJobTemplate(templateId);
      if (!template) {
        res.status(404).json({ error: 'Job template not found' });
        return;
      }

      res.json({ template });
    } catch (error) {
      next(error);
    }
  });

  // Launch a job template
  router.post('/job-templates/:id/launch', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const templateId = parseInt(req.params.id, 10);
      if (isNaN(templateId)) {
        res.status(400).json({ error: 'Invalid template ID' });
        return;
      }

      const job = await plugin.launchJobTemplate(templateId, req.body);
      res.status(201).json({ job });
    } catch (error) {
      next(error);
    }
  });

  // Get jobs
  router.get('/jobs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const templateId = req.query.template
        ? parseInt(req.query.template as string, 10)
        : undefined;
      const status = req.query.status as string | undefined;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : undefined;

      const jobs = await plugin.getJobs(templateId, status, limit);
      res.json({ jobs });
    } catch (error) {
      next(error);
    }
  });

  // Get a specific job
  router.get('/jobs/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const jobId = parseInt(req.params.id, 10);
      if (isNaN(jobId)) {
        res.status(400).json({ error: 'Invalid job ID' });
        return;
      }

      const job = await plugin.getJob(jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.json({ job });
    } catch (error) {
      next(error);
    }
  });

  // Get job stdout
  router.get('/jobs/:id/stdout', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const jobId = parseInt(req.params.id, 10);
      if (isNaN(jobId)) {
        res.status(400).json({ error: 'Invalid job ID' });
        return;
      }

      const stdout = await plugin.getJobStdout(jobId);
      res.type('text/plain').send(stdout);
    } catch (error) {
      next(error);
    }
  });

  // Cancel a job
  router.post('/jobs/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const jobId = parseInt(req.params.id, 10);
      if (isNaN(jobId)) {
        res.status(400).json({ error: 'Invalid job ID' });
        return;
      }

      await plugin.cancelJob(jobId);
      res.json({ success: true, message: 'Job cancelled' });
    } catch (error) {
      next(error);
    }
  });

  // Relaunch a job
  router.post('/jobs/:id/relaunch', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const jobId = parseInt(req.params.id, 10);
      if (isNaN(jobId)) {
        res.status(400).json({ error: 'Invalid job ID' });
        return;
      }

      const job = await plugin.relaunchJob(jobId);
      res.status(201).json({ job });
    } catch (error) {
      next(error);
    }
  });

  // Run ad-hoc command
  router.post('/ad-hoc', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const { inventory, command, limit, credential } = req.body;

      if (!inventory || !command) {
        res.status(400).json({ error: 'inventory and command are required' });
        return;
      }

      const inventoryId = parseInt(inventory, 10);
      if (isNaN(inventoryId)) {
        res.status(400).json({ error: 'Invalid inventory ID' });
        return;
      }

      const credentialId = credential ? parseInt(credential, 10) : undefined;

      const job = await plugin.runAdHocCommand(inventoryId, command, limit, credentialId);
      res.status(201).json({ job });
    } catch (error) {
      next(error);
    }
  });

  // Get projects
  router.get('/projects', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const projects = await plugin.getProjects();
      res.json({ projects });
    } catch (error) {
      next(error);
    }
  });

  // Sync a project
  router.post('/projects/:id/sync', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const projectId = parseInt(req.params.id, 10);
      if (isNaN(projectId)) {
        res.status(400).json({ error: 'Invalid project ID' });
        return;
      }

      const result = await plugin.syncProject(projectId);
      res.json({ success: true, updateId: result.id });
    } catch (error) {
      next(error);
    }
  });

  // Get credentials
  router.get('/credentials', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getAnsiblePlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Ansible integration is not available' });
        return;
      }

      const credentials = await plugin.getCredentials();
      res.json({ credentials });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

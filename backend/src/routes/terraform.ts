/**
 * Terraform Cloud/Enterprise API Routes
 *
 * Provides REST endpoints for Terraform integration
 */

import { Router, Request, Response, NextFunction } from 'express';
import type { IntegrationManager } from '../integrations/IntegrationManager';
import { TerraformPlugin } from '../integrations/terraform';

/**
 * Create Terraform router with IntegrationManager dependency
 */
export function createTerraformRouter(integrationManager: IntegrationManager): Router {
  const router = Router();

  // Helper to get Terraform plugin
  function getTerraformPlugin(): TerraformPlugin | null {
    const plugin = integrationManager.getInformationSource('terraform');
    if (plugin && plugin instanceof TerraformPlugin) {
      return plugin;
    }
    return null;
  }

  // Health check
  router.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({
          status: 'unavailable',
          message: 'Terraform integration is not configured',
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

  // Get organizations
  router.get('/organizations', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const organizations = await plugin.getOrganizations();
      res.json({ organizations });
    } catch (error) {
      next(error);
    }
  });

  // Get workspaces
  router.get('/workspaces', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;

      const result = await plugin.getWorkspaces(page, pageSize);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Get workspace summaries (for dashboard)
  router.get('/workspaces/summary', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const summaries = await plugin.getWorkspaceSummaries();
      res.json({ summaries });
    } catch (error) {
      next(error);
    }
  });

  // Get a specific workspace by name
  router.get('/workspaces/by-name/:name', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const workspace = await plugin.getWorkspace(req.params.name);
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }

      res.json({ workspace });
    } catch (error) {
      next(error);
    }
  });

  // Get a specific workspace by ID
  router.get('/workspaces/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const workspace = await plugin.getWorkspaceById(req.params.id);
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }

      res.json({ workspace });
    } catch (error) {
      next(error);
    }
  });

  // Lock workspace
  router.post('/workspaces/:id/lock', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const workspace = await plugin.lockWorkspace(req.params.id, req.body.reason);
      res.json({ workspace });
    } catch (error) {
      next(error);
    }
  });

  // Unlock workspace
  router.post('/workspaces/:id/unlock', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const workspace = await plugin.unlockWorkspace(req.params.id);
      res.json({ workspace });
    } catch (error) {
      next(error);
    }
  });

  // Get workspace variables
  router.get('/workspaces/:id/variables', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const variables = await plugin.getVariables(req.params.id);
      res.json({ variables });
    } catch (error) {
      next(error);
    }
  });

  // Create variable
  router.post('/workspaces/:id/variables', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const { key, value, category, hcl, sensitive, description } = req.body;
      if (!key) {
        res.status(400).json({ error: 'key is required' });
        return;
      }

      const variable = await plugin.createVariable(req.params.id, key, value || '', {
        category,
        hcl,
        sensitive,
        description,
      });
      res.status(201).json({ variable });
    } catch (error) {
      next(error);
    }
  });

  // Update variable
  router.patch('/variables/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const { value, hcl, sensitive, description } = req.body;
      const variable = await plugin.updateVariable(req.params.id, value, {
        hcl,
        sensitive,
        description,
      });
      res.json({ variable });
    } catch (error) {
      next(error);
    }
  });

  // Delete variable
  router.delete('/variables/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      await plugin.deleteVariable(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Get workspace runs
  router.get('/workspaces/:id/runs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;

      const result = await plugin.getRuns(req.params.id, page, pageSize);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Create a run
  router.post('/workspaces/:id/runs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const run = await plugin.createRun(req.params.id, req.body);
      res.status(201).json({ run });
    } catch (error) {
      next(error);
    }
  });

  // Get a specific run
  router.get('/runs/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const run = await plugin.getRun(req.params.id);
      if (!run) {
        res.status(404).json({ error: 'Run not found' });
        return;
      }

      res.json({ run });
    } catch (error) {
      next(error);
    }
  });

  // Apply a run
  router.post('/runs/:id/apply', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      await plugin.applyRun(req.params.id, req.body.comment);
      res.json({ success: true, message: 'Run applied' });
    } catch (error) {
      next(error);
    }
  });

  // Discard a run
  router.post('/runs/:id/discard', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      await plugin.discardRun(req.params.id, req.body.comment);
      res.json({ success: true, message: 'Run discarded' });
    } catch (error) {
      next(error);
    }
  });

  // Cancel a run
  router.post('/runs/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      await plugin.cancelRun(req.params.id, req.body.comment);
      res.json({ success: true, message: 'Run cancelled' });
    } catch (error) {
      next(error);
    }
  });

  // Get plan logs
  router.get('/plans/:id/logs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const logs = await plugin.getPlanLogs(req.params.id);
      res.type('text/plain').send(logs);
    } catch (error) {
      next(error);
    }
  });

  // Get apply logs
  router.get('/applies/:id/logs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const logs = await plugin.getApplyLogs(req.params.id);
      res.type('text/plain').send(logs);
    } catch (error) {
      next(error);
    }
  });

  // Get current state
  router.get('/workspaces/:id/current-state', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const state = await plugin.getCurrentState(req.params.id);
      if (!state) {
        res.status(404).json({ error: 'No state found' });
        return;
      }

      res.json({ state });
    } catch (error) {
      next(error);
    }
  });

  // Get state versions
  router.get('/workspaces/:id/state-versions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;

      const result = await plugin.getStateVersions(req.params.id, page, pageSize);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Get state resources
  router.get('/state-versions/:id/resources', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;

      const result = await plugin.getStateResources(req.params.id, page, pageSize);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Get state outputs
  router.get('/state-versions/:id/outputs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const outputs = await plugin.getStateOutputs(req.params.id);
      res.json({ outputs });
    } catch (error) {
      next(error);
    }
  });

  // Get all mapped resources
  router.get('/resources', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const plugin = getTerraformPlugin();
      if (!plugin) {
        res.status(503).json({ error: 'Terraform integration is not available' });
        return;
      }

      const resources = await plugin.getMappedResources();
      res.json({ resources });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

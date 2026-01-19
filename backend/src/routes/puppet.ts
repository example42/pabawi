import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { BoltService } from "../bolt/BoltService";
import type { ExecutionRepository } from "../database/ExecutionRepository";
import { BoltInventoryNotFoundError } from "../bolt/types";
import { asyncHandler } from "./asyncHandler";
import type { StreamingExecutionManager } from "../services/StreamingExecutionManager";
import { LoggerService } from "../services/LoggerService";
import { ExpertModeService } from "../services/ExpertModeService";

/**
 * Request validation schemas
 */
const NodeIdParamSchema = z.object({
  id: z.string().min(1, "Node ID is required"),
});

const PuppetRunBodySchema = z.object({
  tags: z.array(z.string()).optional(),
  environment: z.string().optional(),
  noop: z.boolean().optional(),
  noNoop: z.boolean().optional(),
  debug: z.boolean().optional(),
  expertMode: z.boolean().optional(),
});

/**
 * Create Puppet router
 */
export function createPuppetRouter(
  boltService: BoltService,
  executionRepository: ExecutionRepository,
  streamingManager?: StreamingExecutionManager,
): Router {
  const router = Router();
  const logger = new LoggerService();

  /**
   * Helper function for expert mode responses
   */
  const handleExpertModeResponse = (
    req: Request,
    res: Response,
    responseData: unknown,
    operation: string,
    duration: number,
    integration: string,
    additionalMetadata?: Record<string, unknown>
  ): void => {
    if (req.expertMode) {
      const expertModeService = new ExpertModeService();
      const requestId = expertModeService.generateRequestId();
      const debugInfo = expertModeService.createDebugInfo(operation, requestId, duration);

      expertModeService.setIntegration(debugInfo, integration);

      if (additionalMetadata) {
        Object.entries(additionalMetadata).forEach(([key, value]) => {
          expertModeService.addMetadata(debugInfo, key, value);
        });
      }

      // Add performance metrics
      debugInfo.performance = expertModeService.collectPerformanceMetrics();

      // Add request context
      debugInfo.context = expertModeService.collectRequestContext(req);

      res.status(202).json(expertModeService.attachDebugInfo(responseData, debugInfo));
    } else {
      res.status(202).json(responseData);
    }
  };

  /**
   * POST /api/nodes/:id/puppet-run
   * Execute Puppet run on a node
   */
  router.post(
    "/:id/puppet-run",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const expertModeService = new ExpertModeService();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Processing Puppet run request", {
        component: "PuppetRouter",
        integration: "bolt",
        operation: "puppet-run",
        metadata: { nodeId: req.params.id },
      });

      // Capture info in expert mode
      if (req.expertMode) {
        const debugInfo = expertModeService.createDebugInfo(
          'POST /api/nodes/:id/puppet-run',
          requestId,
          Date.now() - startTime
        );
        expertModeService.addInfo(debugInfo, {
          message: "Processing Puppet run request",
          context: JSON.stringify({ nodeId: req.params.id }),
          level: 'info',
        });
      }

      try {
        // Validate request parameters and body
        logger.debug("Validating request parameters", {
          component: "PuppetRouter",
          integration: "bolt",
          operation: "puppet-run",
          metadata: { params: req.params, body: req.body },
        });

        // Capture debug in expert mode
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'POST /api/nodes/:id/puppet-run',
            requestId,
            Date.now() - startTime
          );
          expertModeService.addDebug(debugInfo, {
            message: "Validating request parameters",
            context: JSON.stringify({ params: req.params, body: req.body }),
            level: 'debug',
          });
        }

        const params = NodeIdParamSchema.parse(req.params);
        const body = PuppetRunBodySchema.parse(req.body);
        const nodeId = params.id;

        // Verify node exists in inventory
        logger.debug("Verifying node exists in inventory", {
          component: "PuppetRouter",
          integration: "bolt",
          operation: "puppet-run",
          metadata: { nodeId },
        });

        // Capture debug in expert mode
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'POST /api/nodes/:id/puppet-run',
            requestId,
            Date.now() - startTime
          );
          expertModeService.addDebug(debugInfo, {
            message: "Verifying node exists in inventory",
            context: JSON.stringify({ nodeId }),
            level: 'debug',
          });
        }

        const nodes = await boltService.getInventory();
        const node = nodes.find((n) => n.id === nodeId || n.name === nodeId);

        if (!node) {
          logger.warn("Node not found in inventory", {
            component: "PuppetRouter",
            integration: "bolt",
            operation: "puppet-run",
            metadata: { nodeId },
          });

          // Capture warning in expert mode
          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'POST /api/nodes/:id/puppet-run',
              requestId,
              Date.now() - startTime
            );
            expertModeService.addWarning(debugInfo, {
              message: "Node not found in inventory",
              context: `Node '${nodeId}' not found in inventory`,
              level: 'warn',
            });
          }

          res.status(404).json({
            error: {
              code: "INVALID_NODE_ID",
              message: `Node '${nodeId}' not found in inventory`,
            },
          });
          return;
        }

        // Build Puppet run configuration
        const config = {
          tags: body.tags,
          environment: body.environment,
          noop: body.noop,
          noNoop: body.noNoop,
          debug: body.debug,
        };
        const expertMode = body.expertMode ?? false;

        logger.debug("Creating execution record", {
          component: "PuppetRouter",
          integration: "bolt",
          operation: "puppet-run",
          metadata: { nodeId, config, expertMode },
        });

        // Capture debug in expert mode
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'POST /api/nodes/:id/puppet-run',
            requestId,
            Date.now() - startTime
          );
          expertModeService.addDebug(debugInfo, {
            message: "Creating execution record",
            context: JSON.stringify({ nodeId, config, expertMode }),
            level: 'debug',
          });
        }

        // Create initial execution record
        const executionId = await executionRepository.create({
          type: "puppet",
          targetNodes: [nodeId],
          action: "psick::puppet_agent",
          parameters: config,
          status: "running",
          startedAt: new Date().toISOString(),
          results: [],
          expertMode,
        });

        logger.info("Execution record created, starting Puppet run", {
          component: "PuppetRouter",
          integration: "bolt",
          operation: "puppet-run",
          metadata: { executionId, nodeId },
        });

        // Capture info in expert mode
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'POST /api/nodes/:id/puppet-run',
            requestId,
            Date.now() - startTime
          );
          expertModeService.addInfo(debugInfo, {
            message: "Execution record created, starting Puppet run",
            context: JSON.stringify({ executionId, nodeId }),
            level: 'info',
          });
        }

        // Execute Puppet run asynchronously
        // We don't await here to return immediately with execution ID
        void (async (): Promise<void> => {
          try {
            logger.debug("Setting up streaming callback", {
              component: "PuppetRouter",
              integration: "bolt",
              operation: "puppet-run",
              metadata: { executionId, expertMode, hasStreamingManager: !!streamingManager },
            });

            // Capture debug in expert mode
            if (expertMode) {
              const asyncExpertModeService = new ExpertModeService();
              const asyncRequestId = requestId;
              const debugInfo = asyncExpertModeService.createDebugInfo(
                'POST /api/nodes/:id/puppet-run',
                asyncRequestId,
                Date.now() - startTime
              );
              asyncExpertModeService.addDebug(debugInfo, {
                message: "Setting up streaming callback",
                context: JSON.stringify({ executionId, expertMode, hasStreamingManager: !!streamingManager }),
                level: 'debug',
              });
            }

            // Set up streaming callback if expert mode is enabled and streaming manager is available
            const streamingCallback =
              expertMode && streamingManager
                ? {
                    onCommand: (cmd: string): void => {
                      streamingManager.emitCommand(executionId, cmd);
                    },
                    onStdout: (chunk: string): void => {
                      streamingManager.emitStdout(executionId, chunk);
                    },
                    onStderr: (chunk: string): void => {
                      streamingManager.emitStderr(executionId, chunk);
                    },
                  }
                : undefined;

            logger.debug("Executing Puppet agent run", {
              component: "PuppetRouter",
              integration: "bolt",
              operation: "puppet-run",
              metadata: { executionId, nodeId, config },
            });

            // Capture debug in expert mode
            if (expertMode) {
              const asyncExpertModeService = new ExpertModeService();
              const asyncRequestId = requestId;
              const debugInfo = asyncExpertModeService.createDebugInfo(
                'POST /api/nodes/:id/puppet-run',
                asyncRequestId,
                Date.now() - startTime
              );
              asyncExpertModeService.addDebug(debugInfo, {
                message: "Executing Puppet agent run",
                context: JSON.stringify({ executionId, nodeId, config }),
                level: 'debug',
              });
            }

            const result = await boltService.runPuppetAgent(
              nodeId,
              config,
              streamingCallback,
            );

            logger.info("Puppet run completed successfully", {
              component: "PuppetRouter",
              integration: "bolt",
              operation: "puppet-run",
              metadata: {
                executionId,
                nodeId,
                status: result.status,
                duration: result.results[0]?.duration,
              },
            });

            // Capture info in expert mode
            if (expertMode) {
              const asyncExpertModeService = new ExpertModeService();
              const asyncRequestId = requestId;
              const debugInfo = asyncExpertModeService.createDebugInfo(
                'POST /api/nodes/:id/puppet-run',
                asyncRequestId,
                Date.now() - startTime
              );
              asyncExpertModeService.addInfo(debugInfo, {
                message: "Puppet run completed successfully",
                context: JSON.stringify({
                  executionId,
                  nodeId,
                  status: result.status,
                  duration: result.results[0]?.duration,
                }),
                level: 'info',
              });
            }

            // Update execution record with results
            // Include stdout/stderr when expert mode is enabled
            await executionRepository.update(executionId, {
              status: result.status,
              completedAt: result.completedAt,
              results: result.results,
              error: result.error,
              command: result.command,
              stdout: expertMode ? result.stdout : undefined,
              stderr: expertMode ? result.stderr : undefined,
            });

            // Emit completion event if streaming
            if (streamingManager) {
              streamingManager.emitComplete(executionId, result);
            }
          } catch (error) {
            logger.error("Error executing Puppet run", {
              component: "PuppetRouter",
              integration: "bolt",
              operation: "puppet-run",
              metadata: { executionId, nodeId },
            }, error instanceof Error ? error : undefined);

            // Capture error in expert mode
            if (expertMode) {
              const asyncExpertModeService = new ExpertModeService();
              const asyncRequestId = requestId;
              const debugInfo = asyncExpertModeService.createDebugInfo(
                'POST /api/nodes/:id/puppet-run',
                asyncRequestId,
                Date.now() - startTime
              );
              asyncExpertModeService.addError(debugInfo, {
                message: "Error executing Puppet run",
                stack: error instanceof Error ? error.stack : undefined,
                level: 'error',
              });
            }

            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";

            // Update execution record with error
            await executionRepository.update(executionId, {
              status: "failed",
              completedAt: new Date().toISOString(),
              results: [
                {
                  nodeId,
                  status: "failed",
                  error: errorMessage,
                  duration: 0,
                },
              ],
              error: errorMessage,
            });

            // Emit error event if streaming
            if (streamingManager) {
              streamingManager.emitError(executionId, errorMessage);
            }
          }
        })();

        const duration = Date.now() - startTime;

        logger.info("Puppet run request accepted", {
          component: "PuppetRouter",
          integration: "bolt",
          operation: "puppet-run",
          metadata: { executionId, nodeId, duration },
        });

        // Capture info in expert mode
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'POST /api/nodes/:id/puppet-run',
            requestId,
            duration
          );
          expertModeService.addInfo(debugInfo, {
            message: "Puppet run request accepted",
            context: JSON.stringify({ executionId, nodeId, duration }),
            level: 'info',
          });
        }

        // Return execution ID and initial status immediately
        const responseData = {
          executionId,
          status: "running",
          message: "Puppet run started",
        };

        handleExpertModeResponse(
          req,
          res,
          responseData,
          'POST /api/nodes/:id/puppet-run',
          duration,
          'bolt',
          { executionId, nodeId, config }
        );
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Request validation failed", {
            component: "PuppetRouter",
            integration: "bolt",
            operation: "puppet-run",
            metadata: { errors: error.errors },
          });

          // Capture warning in expert mode
          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'POST /api/nodes/:id/puppet-run',
              requestId,
              duration
            );
            expertModeService.addWarning(debugInfo, {
              message: "Request validation failed",
              context: JSON.stringify(error.errors),
              level: 'warn',
            });
          }

          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Request validation failed",
              details: error.errors,
            },
          });
          return;
        }

        if (error instanceof BoltInventoryNotFoundError) {
          logger.error("Bolt configuration missing", {
            component: "PuppetRouter",
            integration: "bolt",
            operation: "puppet-run",
          }, error);

          // Capture error in expert mode
          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              'POST /api/nodes/:id/puppet-run',
              requestId,
              duration
            );
            expertModeService.addError(debugInfo, {
              message: "Bolt configuration missing",
              stack: error.stack,
              level: 'error',
            });
          }

          res.status(404).json({
            error: {
              code: "BOLT_CONFIG_MISSING",
              message: error.message,
            },
          });
          return;
        }

        // Unknown error
        logger.error("Unexpected error processing Puppet run request", {
          component: "PuppetRouter",
          integration: "bolt",
          operation: "puppet-run",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        // Capture error in expert mode
        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            'POST /api/nodes/:id/puppet-run',
            requestId,
            duration
          );
          expertModeService.addError(debugInfo, {
            message: "Unexpected error processing Puppet run request",
            stack: error instanceof Error ? error.stack : undefined,
            level: 'error',
          });
        }

        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process Puppet run request",
          },
        });
      }
    }),
  );

  return router;
}

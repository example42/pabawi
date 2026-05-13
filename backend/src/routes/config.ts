import { Router } from "express";
import type { DIContainer } from "../container/DIContainer";
import { createDefaultContainer } from "../container/DIContainer";
import { asyncHandler } from "./asyncHandler";

/**
 * Create config router with DI container
 */
export function createConfigRouter(
  container: DIContainer = createDefaultContainer(),
): Router {
  const router = Router();
  const configService = container.resolve("config");

  /**
   * GET /api/config/ui
   * Get UI configuration settings
   */
  router.get(
    "/ui",
    asyncHandler((_req, res) => {
      const uiConfig = configService.getUIConfig();

      res.json({
        ui: uiConfig,
      });
    }),
  );

  /**
   * GET /api/config/provisioning
   * Get provisioning safety configuration
   */
  router.get(
    "/provisioning",
    asyncHandler((_req, res) => {
      res.json({
        provisioning: {
          allowDestructiveActions: configService.isDestructiveProvisioningAllowed(),
        },
      });
    }),
  );

  return router;
}

export default createConfigRouter;

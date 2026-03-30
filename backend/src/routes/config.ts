import { Router } from "express";
import { ConfigService } from "../config/ConfigService";
import { asyncHandler } from "./asyncHandler";

const router = Router();
const configService = new ConfigService();

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

export default router;

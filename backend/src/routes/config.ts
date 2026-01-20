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
  asyncHandler(async (req, res) => {
    const uiConfig = configService.getUIConfig();

    res.json({
      ui: uiConfig,
    });
  }),
);

export default router;

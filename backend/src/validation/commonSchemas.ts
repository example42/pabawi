import { z } from "zod";

export const NodeIdParamSchema = z.object({
  id: z.string().min(1, "Node ID is required"),
});

export const NodeParamSchema = z.object({
  nodeId: z.string().min(1, "Node ID is required"),
});

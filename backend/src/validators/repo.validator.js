import { z } from "zod";

// Unknown keys (e.g. a client-supplied `owner`) are stripped by zod, so the
// owner can only ever come from the authenticated user.
export const createRepoSchema = z.object({
  name: z.string().trim().min(1, "Repository name is required"),
  description: z.string().optional(),
  visibility: z.boolean().optional(),
  content: z.array(z.string()).optional()
});

export const updateRepoSchema = z.object({
  content: z.string().optional(),
  description: z.string().optional()
});

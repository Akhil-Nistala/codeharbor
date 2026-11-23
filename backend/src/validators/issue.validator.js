import { z } from "zod";

export const createIssueSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().min(1, "Description is required")
});

export const updateIssueSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  status: z.enum(["open", "closed"]).optional()
});

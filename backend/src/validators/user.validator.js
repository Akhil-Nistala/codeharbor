import { z } from "zod";

export const updateProfileSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").optional(),
  password: z.string().min(6, "Password must be at least 6 characters").optional()
});

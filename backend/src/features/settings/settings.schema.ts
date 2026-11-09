import { z } from "zod";

export const signInRulesSchema = z.object({
  lockAfterFailedLogins: z.boolean(),
  idleSignOut: z.boolean(),
});

import { betterAuth } from "better-auth";
import { env } from "cloudflare:workers";

/**
 * Worker-request-scoped auth instance: Cloudflare D1 is provided by a binding.
 * Authentication is separate from staff authorization in the academy database.
 */
export function createAuth() {
  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) {
    throw new Error("BETTER_AUTH_SECRET and BETTER_AUTH_URL must be configured");
  }

  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // Private staff accounts only; bootstrap separately.
    },
    trustedOrigins: [env.BETTER_AUTH_URL],
  });
}

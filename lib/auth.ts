import { betterAuth } from "better-auth";
import { env } from "cloudflare:workers";

/**
 * Worker-request-scoped auth instance: Cloudflare D1 is provided by a binding.
 * Authentication is separate from staff authorization in the academy database.
 */
export function createAuth() {
  // Locally supplied secrets do not appear in generated types in CI.
  const bindings = env as typeof env & { BETTER_AUTH_SECRET?: string; BETTER_AUTH_URL?: string };
  if (!bindings.BETTER_AUTH_SECRET || !bindings.BETTER_AUTH_URL) {
    throw new Error("BETTER_AUTH_SECRET and BETTER_AUTH_URL must be configured");
  }

  return betterAuth({
    database: env.DB,
    secret: bindings.BETTER_AUTH_SECRET,
    baseURL: bindings.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // Private staff accounts only; bootstrap separately.
    },
    trustedOrigins: [bindings.BETTER_AUTH_URL],
  });
}

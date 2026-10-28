import { betterAuth } from "better-auth";
import { env } from "cloudflare:workers";

type AuthBindings = { BETTER_AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

function config() {
  const bindings = env as typeof env & AuthBindings;
  if (!bindings.BETTER_AUTH_SECRET || bindings.BETTER_AUTH_SECRET.length < 32 ||
      !bindings.BETTER_AUTH_URL) {
    throw new Error("Staff authentication is not configured");
  }
  const baseURL = new URL(bindings.BETTER_AUTH_URL);
  if (baseURL.pathname !== "/" || baseURL.search || baseURL.hash ||
      (baseURL.protocol !== "https:" && baseURL.hostname !== "localhost" && baseURL.hostname !== "127.0.0.1")) {
    throw new Error("Invalid staff authentication origin");
  }
  return { baseURL: baseURL.origin, secret: bindings.BETTER_AUTH_SECRET };
}

/** Only the configured staff hostname can serve auth or private CRM routes. */
export function isStaffOrigin(requestUrl: string): boolean {
  try {
    return new URL(requestUrl).origin === config().baseURL;
  } catch {
    return false;
  }
}

/**
 * Better Auth uses the existing Cloudflare D1 binding directly. Every CRM
 * request additionally checks an ACTIVE staff_memberships row server-side.
 * Never rely on this session alone to authorize access to guardian data.
 */
export function createAuth() {
  const { baseURL, secret } = config();
  return betterAuth({
    database: env.DB,
    secret,
    baseURL,
    trustedOrigins: [baseURL],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 30,
    },
  });
}

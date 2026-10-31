import { resolveDatabaseTarget } from "./lib/database-target.ts";
import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig(({ mode }) => {
  const staging = mode === "staging";
  const database = resolveDatabaseTarget(staging ? "staging" : "production", process.env.SOHOJAC_DEV_D1_ID);
  // Only opt in after a sender AND provider key are present. Dev and production
  // use separate GitHub secrets; the sender is a non-secret deployment variable.
  const staffEmailFrom = staging
    ? (process.env.DEV_STAFF_EMAIL_FROM || "").trim()
    : (process.env.STAFF_EMAIL_FROM || "").trim();
  const staffEmailKeyConfigured = staging
    ? Boolean(process.env.DEV_RESEND_API_KEY)
    : Boolean(process.env.RESEND_API_KEY);

  if (
    staging &&
    (!process.env.BETTER_AUTH_URL ||
      !process.env.BETTER_AUTH_URL.startsWith("https://sohojac-dev."))
  ) {
    throw new Error(
      "Staging requires its own HTTPS BETTER_AUTH_URL, never production.",
    );
  }
  return {
    worker: defineWorker({
      name: database.worker,
      entrypoint: "vinext/server/fetch-handler",
      compatibilityDate: "2026-10-26",
      compatibilityFlags: ["nodejs_compat"],
      assets: {
        htmlHandling: "none",
        notFoundHandling: "none",
        runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
      },
      env: {
        ASSETS: bindings.assets(),
        IMAGES: bindings.images(),
        DB: bindings.d1({
          name: database.name,
          id: database.id,
        }),
        // Each deployment must inject ONLY its own environment secrets.
        TURNSTILE_SECRET_KEY: bindings.secret(),
        // Auth is intentionally unavailable until BETTER_AUTH_SECRET is configured.
        BETTER_AUTH_SECRET: bindings.secret(),
        // A Resend binding exists ONLY when this environment has both inputs.
        // Dev secrets and sender are not inherited from production. Never put
        // the API key into a plaintext bindings.text or checked-in config.
        ...(staffEmailFrom && staffEmailKeyConfigured
          ? { RESEND_API_KEY: bindings.secret() }
          : {}),
        STAFF_EMAIL_FROM: bindings.text(staffEmailFrom),
        // Development sending is restricted to explicit synthetic/test users.
        STAFF_EMAIL_REQUIRE_ALLOWLIST: bindings.text(staging ? "true" : "false"),
        STAFF_EMAIL_ALLOWLIST: bindings.text(
          staging ? process.env.DEV_STAFF_EMAIL_ALLOWLIST || "" : "",
        ),
        BETTER_AUTH_URL: bindings.text(
          process.env.BETTER_AUTH_URL || "https://sohojac.com",
        ),
        // The public site key comes from a GitHub Actions variable in production.
        // Locally, Cloudflare loads the gitignored .env when this binding is omitted.
        ...(process.env.TURNSTILE_SITE_KEY
          ? {
              TURNSTILE_SITE_KEY: bindings.text(process.env.TURNSTILE_SITE_KEY),
            }
          : {}),
      },
    }),
  };
});

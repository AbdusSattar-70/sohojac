import { resolveDatabaseTarget } from "./lib/database-target.ts";
import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig(({ mode }) => {
  const staging = mode === "staging";
  const database = resolveDatabaseTarget(staging ? "staging" : "production", process.env.SOHOJAC_DEV_D1_ID);
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
        // Staff-only transactional recovery and invitation email delivery.
        // Staff transactional email is an optional integration.
        // It stays unavailable until a verified sender and secret are configured.
        // Never declare a mandatory secret when mail delivery is not activated.
        ...(!staging && process.env.STAFF_EMAIL_FROM
          ? { RESEND_API_KEY: bindings.secret() }
          : {}),
        STAFF_EMAIL_FROM: bindings.text(
          staging ? "" : process.env.STAFF_EMAIL_FROM || "",
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

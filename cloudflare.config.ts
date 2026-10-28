import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "sohojac",
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
      DB: bindings.d1({ name: "sohojac", id: "d6f3e4e9-2190-43bf-bc90-969687f6db78" }),
      // Require this secret; the manual deployment workflow uploads it on
      // every release to avoid losing secrets with the beta cf deploy API.
      TURNSTILE_SECRET_KEY: bindings.secret(),
      // Auth is intentionally unavailable until BETTER_AUTH_SECRET is configured.
      BETTER_AUTH_SECRET: bindings.secret(),
      BETTER_AUTH_URL: bindings.text(process.env.BETTER_AUTH_URL || "https://sohojac.com"),
      // The public site key comes from a GitHub Actions variable in production.
      // Locally, Cloudflare loads the gitignored .env when this binding is omitted.
      ...(process.env.TURNSTILE_SITE_KEY
        ? { TURNSTILE_SITE_KEY: bindings.text(process.env.TURNSTILE_SITE_KEY) }
        : {}),
    },
  }),
});

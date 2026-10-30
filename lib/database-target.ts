/**
 * Environment binding contract. Application code only knows the binding name DB;
 * deployment infrastructure selects the correct Cloudflare D1 database.
 *
 * Production is a protected, existing resource. Development D1 is new and must
 * be provisioned independently; never use the production ID as a fallback.
 */
export const databaseTargets = {
  production: {
    name: "sohojac",
    id: "d6f3e4e9-2190-43bf-bc90-969687f6db78",
    worker: "sohojac",
    branch: "refs/heads/master",
  },
  development: {
    name: "sohojac_dev",
    worker: "sohojac-dev",
    branch: "refs/heads/dev",
  },
} as const;

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function requireDevelopmentDatabaseId(id: string | undefined): string {
  if (!id || !uuid.test(id)) {
    throw new Error("Development requires a separately provisioned SOHOJAC_DEV_D1_ID.");
  }
  if (id.toLowerCase() === databaseTargets.production.id) {
    throw new Error("Development database ID must NEVER equal production sohojac D1.");
  }
  return id;
}

export function resolveDatabaseTarget(mode: "production" | "staging", developmentId?: string) {
  return mode === "production"
    ? databaseTargets.production
    : {
        ...databaseTargets.development,
        id: requireDevelopmentDatabaseId(developmentId),
      };
}

export function assertDatabaseRelease(
  environment: "production" | "development",
  githubRef: string | undefined,
  databaseId: string,
) {
  const target = databaseTargets[environment];
  if (githubRef !== target.branch) {
    throw new Error(`Invalid ${environment} release branch. Deployment refused.`);
  }
  const expectedId = environment === "production"
    ? databaseTargets.production.id
    : requireDevelopmentDatabaseId(databaseId);
  if (expectedId !== databaseId || !uuid.test(databaseId)) {
    throw new Error(`Unexpected ${environment} database binding. Deployment refused.`);
  }
  if (environment === "development" && databaseId === databaseTargets.production.id) {
    throw new Error("Cross-environment D1 binding is forbidden.");
  }
  return target;
}

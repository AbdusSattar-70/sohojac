import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { beforeEach, test } from "node:test";

// Load the real helper and route handlers. Auth/origin/response dependencies
// are injected; full Better Auth, D1 and HTTP behavior run in integration CI.
async function loadModule(path, dependencies, exports) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const executable = stripTypeScriptTypes(source, { mode: "strip" })
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/\bexport (?=(?:async function|function|const))/g, "");
  return new Function(
    ...Object.keys(dependencies), `${executable}\nreturn {${exports.join(",")}};`,
  )(...Object.values(dependencies));
}

let role = "OWNER";
let authCalls = [];
let originChecks = 0;
let databaseReads = [];
let bodyReads = 0;
const baseUrl = "https://sohojac.example";
const admissionId = "11111111-1111-4111-8111-111111111111";

async function getStaffAccess(url, headers) {
  authCalls.push({ url, headers });
  return role === null ? null : { userId: "staff-test", role };
}
function sameOrigin(request) {
  originChecks++;
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}
function privateJson(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
const env = {
  DB: {
    prepare(sql) {
      assert.match(sql, /^SELECT\b/, "Retained GET must perform read-only queries");
      databaseReads.push(sql);
      return { async all() { return { results: [] }; } };
    },
  },
};
const { retiredAdmissionMutation } = await loadModule(
  "lib/retired-admission-mutation.ts",
  { getStaffAccess, sameOrigin, privateJson }, ["retiredAdmissionMutation"],
);
const root = await loadModule(
  "app/api/staff/admissions/route.ts",
  { env, getStaffAccess, privateJson, retiredAdmissionMutation }, ["GET", "POST"],
);
const endpoints = [{ name: "create", method: "POST", suffix: "", hasId: false, handler: root.POST }];
for (const endpoint of [
  { name: "change", method: "PATCH", suffix: "", path: "[id]/route.ts" },
  { name: "bill", method: "POST", suffix: "/bill", path: "[id]/bill/route.ts" },
  { name: "enroll", method: "POST", suffix: "/enroll", path: "[id]/enroll/route.ts" },
]) {
  const module = await loadModule(
    `app/api/staff/admissions/${endpoint.path}`, { retiredAdmissionMutation }, [endpoint.method],
  );
  endpoints.push({ ...endpoint, hasId: true, handler: module[endpoint.method] });
}

function makeRequest(endpoint, { id = admissionId, origin = baseUrl, fetchSite = "same-origin" } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (origin !== null) headers.set("Origin", origin);
  if (fetchSite !== null) headers.set("Sec-Fetch-Site", fetchSite);
  const request = new Request(
    `${baseUrl}/api/staff/admissions${endpoint.hasId ? `/${encodeURIComponent(id)}` : ""}${endpoint.suffix}`,
    { method: endpoint.method, headers, body: "deliberately invalid original request body" },
  );
  for (const method of ["json", "text", "arrayBuffer", "blob", "formData"]) {
    Object.defineProperty(request, method, {
      value() {
        bodyReads++;
        throw new Error("Retired mutation must not consume request body");
      },
    });
  }
  return { request, context: { params: Promise.resolve({ id }) } };
}
async function call(endpoint, options) {
  const { request, context } = makeRequest(endpoint, options);
  const response = await endpoint.handler(request, context);
  assert.equal(request.bodyUsed, false, `${endpoint.name} consumed its original request body`);
  assert.equal(bodyReads, 0);
  assert.equal(databaseReads.length, 0, `${endpoint.name} touched the domain database`);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const lastAuth = authCalls.at(-1);
  assert.equal(lastAuth.url, request.url);
  assert.equal(lastAuth.headers, request.headers);
  return { response, body: await response.json() };
}

beforeEach(() => {
  role = "OWNER";
  authCalls = [];
  originChecks = 0;
  databaseReads = [];
  bodyReads = 0;
});

test("all four retired mutation handlers authenticate before origin or ID checks", async () => {
  role = null;
  for (const endpoint of endpoints) {
    const { response, body } = await call(endpoint, { id: "invalid-id", origin: null });
    assert.equal(response.status, 401, endpoint.name);
    assert.equal(body.error, "Authentication required");
  }
  assert.equal(authCalls.length, 4);
  assert.equal(originChecks, 0);
});

test("teacher and unsupported staff roles cannot reach retired mutation metadata", async () => {
  for (const rejectedRole of ["TEACHER", "ACCOUNTANT"]) {
    role = rejectedRole;
    for (const endpoint of endpoints) {
      const { response, body } = await call(endpoint);
      assert.equal(response.status, 403, `${endpoint.name}/${rejectedRole}`);
      assert.equal(body.error, "Access denied");
      assert.equal(body.workspace, undefined);
    }
  }
  assert.equal(originChecks, 0);
});

test("missing, foreign and cross-site origins are rejected before retirement responses", async () => {
  for (const options of [
    { origin: null },
    { origin: "https://unrelated.example" },
    { origin: baseUrl, fetchSite: "cross-site" },
  ]) {
    for (const endpoint of endpoints) {
      const { response, body } = await call(endpoint, options);
      assert.equal(response.status, 403, endpoint.name);
      assert.equal(body.error, "Invalid request origin");
    }
  }
  assert.equal(originChecks, 12);
});

test("parameterized retired endpoints reject invalid application identifiers", async () => {
  for (const id of ["not-an-id", "", "../another-record"]) {
    for (const endpoint of endpoints.filter((item) => item.hasId)) {
      const { response, body } = await call(endpoint, { id });
      assert.equal(response.status, 400, endpoint.name);
      assert.equal(body.error, "Invalid application ID");
      assert.equal(body.workspace, undefined);
    }
  }
});

test("authorized legacy mutations return 410 and the canonical workspace without reading the old body", async () => {
  for (const allowedRole of ["OWNER", "ADMIN", "OPERATOR"]) {
    role = allowedRole;
    for (const endpoint of endpoints) {
      const { response, body } = await call(endpoint);
      assert.equal(response.status, 410, `${endpoint.name}/${allowedRole}`);
      assert.equal(body.code, "LEGACY_ADMISSION_MUTATION_RETIRED");
      assert.equal(body.workspace, endpoint.hasId ? `/dashboard/admissions/${admissionId}` : "/dashboard/admissions");
    }
  }
});

test("the historical admissions GET keeps authentication and teacher denial", async () => {
  const request = new Request(`${baseUrl}/api/staff/admissions`);
  role = null;
  assert.equal((await root.GET(request)).status, 401);
  role = "TEACHER";
  assert.equal((await root.GET(request)).status, 403);
  assert.equal(databaseReads.length, 0);
});

test("the historical admissions GET still returns its read-only register contract", async () => {
  const response = await root.GET(new Request(`${baseUrl}/api/staff/admissions`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    items: [], offerings: [], batches: [], feePlans: [], enquiries: [], canApprove: true,
  });
  assert.equal(databaseReads.length, 5);
  assert.equal(originChecks, 0);
});

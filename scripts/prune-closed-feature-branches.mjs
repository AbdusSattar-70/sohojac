/**
 * Post-deployment branch housekeeping, never part of production releases.
 *
 * Only explicitly listed, closed PR heads are eligible. Five historic refs
 * are SHA-pinned. The current subject-directory feature is eligible only
 * after its exact head is a merged dev PR. Open PRs, unexpected new commits,
 * master and dev can NEVER be deleted.
 */
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (repo !== "AbdusSattar-70/sohojac" || process.env.GITHUB_REF !== "refs/heads/dev" ||
    !token || !process.env.GITHUB_SHA) {
  throw Error("Ref housekeeping is restricted to an authenticated dev release.");
}
const base = "https://api.github.com/repos/" + repo;
async function request(path, method = "GET", allowMissing = false) {
  const res = await fetch(base + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "sohojac-dev-safe-branch-cleanup",
    },
  });
  if (allowMissing && res.status === 404) return null;
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw Error("GitHub branch cleanup API returned HTTP " + res.status + " for " + path);
  return body;
}
const dev = await request("/git/ref/heads/dev");
if (dev?.object?.sha !== process.env.GITHUB_SHA)
  throw Error("Stale dev deploy: refusing repository housekeeping.");
const open = await request("/pulls?state=open&per_page=100");
const closed = await request("/pulls?state=closed&per_page=100");
if (!Array.isArray(open) || !Array.isArray(closed) || open.length >= 100 || closed.length >= 100)
  throw Error("PR list may be incomplete; refusing deletion.");
const entries = [
  { name: "docs/operator-first-erp-blueprint-20261031", sha: "ca1f24d804ed01e962b978bd45e9372a24fe36ad", pr: 51, allowSuperseded: true },
  { name: "feature/canonical-dev-baseline", sha: "35ff61749ae9c51fcf497854bff209f0fdc7efc8", pr: 53 },
  { name: "feature/operator-first-erp", sha: "ce2d0354c4710c43aae63137fbd4eee206c60c93", pr: 52 },
  { name: "feature/operator-first-programme-launch", sha: "51c8707f89b20aa1cfc7b30dc54eb3193d976af0", pr: 54 },
  { name: "fix/programme-launch-final-readiness", sha: "c750eca7b79cb1f04536c4fee516f8224f185fd9", pr: 55 },
  { name: "feature/operator-first-subject-catalogue", currentMergedHead: true },
  // Newer feature branches are eligible only when a merged PR to dev exists
  // and GitHub verifies the current branch tip is that exact merged PR head.
  { name: "feature/c2b-subject-impact-review", currentMergedHead: true },
  { name: "feature/c3-academic-year-conflict-guards", currentMergedHead: true },
  { name: "feature/c3b-master-data-versions", currentMergedHead: true },
  { name: "feature/c4-today-daily-work", currentMergedHead: true },
  { name: "feature/c5a-finance-reconciliation", currentMergedHead: true },
  { name: "feature/c5b-safe-sms-outbox", currentMergedHead: true },
  { name: "feature/fix-dev-clean-schema-guard", currentMergedHead: true },
  { name: "feature/single-subject-master-clean-slate", currentMergedHead: true },
  { name: "feature/c5c-guardian-message-safety", currentMergedHead: true },
  { name: "feature/c6-recovery-rehearsal", currentMergedHead: true },
  { name: "feature/c7-safe-merged-branch-cleanup", currentMergedHead: true },
  { name: "feature/c8-contact-safe-messaging", currentMergedHead: true },
  { name: "feature/c9-operating-cost-per-student", currentMergedHead: true },
  { name: "feature/c10-guardian-api-acceptance", currentMergedHead: true },
  // Obsolete alternative to rebuilding historical SQL on CI: replaced by the validated canonical baseline.
  { name: "fix/pinned-historical-ci-fixtures", sha: "c039b34beb3bff903320cd0753860e8aa915f1c6", pr: 57, allowSuperseded: true },
];
for (const item of entries) {
  const name = item.name;
  if (name === "master" || name === "dev" || name.startsWith("refs/"))
    throw Error("Protected branch in cleanup candidates.");
  if (open.some((p) => p.head?.ref === name)) {
    console.log("Preserved branch with open PR: " + name);
    continue;
  }
  const closedPR = item.pr
    ? closed.find((p) => p.number === item.pr && p.head?.ref === name)
    : closed.find((p) => p.head?.ref === name && p.merged_at && p.base?.ref === "dev");
  if (!closedPR || closedPR.state !== "closed" ||
      (!closedPR.merged_at && !item.allowSuperseded) ||
      (closedPR.merged_at && closedPR.base?.ref !== "dev")) {
    console.log("Preserved branch pending verified PR resolution: " + name);
    continue;
  }
  const expected = item.currentMergedHead ? closedPR.head.sha : item.sha;
  const path = "/git/refs/heads/" + name.split("/").map(encodeURIComponent).join("/");
  const existing = await request("/git/ref/heads/" + name.split("/").map(encodeURIComponent).join("/"), "GET", true);
  if (!existing) {
    console.log("Already retired: " + name);
    continue;
  }
  if (existing.ref !== "refs/heads/" + name || existing.object?.sha !== expected ||
      closedPR.head?.sha !== expected) {
    console.log("Preserved changed branch: " + name);
    continue;
  }
  await request(path, "DELETE");
  console.log("Retired verified closed-PR branch: " + name);
}
console.log("Dev branch housekeeping finished; master and dev remain protected.");

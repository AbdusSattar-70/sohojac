import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

/**
 * Transient CI-only fixture materialization.
 *
 * The dev source tree deliberately tracks FOUR canonical D1 migrations.
 * We still need the original 36 immutable legacy SQL files for sequential
 * data-preservation tests and any explicitly approved production release.
 * Reconstruct those unmodified files from a pinned reviewed Git commit,
 * in a gitignored working directory, never as active dev migrations.
 *
 * A full git history checkout is required. No GitHub token, network request,
 * D1 credentials, reset or remote database mutation occurs here.
 */
export const LEGACY_SOURCE_COMMIT = "36163481e1f19f19acb9f3ecdebe5c6de1e8aa0c";
const legacyDirectory = "migrations/history";
const expectedSnapshotHash = "9f7796f6ca25a07e20d1d8f44fc9f842fb8a55756fd78f7593d9bc4f384d6436";

function git(...args) {
  return execFileSync("git", args, { encoding: "buffer", maxBuffer: 4 * 1024 * 1024 });
}
const fileNames = git("ls-tree", "-r", "--name-only", LEGACY_SOURCE_COMMIT, "--", legacyDirectory)
  .toString("utf8").split("\n").filter(Boolean);
if (fileNames.length !== 36 ||
    fileNames.some(path => !/^migrations\/history\/\d{4}_[a-z0-9_-]+\.sql$/.test(path))) {
  throw new Error("Pinned production-history commit is incomplete or unexpected.");
}
if (!fileNames.includes("migrations/history/0001_public_website.sql") ||
    !fileNames.includes("migrations/history/0037_operator_expense_commands.sql")) {
  throw new Error("Missing first/last reviewed migration in pinned history.");
}
const data = fileNames.map(path => ({path, blob:git("show", LEGACY_SOURCE_COMMIT + ":" + path)}));
const snapshot = data.find(({path})=>path.endsWith("/0029_student_lifecycle.sql"));
if (!snapshot || createHash("sha256").update(snapshot.blob).digest("hex") !== expectedSnapshotHash) {
  throw new Error("Reviewed student migration SHA-256 does not match the immutable preservation contract.");
}
// Fail if an untracked directory contains other history: never accidentally
// test against mixed or edited SQL from another branch.
mkdirSync(legacyDirectory, {recursive:true});
const existing = readdirSync(legacyDirectory).filter(name=>/\.sql$/i.test(name));
if (existing.some(name=>!fileNames.some(path=>path.endsWith("/"+name)))) {
  throw new Error("Unknown historical SQL found in transient fixture directory.");
}
for (const {path,blob} of data) {
  const target=join(legacyDirectory,path.split("/").at(-1));
  const existingBytes = existing.includes(path.split("/").at(-1)) ? readFileSync(target) : null;
  if (existingBytes && !existingBytes.equals(blob)) {
    throw new Error("Refusing to overwrite a modified historical migration: " + target);
  }
  if (!existingBytes) writeFileSync(target,blob,{flag:"wx",mode:0o600});
}
if (readdirSync(legacyDirectory).filter(name=>/^\d{4}_[a-z0-9_-]+\.sql$/.test(name)).length!==36)
  throw new Error("Expected exactly 36 CI-only historical migrations after materialization.");
console.log("Restored 36 reviewed historical SQL fixtures to ignored temporary CI directory from pinned Git commit. Four active dev migrations unchanged.");

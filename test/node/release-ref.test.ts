import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../../scripts/check-release-ref.sh", import.meta.url));
let dir: string;

function git(...args: string[]): string {
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}
function commit(version: string, message: string): string {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version }));
  git("add", "package.json");
  git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", message);
  return git("rev-parse", "HEAD");
}
function check(tag: string, sha: string) {
  return spawnSync("bash", [script, tag, sha], { cwd: dir, encoding: "utf8" });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "release-ref-"));
  git("init", "-q", "-b", "main");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("check-release-ref.sh", () => {
  it("accepts a tag matching package.json on a commit that is on main", () => {
    const sha = commit("1.0.0", "release");
    git("update-ref", "refs/remotes/origin/main", sha);
    const r = check("v1.0.0", sha);
    expect(r.status, r.stderr).toBe(0);
  });

  it("rejects a tag that does not match package.json", () => {
    const sha = commit("1.0.0", "release");
    git("update-ref", "refs/remotes/origin/main", sha);
    const r = check("v1.0.1", sha);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("does not match package.json version 1.0.0");
  });

  it("rejects a commit that is not on main", () => {
    const onMain = commit("0.1.0", "base");
    git("update-ref", "refs/remotes/origin/main", onMain);
    git("checkout", "-q", "-b", "feature");
    const offMain = commit("1.0.0", "release on a branch");
    const r = check("v1.0.0", offMain);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("is not on main");
  });
});

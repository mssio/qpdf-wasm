# @mssio/qpdf-wasm 1.0.0 (Node 24, latest deps, hardening) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare `@mssio/qpdf-wasm@1.0.0`:
- align on Node 24 LTS;
- update every dependency and action to its latest stable version;
- pin actions by SHA and the Emscripten image by digest;
- add Dependabot, a main-only release check and registry-signature verification;
- write the semver stability promise and bump the version.

**Architecture:** No library API or behaviour changes. Repo-policy rules are enforced by a new unit test file, `test/unit/repo-policy.test.ts`, which grows one `describe` block per task. The tag/version/main rule for releases moves into a script, `scripts/check-release-ref.sh`, so it can be tested locally. The `v1.0.0` tag is created and pushed by Claude **after** the maintainer merges and pushes `main` (Task 7).

**Tech Stack:** Node 24, TypeScript 7, Vitest 5, Playwright, GitHub Actions (SHA-pinned), Dependabot, Docker `emscripten/emsdk` pinned by digest.

**Spec:** `docs/superpowers/specs/2026-10-06-v1-hardening-design.md` (builds on `docs/superpowers/specs/2026-10-05-qpdf-wasm-design.md`).

## Summary

Node floor decision (2026-10-06): keep `engines.node` at `>=24`. No Node 22 support or CI job.

| # | Task | Implementer model | Reviewer model | Effort (wall clock) | Main risk |
|---|---|---|---|---|---|
| 1 | Node 24 alignment: `engines >=24`, `@types/node` 24.x, docs; creates `repo-policy.test.ts` | haiku | sonnet | ~10 min | typecheck finds a Node 26-only API (unlikely) |
| 2 | Latest npm deps (Vitest 5) and fixture tools; full Node and browser suites | sonnet | sonnet | ~20–30 min | Vitest 5 config/API changes; the `nesting.test.ts` worker harness |
| 3 | Actions v7, SHA pinning, `check-release-ref.sh` and its test, `npm audit signatures`, drop the bootstrap token | sonnet | **opus** (security-sensitive release path) | ~30–40 min | checkout/setup-node v7 input changes; `fetch-depth: 0` + `origin/main` in the release job |
| 4 | Pin the emsdk image by digest; `build-wasm.sh` validation; AGENTS.md | haiku | sonnet | ~10–15 min (includes one Docker build) | none significant |
| 5 | Dependabot config, schema validation, AGENTS.md | haiku | sonnet | ~10 min | Dependabot may not handle the fixtures' `file:` dependency (fallback documented) |
| 6 | README stability promise, AGENTS.md, CHANGELOG, version 1.0.0 (no tag), clean-tree `ci.sh` | sonnet | sonnet | ~30–40 min (clean `ci.sh` ≈ 10–15 min) | none significant; the full run is the gate |
| — | Final whole-branch review (+ one fix wave if needed) | — | **opus** | ~15–30 min | — |
| 7 | **Claude (session):** after the maintainer merges and pushes `main`: pre-flight checks, user confirmation, tag `v1.0.0`, watch the release, confirm on npm | session model | — | ~15–20 min (release run ≈ 8–10 min, npm visibility ≈ 5 min) | first OIDC publish: trusted-publisher settings |

**Total:**
- **Subagent-driven:** ≈ 2.5–3.5 h wall clock including reviews and fix rounds, plus Task 7 after your merge.
- **Native** execution (Claude implements Tasks 1–6 in-session, one opus review at the end): ≈ 1.5–2 h.

**Token cost:** roughly 0.6–1.0 M subagent tokens (subagent-driven) vs 0.3–0.5 M (native), both a small fraction of the session budget.

These are estimates. Docker and browser runs dominate the wall clock, and they depend on the machine and network.

## Global Constraints

- Branch `chore/v1-hardening`. Never push. Never create tags on this branch. Never touch `vendor/qpdf` or `.superpowers/`.
- No API, behaviour or build-flag changes. No qpdf or Emscripten version bump.
- `engines.node`: exactly `">=24"`. `.nvmrc`: `24`. Every `actions/setup-node` step: `node-version: 24`.
- `@types/node`: latest **24.x** (`^24`), not 26.x. Dependabot must not propose `@types/node` majors.
- Every other npm dev dependency, every fixture tool and every GitHub Action goes to its **latest stable** version at implementation time. Re-check with `npm view <pkg> version` / `gh release view --repo <owner>/<repo> --json tagName -q .tagName`.
- Every `uses:` in `.github/workflows/*.yml` is `owner/repo@<40-hex sha> # vX.Y.Z`.
- The Emscripten image is run as `emscripten/emsdk:<version>@<digest>`. The version lives in `build/emsdk-version` and the digest in `build/emsdk-digest`.
- Fixture tools stay **exact** versions (no `^`).
- Commit messages end with exactly these two lines:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DByphsgjacP6AzPdW1wceG
  ```
- AGENTS.md hard rules apply. In particular, run `npx --yes @action-validator/cli` after editing any workflow.

## Review Focus

1. **A tag on a commit that isn't on `main`** (e.g. pushed from a feature branch): release must stop in `build` with "not on main", before anything publishes. Test: Task 3 (`test/node/release-ref.test.ts`).
2. **An unpinned or local action** (`@v7`, `@main`, `./local-action`, `docker://…`) slipping back into a workflow by hand or via a bad merge: the repo-policy test must fail and name the line. Test: Task 3.
3. **Node versions drifting apart** (Dependabot or a hand edit bumps `@types/node` to 26, or `.nvmrc`/`node-version` changes alone): the repo-policy test must fail. Test: Task 1. Dependabot is also told to ignore `@types/node` majors (Task 5).
4. **A malformed or empty `build/emsdk-digest`**: the wasm build must fail immediately with a clear message, not with a Docker error later. Test: Task 4 (policy test for the format, plus `build-wasm.sh` validation).
5. **`package.json` version and the newest CHANGELOG heading disagreeing at release time**: the policy test must fail. Test: Task 6.

---

## File Structure

```
test/unit/repo-policy.test.ts       NEW. Repo-wide rules: Node alignment, action pinning, emsdk digest, changelog/version
scripts/check-release-ref.sh        NEW. Release guard: tag == "v"+package.json version AND commit on origin/main
test/node/release-ref.test.ts       NEW. Exercises check-release-ref.sh in a temporary git repo
build/emsdk-digest                  NEW. sha256 digest of emscripten/emsdk:<version> (multi-arch index)
.github/dependabot.yml              NEW. Weekly grouped updates: npm (root, fixtures), github-actions
package.json, package-lock.json     engines, devDependencies, version
.github/workflows/{ci,release,qpdf-update}.yml   v7 actions SHA-pinned, audit signatures, release guard
scripts/build-wasm.sh               digest-pinned image
src/wasm-loader.ts                  comment and error text: Node >= 24
test/browser/fixtures/*/package.json  exact latest tool versions (if newer)
README.md, AGENTS.md, CHANGELOG.md  docs per spec §4.1, §5.6, §8
```

---

### Task 1: Node 24 alignment

**Files:**
- Create: `test/unit/repo-policy.test.ts`
- Modify: `package.json`, `package-lock.json`, `src/wasm-loader.ts:35,39`, `README.md` ("Node.js" section), `AGENTS.md` (commands table `npm ci` row)

**Interfaces:**
- Produces: `test/unit/repo-policy.test.ts` with helpers `readText(path: string): string` and `workflowFiles(): string[]`. Tasks 3, 4 and 6 add `describe` blocks to this file.

- [ ] **Step 1: Write the failing policy test**

`test/unit/repo-policy.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
export function readText(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}
export function workflowFiles(): string[] {
  return readdirSync(new URL(".github/workflows/", root))
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => `.github/workflows/${f}`);
}
const pkg = JSON.parse(readText("package.json")) as {
  version: string;
  engines: { node: string };
  devDependencies: Record<string, string>;
};

describe("Node version alignment", () => {
  it("requires Node >= 24", () => {
    expect(pkg.engines.node).toBe(">=24");
  });

  it("pins .nvmrc to 24", () => {
    expect(readText(".nvmrc").trim()).toBe("24");
  });

  it("uses Node 24 in every setup-node step", () => {
    for (const file of workflowFiles()) {
      for (const match of readText(file).matchAll(/node-version:\s*(\S+)/g)) {
        expect(match[1], `${file}: ${match[0]}`).toBe("24");
      }
    }
  });

  it("uses @types/node for the same major as the runtime", () => {
    expect(pkg.devDependencies["@types/node"]).toMatch(/^\^24\./);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/unit/repo-policy.test.ts`
Expected: FAIL on two assertions: `engines.node` (`">=20.16"` received) and `@types/node` (`"^26.6.4"` received). The `.nvmrc` and `node-version` tests pass already.

- [ ] **Step 3: Update package.json and @types/node**

```bash
npm pkg set engines.node=">=24"
npm install -D @types/node@^24
```

Expected: `package.json` has `"engines": { "node": ">=24" }` and `"@types/node": "^24.x.y"` (latest 24.x, e.g. `^24.19.1`). `package-lock.json` is updated.

- [ ] **Step 4: Update the Node notes in code and docs**

`src/wasm-loader.ts`: replace line 35's comment and line 39's error text:

```ts
// process.getBuiltinModule (Node >= 24 here; available since 20.16) avoids any import statement bundlers could see.
```

```ts
  if (!fs) throw new Error("file: URLs are only supported in Node.js >= 24");
```

`README.md`, "Node.js" section: replace `Node ≥ 20.16.` with `Node ≥ 24.`

`AGENTS.md`, commands table: the `npm ci` row's "Needs" column already says `Node 24`. Leave it. Search for any other `20.16` mentions and update them: `grep -rn "20\.16" README.md AGENTS.md src docs/superpowers/specs/2026-10-05-qpdf-wasm-design.md`.
- In the original spec (`2026-10-05-qpdf-wasm-design.md`), change `Node ≥ 20.16` to `Node ≥ 24 (raised in 1.0.0)` in §5, and the `"engines": { "node": ">=20.16" }` mention in the Global/§5 text to `">=24"`.
- Leave historical plan files unchanged.

- [ ] **Step 5: Run the checks**

Run: `npx vitest run test/unit/repo-policy.test.ts && npm run typecheck && npm test`
Expected: the policy test passes (4/4). Typecheck is clean against `@types/node@24`. The full suite passes (134+ tests). If typecheck reports a Node API that exists only in 26, report it; don't work around it.

- [ ] **Step 6: Commit**

```bash
git add test/unit/repo-policy.test.ts package.json package-lock.json src/wasm-loader.ts README.md AGENTS.md docs/superpowers/specs/2026-10-05-qpdf-wasm-design.md
git commit -m "chore: require Node >= 24 and match @types/node to the runtime" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DByphsgjacP6AzPdW1wceG"
```

---

### Task 2: Latest npm dependencies (Vitest 5) and fixture tools

**Files:**
- Modify: `package.json`, `package-lock.json`, possibly `vitest.config.ts`, `test/browser/fixtures/vite-app/package.json`, `test/browser/fixtures/webpack-app/package.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: the dependency versions recorded in `package.json`. Task 7 relies on the suite still passing.

- [ ] **Step 1: Record what is outdated**

```bash
npm outdated --long || true
for p in vite webpack webpack-cli; do echo "$p $(npm view $p version)"; done
grep -h '"vite"\|"webpack"\|"webpack-cli"' test/browser/fixtures/*/package.json
```

Expected (as of 2026-10-06): `vitest` 4.1.11 → 5.x. All others are current, and the fixture pins (vite 8.3.3, webpack 5.111.1, webpack-cli 7.2.3) are latest. Note anything newer that appeared since.

- [ ] **Step 2: Upgrade Vitest and anything else outdated (not @types/node)**

```bash
npm install -D vitest@latest
# plus, only if Step 1 showed them outdated:
npm install -D typescript@latest @playwright/test@latest publint@latest @arethetypeswrong/cli@latest
```

Expected: `vitest` is `^5.x` in `package.json`, and `@types/node` stays `^24`.

- [ ] **Step 3: Run the full Node suite under Vitest 5**

Run: `npm run typecheck && npm test`
Expected: all tests pass, including `test/node/nesting.test.ts`, whose worker harness uses `module.registerHooks`.
- If Vitest 5 reports a config or API change, apply the official Vitest 5 migration guide's fix to `vitest.config.ts` and re-run. The repo imports only `vitest` and `vitest/config`, and none of the removed entry points.
- Do not change test assertions.

- [ ] **Step 4: Bump fixture tools, only if Step 1 found newer versions**

Edit the exact versions in `test/browser/fixtures/vite-app/package.json` (`"vite"`) and `test/browser/fixtures/webpack-app/package.json` (`"webpack"`, `"webpack-cli"`). Keep them exact: no `^`.

- [ ] **Step 5: If Playwright was bumped, reinstall browsers; then run the browser suite**

```bash
npx playwright install chromium firefox webkit   # only if @playwright/test changed
npm run build && npm run test:browser
```

Expected: 9 passed (Vite build, Vite dev, webpack 5 × Chromium, Firefox, WebKit). Afterwards no server is left listening on ports 4301–4303: `lsof -iTCP:4301-4303 -sTCP:LISTEN` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts test/browser/fixtures/*/package.json
git commit -m "chore(deps): update to Vitest 5 and latest dev dependencies" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DByphsgjacP6AzPdW1wceG"
```

(`git add` of an unchanged file is a no-op.)

---

### Task 3: Actions v7, SHA pinning, release guard, registry signatures

**Files:**
- Create: `scripts/check-release-ref.sh`, `test/node/release-ref.test.ts`
- Modify: `test/unit/repo-policy.test.ts` (add a describe block), `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/workflows/qpdf-update.yml`

**Interfaces:**
- Consumes: `readText`, `workflowFiles` from `test/unit/repo-policy.test.ts` (Task 1).
- Produces: `scripts/check-release-ref.sh <tag> <commit-sha>`. Exits 0 when `tag == "v" + package.json version` and the commit is an ancestor of `origin/main`; otherwise exits non-zero with a message on stderr. It runs in the repo root (reads `./package.json`).

- [ ] **Step 1: Write the failing pinning test**

Append to `test/unit/repo-policy.test.ts`:

```ts
describe("GitHub Actions pinning", () => {
  const PINNED = /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}$/;

  it("pins every action to a full commit SHA with a version comment", () => {
    let count = 0;
    for (const file of workflowFiles()) {
      for (const match of readText(file).matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/gm)) {
        count++;
        const [line, ref = "", rest = ""] = match;
        expect(ref, `${file}: ${line.trim()} must be owner/repo@<40-hex sha>`).toMatch(PINNED);
        expect(rest, `${file}: ${line.trim()} needs a "# vX.Y.Z" comment`).toMatch(/#\s*v\d+(\.\d+){0,2}\b/);
      }
    }
    expect(count).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Write the failing release-guard test**

`test/node/release-ref.test.ts`:

```ts
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
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npx vitest run test/unit/repo-policy.test.ts test/node/release-ref.test.ts`
Expected:
- **pinning test:** FAIL on the first `uses: actions/checkout@v6` line ("must be owner/repo@<40-hex sha>");
- **release-guard tests:** FAIL, because `bash` can't open `scripts/check-release-ref.sh` (non-zero status, but the "accepts" test expects 0).

- [ ] **Step 4: Write `scripts/check-release-ref.sh`**

```bash
#!/usr/bin/env bash
# Release guard: run in the repo root by release.yml before anything is built or published.
# Usage: check-release-ref.sh <tag> <commit-sha>
# Fails unless the tag is "v" + package.json's version and the commit is on origin/main.
set -euo pipefail
tag="$1"
sha="$2"
version=$(node -p "require('./package.json').version")
if [ "v$version" != "$tag" ]; then
  echo "Tag $tag does not match package.json version $version" >&2
  exit 1
fi
if ! git merge-base --is-ancestor "$sha" origin/main 2>/dev/null; then
  echo "Tag $tag points at $sha, which is not on main. Tag a commit on main." >&2
  exit 1
fi
echo "Release ref OK: $tag at $sha is on main"
```

```bash
chmod +x scripts/check-release-ref.sh
```

- [ ] **Step 5: Resolve the latest action versions and SHAs**

```bash
for r in actions/checkout actions/setup-node actions/upload-artifact actions/download-artifact; do
  t=$(gh release view --repo "$r" --json tagName -q .tagName)
  echo "$r $t $(gh api "repos/$r/commits/$t" -q .sha)"
done
```

Expected (2026-10-06):
- `actions/checkout v7.0.1 3d3c42e5aac5ba805825da76410c181273ba90b1`
- `actions/setup-node v7.0.0 820762786026740c76f36085b0efc47a31fe5020`
- `actions/upload-artifact v7.0.1 043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`
- `actions/download-artifact v8.0.1 3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c`

Use the values printed on the day.

Read the release notes for checkout v7 and setup-node v7:

```bash
gh release view --repo actions/checkout v7.0.1
gh release view --repo actions/setup-node v7.0.0
```

Look for any changed or renamed inputs among the ones we use:
- checkout: `submodules`, `persist-credentials`, `fetch-depth`;
- setup-node: `node-version`, `cache`, `package-manager-cache`, `registry-url`.

Adapt the workflows if needed and note it in the report.

- [ ] **Step 6: Pin every action in all three workflows**

In `.github/workflows/ci.yml`, `release.yml` and `qpdf-update.yml`, replace each `uses:` line, using the SHAs from Step 5:

```yaml
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
      - uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
```

Keep every existing `with:` block unchanged unless Step 5's release notes require a change.

- [ ] **Step 7: Add the release guard, signature checks, and drop the bootstrap token**

`.github/workflows/release.yml`, job `build`:
- (a) Give its checkout step `fetch-depth: 0`, so `origin/main` and full history are available. Keep `submodules: recursive` and `persist-credentials: false`.
- (b) Replace the whole "Tag must match package.json version" step with:

```yaml
      - name: Tag must match package.json and be on main
        run: bash scripts/check-release-ref.sh "$GITHUB_REF_NAME" "$GITHUB_SHA"
```

Then, in **every** job that runs `npm ci --ignore-scripts`, add this step directly after it. That's ci.yml `verify`, release.yml `build` and `test`, and qpdf-update.yml `update`, which is inside its multi-line "Build and verify" step: add `npm audit signatures` on the line after `npm ci --ignore-scripts`.

```yaml
      - run: npm audit signatures
```

In release.yml, job `publish`, step "Publish": delete the `env:` block and its comment, i.e. `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`. The bootstrap token was used once for 0.1.0; from 1.0.0 the job publishes through trusted publishing (OIDC). Keep the `id-token: write` permission and `npm publish "./$tarball" --provenance --access public`.

- [ ] **Step 8: Run the tests and validate the workflows**

```bash
npx vitest run test/unit/repo-policy.test.ts test/node/release-ref.test.ts
for f in .github/workflows/*.yml; do npx --yes @action-validator/cli "$f" || echo "INVALID: $f"; done
npm audit signatures
grep -n 'uses:' .github/workflows/*.yml
```

Expected:
- the policy test passes (pinning block included);
- release-ref passes 3/3;
- action-validator prints no `INVALID`;
- `npm audit signatures` reports verified registry signatures and attestations with exit 0;
- every `uses:` line shows a 40-hex SHA plus a `# v…` comment.

- [ ] **Step 9: Commit**

```bash
git add scripts/check-release-ref.sh test/node/release-ref.test.ts test/unit/repo-policy.test.ts .github/workflows/
git commit -m "ci: pin actions to commit SHAs (checkout/setup-node v7), release only from main, verify registry signatures" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DByphsgjacP6AzPdW1wceG"
```

---

### Task 4: Pin the Emscripten image by digest

**Files:**
- Create: `build/emsdk-digest`
- Modify: `scripts/build-wasm.sh`, `test/unit/repo-policy.test.ts` (add a describe block), `AGENTS.md` ("Upgrade Emscripten", repo map `build/` row)

**Interfaces:**
- Consumes: `readText` (Task 1).
- Produces: `build/emsdk-digest`, a single line `sha256:<64 hex>`.

- [ ] **Step 1: Write the failing digest test**

Append to `test/unit/repo-policy.test.ts`:

```ts
describe("Emscripten image pin", () => {
  it("records the emsdk image digest", () => {
    expect(readText("build/emsdk-digest").trim()).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("runs the image by version and digest", () => {
    expect(readText("scripts/build-wasm.sh")).toContain('"emscripten/emsdk:${EMSDK_VERSION}@${EMSDK_DIGEST}"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/unit/repo-policy.test.ts -t "Emscripten image pin"`
Expected: FAIL. The first test fails with ENOENT for `build/emsdk-digest`, and the second because the run line is missing.

- [ ] **Step 3: Record the digest**

```bash
docker buildx imagetools inspect "emscripten/emsdk:$(cat build/emsdk-version)" | awk '/^Digest:/{print $2; exit}' > build/emsdk-digest
cat build/emsdk-digest
```

Expected (2026-10-06): `sha256:cdefec943f04fd4b2b2fe23b0a1a346be9fc560ef5784a83faa27dd351381372`. This is the multi-arch index digest, so it works on both arm64 and amd64.

- [ ] **Step 4: Use it in `scripts/build-wasm.sh`**

Replace the whole file with:

```bash
#!/usr/bin/env bash
# Builds src/wasm/* inside the pinned emscripten/emsdk Docker image (version + digest).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
EMSDK_VERSION=$(tr -d '[:space:]' < "$ROOT/build/emsdk-version")
EMSDK_DIGEST=$(tr -d '[:space:]' < "$ROOT/build/emsdk-digest")
if [[ ! "$EMSDK_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "build/emsdk-digest must contain the image digest (sha256:<64 hex>), got: '$EMSDK_DIGEST'" >&2
  exit 1
fi
if [ ! -f "$ROOT/vendor/qpdf/CMakeLists.txt" ]; then
  echo "vendor/qpdf is missing: run 'git submodule update --init'" >&2
  exit 1
fi
docker run --rm \
  -v "$ROOT:/work" \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  "emscripten/emsdk:${EMSDK_VERSION}@${EMSDK_DIGEST}" \
  bash /work/build/build.sh
```

- [ ] **Step 5: Run the test, the digest validation and a real build**

```bash
npx vitest run test/unit/repo-policy.test.ts
cp build/emsdk-digest /tmp/emsdk-digest.bak && echo "sha256:bad" > build/emsdk-digest && (npm run build:wasm; echo "exit=$?") ; cp /tmp/emsdk-digest.bak build/emsdk-digest
npm run build:wasm && bash scripts/check-generated.sh && npx vitest run test/node/wasm-build.test.ts
```

Expected:
- the policy test passes;
- the bad-digest run prints `build/emsdk-digest must contain the image digest …` with `exit=1`;
- the real build ends `Built qpdf 12.4.2 with Emscripten 6.0.11`;
- `check-generated.sh` passes (notices/README unchanged);
- wasm-build tests pass.

- [ ] **Step 6: Update AGENTS.md**

In the repo map `build/` row, change `` `emsdk-version` (pinned Emscripten) `` to `` `emsdk-version` + `emsdk-digest` (pinned Emscripten image) ``.

Replace the "Upgrade Emscripten" section body with:

```markdown
Change `build/emsdk-version`, then record the new image digest (Dependabot can't update it):

```bash
docker buildx imagetools inspect "emscripten/emsdk:$(cat build/emsdk-version)" | awk '/^Digest:/{print $2; exit}' > build/emsdk-digest
npm run build:wasm && bash scripts/ci.sh
```

Separate PR. Note the size delta in the PR.
```

- [ ] **Step 7: Commit**

```bash
git add build/emsdk-digest scripts/build-wasm.sh test/unit/repo-policy.test.ts AGENTS.md
git commit -m "build: pin the emscripten/emsdk image by digest" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DByphsgjacP6AzPdW1wceG"
```

---

### Task 5: Dependabot

**Files:**
- Create: `.github/dependabot.yml`
- Modify: `AGENTS.md` (new "Dependency updates" subsection under "How to")

**Interfaces:**
- Consumes: the SHA pin format from Task 3 (Dependabot keeps `@<sha> # vX.Y.Z` up to date).
- Produces: nothing code-facing.

- [ ] **Step 1: Write `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
    commit-message:
      prefix: "chore(deps)"
    ignore:
      # @types/node must match the Node 24 runtime (engines >=24); majors are bumped by hand.
      - dependency-name: "@types/node"
        update-types: ["version-update:semver-major"]
    groups:
      dev-dependencies:
        dependency-type: development
        update-types: [minor, patch]
      major-updates:
        update-types: [major]

  - package-ecosystem: npm
    directories:
      - /test/browser/fixtures/vite-app
      - /test/browser/fixtures/webpack-app
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
    commit-message:
      prefix: "chore(deps)"
    ignore:
      # A file: tarball produced by `npm pack` during the browser tests; never on the registry.
      - dependency-name: "@mssio/qpdf-wasm"
    groups:
      browser-fixtures:
        patterns: ["*"]

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
    commit-message:
      prefix: "ci(deps)"
    groups:
      actions:
        patterns: ["*"]
```

- [ ] **Step 2: Validate it against the published schema**

```bash
mkdir -p /tmp/dependabot-schema
curl -fsSL https://json.schemastore.org/dependabot-2.0.json -o /tmp/dependabot-schema/schema.json
npx --yes ajv-cli@5 validate --spec=draft7 --strict=false -c ajv-formats \
  -s /tmp/dependabot-schema/schema.json -d .github/dependabot.yml
```

Expected: `.github/dependabot.yml valid`.
- If ajv-cli can't read YAML in this version, convert first:

  ```sh
  npx --yes js-yaml .github/dependabot.yml > /tmp/dependabot-schema/dependabot.json
  ```

  then validate that file.
- If `-c ajv-formats` fails to load, add `npx --yes -p ajv-cli@5 -p ajv-formats …`.
- Report the exact command that worked.

- [ ] **Step 3: Document it in AGENTS.md**

Add this subsection under "## How to", after "### Upgrade Emscripten":

```markdown
### Dependency updates

Dependabot (`.github/dependabot.yml`) opens grouped PRs every Monday:
- **npm, root:** minor and patch updates are grouped; majors come as their own group.
- **npm, browser test fixtures:** grouped. `@mssio/qpdf-wasm` is ignored there, because it is the packed tarball.
- **GitHub Actions:** grouped. Dependabot updates the commit SHA and the `# vX.Y.Z` comment together.

`@types/node` majors are ignored on purpose: they must match Node 24 (`engines`, `.nvmrc`, `node-version`). Bump them by hand together with the runtime. The Emscripten image digest is not covered; see "Upgrade Emscripten". Review major updates individually, and merge only green PRs.

If Dependabot reports errors for the fixture directories (their `file:` dependency only exists during tests), remove that entry from `dependabot.yml` and bump the exact fixture pins (`vite`, `webpack`, `webpack-cli`) by hand when you update dependencies.
```

- [ ] **Step 4: Commit**

```bash
git add .github/dependabot.yml AGENTS.md
git commit -m "ci: add Dependabot for npm and GitHub Actions" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DByphsgjacP6AzPdW1wceG"
```

---

### Task 6: Stability promise, docs, version 1.0.0, full verification

**Files:**
- Modify: `README.md` ("Versioning" section), `AGENTS.md` (hard rules, "Cut a release", new "Repository settings" section), `CHANGELOG.md`, `package.json`, `package-lock.json`, `test/unit/repo-policy.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `readText`, `pkg` from `test/unit/repo-policy.test.ts` (Task 1); `scripts/check-release-ref.sh` (Task 3).
- Produces: `package.json` version `1.0.0` with no git tag. Task 7 tags it.

- [ ] **Step 1: Write the failing changelog/version test**

Append to `test/unit/repo-policy.test.ts`:

```ts
describe("release metadata", () => {
  it("has the newest CHANGELOG heading equal to package.json's version", () => {
    const heading = readText("CHANGELOG.md").match(/^## (\d+\.\d+\.\d+)\b/m);
    expect(heading?.[1]).toBe(pkg.version);
  });

  it("is version 1.0.0", () => {
    expect(pkg.version).toBe("1.0.0");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/unit/repo-policy.test.ts -t "release metadata"`
Expected: the first test passes (`0.1.0` == `0.1.0`) and the second FAILS (`0.1.0` received).

- [ ] **Step 3: Bump the version without a tag and add the CHANGELOG entry**

```bash
npm version 1.0.0 --no-git-tag-version
```

Add this section to `CHANGELOG.md` above `## 0.1.0 — 2026-10-06`, using today's date (`date +%F`):

```markdown
## 1.0.0 — <today's date, YYYY-MM-DD>

- **Stable API.** From 1.0.0 this package follows semver for its public API; see README "Versioning".
- **Breaking:** requires Node ≥ 24 (`engines` raised from `>=20.16`). Browser usage is unchanged.
- No API changes since 0.1.0. Bundles qpdf 12.4.2 (unmodified), built with Emscripten 6.0.11. TypeScript users need TypeScript ≥ 5.7.
- Hardening: GitHub Actions pinned to commit SHAs, the Emscripten build image pinned by digest, releases only from `main`, npm registry signatures verified in CI, Dependabot for npm and Actions. Published through npm trusted publishing with provenance.
```

Write the actual date, not the placeholder text.

- [ ] **Step 4: Rewrite README "Versioning"**

Replace the whole `## Versioning` section, up to `## Building from source`, with:

```markdown
## Versioning

Since 1.0.0 this package follows [semver](https://semver.org) for its **public API**:
- everything exported from `@mssio/qpdf-wasm`: `createQpdf` and its options, the `Qpdf` methods with their option and result types, `QpdfError` and its `code` values, and `qpdfVersion`;
- the documented behaviour: exit-code handling, how inputs are transferred, and `run()` file semantics.

| Change | Version |
|---|---|
| Breaking change to the above, including raising the minimum Node (24) or TypeScript (5.7) version | **major** |
| New bundled qpdf version, new helpers or options | **minor** |
| Fixes, Emscripten updates, docs, CI | **patch** |

A qpdf update that changes PDF output bytes is not breaking. A qpdf update that removes a feature the typed helpers rely on would be released as a major.

qpdf releases are picked up automatically and land as tested pull requests. The bundled qpdf version is in
`qpdfVersion`, at the top of this README, and in the [CHANGELOG](./CHANGELOG.md).
```

- [ ] **Step 5: Update AGENTS.md**

(a) Add hard rule 9 after rule 8 in "## Hard rules":

```markdown
9. **Every GitHub Action is pinned to a full commit SHA** with a `# vX.Y.Z` comment (enforced by `test/unit/repo-policy.test.ts`); Dependabot updates them. The Emscripten image is pinned by digest (`build/emsdk-digest`).
```

(b) Replace the whole "### Cut a release" section body with:

```markdown
1. Make sure `main` is green. Add a CHANGELOG section `## X.Y.Z — YYYY-MM-DD` at the top (`test/unit/repo-policy.test.ts` checks it matches `package.json`).
2. `npm version <patch|minor|major> --no-git-tag-version`, commit `package.json`, `package-lock.json` and `CHANGELOG.md` as `release: vX.Y.Z`, and merge to `main`.
3. On `main` (after `git pull`): `git tag -a vX.Y.Z -m "release: vX.Y.Z" && git push origin vX.Y.Z`.
4. `release.yml` runs three jobs:
   - `build`: `scripts/check-release-ref.sh` (the tag must match `package.json` and be on `main`), then the wasm, dist, package checks, and `npm pack` → artifact;
   - `test`: all tests; the browser tests install that artifact via `QPDF_TARBALL`;
   - `publish`: the only job with `id-token: write`. No checkout or installs; it runs `npm publish <tarball> --provenance` through npm trusted publishing (OIDC).

   Keep it that way: never run `npm ci` or the fixtures in the job that can publish.
5. Check: `npm view @mssio/qpdf-wasm version`. A new version can take a few minutes to appear.

Trusted publisher on npmjs.com: `mssio` / `qpdf-wasm` / `release.yml`, environment empty. No npm token is used.
```

(c) Add a new section before "## Known gotchas":

```markdown
## Repository settings (GitHub, set once by the maintainer)

- **Settings → Rules → Rulesets → New branch ruleset** for `main`:
  - require a pull request before merging;
  - require status check **`verify`** (from the CI workflow);
  - block force pushes;
  - restrict deletions.

  Add the maintainer to the bypass list for emergencies.
- **Settings → Actions → General:**
  - workflow permissions **"Read repository contents and packages permissions"**; the workflows request more per job;
  - enable **"Allow GitHub Actions to create and approve pull requests"**, which the `qpdf-update` workflow needs.
```

(d) In the "Verification before claiming done" table, add:

```markdown
| `.github/dependabot.yml` | schema validation (see the Task 5 command in `docs/superpowers/plans/2026-10-06-v1-hardening.md`) |
```

- [ ] **Step 6: Run the release-metadata test and doc checks**

Run: `npx vitest run test/unit/repo-policy.test.ts && npm run check:readme`
Expected: every policy block passes (Node, pinning, Emscripten, release metadata), and `README recipes in sync (10 recipes)`.

- [ ] **Step 7: Full clean-tree verification**

```bash
git status --short          # expected: only this task's edits
rm -rf dist out src/wasm/*.mjs src/wasm/*.wasm
ls src/wasm/*.d.mts         # the committed declarations must still be there
npm ci --ignore-scripts && npm audit signatures
bash scripts/ci.sh
```

Expected:
- `npm audit signatures` exits 0;
- `ci.sh` passes every step: build:wasm with the digest-pinned image, check-generated, typecheck, all tests (now including repo-policy and release-ref), build, lint:package, check:package, check:readme, browser tests 9/9, and the size line;
- afterwards `git status --short` shows only this task's intended edits;
- no server is left on ports 4301–4303.

- [ ] **Step 8: Commit**

```bash
git add README.md AGENTS.md CHANGELOG.md package.json package-lock.json test/unit/repo-policy.test.ts
git commit -m "release: v1.0.0" \
  -m "Stable API under semver; Node >= 24; hardened CI and release." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DByphsgjacP6AzPdW1wceG"
git tag -l 'v1.0.0'         # expected: no output (no tag on the branch)
```

---

### Task 7: Tag and release 1.0.0 (Claude, after the maintainer merges and pushes `main`)

This task is not dispatched to a subagent. Claude runs it after the maintainer says `main` is merged and pushed. Pushing the tag publishes to npm; the user authorised Claude to do this on 2026-10-06 (spec §6).

**Files:** none.

- [ ] **Step 1: Pre-flight checks. Stop and report if any fails.**

```bash
git fetch origin --tags
git switch main && git pull --ff-only
node -p "require('./package.json').version"                      # expected: 1.0.0
git merge-base --is-ancestor HEAD origin/main && echo on-main     # expected: on-main
git ls-remote --tags origin v1.0.0                                # expected: no output
gh run list --repo mssio/qpdf-wasm --branch main --workflow CI --limit 1 \
  --json headSha,status,conclusion -q '.[0]'
```

Expected: the latest CI run's `headSha` equals `git rev-parse HEAD`, with `status: completed` and `conclusion: success`. If it's still running, wait for it with `gh run watch <id> --exit-status`.

Then **ask the user to confirm**:
- trusted publishing is configured on npmjs.com (`mssio` / `qpdf-wasm` / `release.yml`, environment empty);
- the npm token and the `NPM_TOKEN` secret are deleted.

Do not continue without that confirmation.

- [ ] **Step 2: Tag and push**

```bash
git tag -a v1.0.0 -m "release: v1.0.0"
git push origin v1.0.0
```

- [ ] **Step 3: Watch the Release run and confirm the publish**

```bash
run=$(gh run list --repo mssio/qpdf-wasm --workflow Release --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$run" --repo mssio/qpdf-wasm --exit-status --interval 30
until npm view @mssio/qpdf-wasm@1.0.0 version >/dev/null 2>&1; do sleep 15; done   # run in the background
npm view @mssio/qpdf-wasm version
```

Expected: `build`, `test` and `publish` all succeed; the `publish` log shows "Signed provenance statement" and `+ @mssio/qpdf-wasm@1.0.0`; `npm view` prints `1.0.0`.

If `publish` fails with an auth error, report the log lines. The first things to check are the trusted-publisher settings: `mssio` / `qpdf-wasm` / `release.yml`, environment empty. Don't retry with a token, and don't delete the tag without the user's say-so.

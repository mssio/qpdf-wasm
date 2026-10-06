# @mssio/qpdf-wasm 1.0.0: Node 24, latest dependencies, hardening — Design

- **Date:** 2026-10-06
- **Status:** Draft for review
- **Builds on:** `docs/superpowers/specs/2026-10-05-qpdf-wasm-design.md` (still the source of truth for architecture; this spec changes only what it lists)
- **Branch:** `chore/v1-hardening`

## 1. Goal

Release `@mssio/qpdf-wasm@1.0.0` with a stable-API promise. Before that:
- align everything on Node 24 LTS;
- bring every dependency and CI action to its latest stable version;
- close the remaining supply-chain gaps in CI and release, and keep dependencies current automatically from then on.

### Success criteria

1. `engines`, `.nvmrc`, CI and `@types/node` all say Node 24.
2. Every npm dev dependency, fixture tool and GitHub Action is on its latest stable release, with one documented exception (§3.2).
3. Every GitHub Action is pinned to a full commit SHA, and the Emscripten image is pinned by digest.
4. Dependabot opens grouped weekly PRs for npm and for GitHub Actions.
5. The release workflow refuses tags that are not on `main`, and CI verifies npm registry signatures.
6. `package.json` and the CHANGELOG say `1.0.0`. A clean-tree `bash scripts/ci.sh` passes, including 9/9 browser tests. The implementation creates **no** tag on the branch. Claude creates and pushes `v1.0.0` on `main` once the merged `main` is on GitHub and green (§6), because §5.4 rejects tags that are not on `main`.

### Non-goals

- No API, behaviour or build-flag changes.
- No qpdf or Emscripten version bump. Both are already the latest: qpdf v12.4.2, Emscripten 6.0.11. The original spec forbids bundling either with other changes anyway.
- No Node 22 support or Node 22 CI job.
- Branch protection is a GitHub setting the maintainer configures. This spec only documents the exact settings (§5.6).

## 2. Current state (verified 2026-10-06)

| Item | Current | Latest stable |
|---|---|---|
| Node in CI / `.nvmrc` | 24 | 24.21.0 LTS ("Krypton") |
| `engines.node` | `>=20.16` | — |
| `@types/node` | 26.6.4 | 26.6.4 (latest 24.x: 24.19.1) |
| vitest | 4.1.11 | **5.0.3** |
| typescript | 7.0.2 | 7.0.2 |
| @playwright/test | 1.63.0 | 1.63.0 |
| @arethetypeswrong/cli | 0.18.5 | 0.18.5 |
| publint | 0.3.25 | 0.3.25 |
| vite (fixture) | 8.3.3 | 8.3.3 |
| webpack / webpack-cli (fixture) | 5.111.1 / 7.2.3 | same |
| actions/checkout | v6 | **v7.0.1** (`3d3c42e5aac5ba805825da76410c181273ba90b1`) |
| actions/setup-node | v6 | **v7.0.0** (`820762786026740c76f36085b0efc47a31fe5020`) |
| actions/upload-artifact | v7 | v7.0.1 (`043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`) |
| actions/download-artifact | v8 | v8.0.1 (`3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c`) |
| emscripten/emsdk image | tag `6.0.11` | digest `sha256:cdefec943f04fd4b2b2fe23b0a1a346be9fc560ef5784a83faa27dd351381372` (multi-arch index) |

The implementation re-checks this table on the day it runs, and uses whatever is latest then.

## 3. Node 24 and dependency updates

### 3.1 Node 24

- `package.json`: `"engines": { "node": ">=24" }`.
  - Rationale: Node 24 is the only version CI tests, and Node 20 is end-of-life.
  - Browser consumers are unaffected; Node 22 users get an engine warning.
- `.nvmrc` stays `24`. Every `setup-node` step uses `node-version: 24`; they already do.
- README "Node.js" section and AGENTS.md commands table: say Node ≥ 24.
- The `process.getBuiltinModule` comment in `src/wasm-loader.ts` mentions Node 20.16. Keep the mechanism, which still matters to keep bundlers away from Node built-ins, but update the comment to say Node ≥ 24.

### 3.2 npm dev dependencies

- `vitest` → latest 5.x.
  - The project imports only `vitest` and `vitest/config`. None of the entry points removed in Vitest 5 are used (`vitest/coverage`, `vitest/reporters`, `vitest/environments`, `vitest/snapshot`, `vitest/runners`, `vitest/suite`, `vitest/mocker`, `vitest/internal/module-runner`).
  - Follow the official Vitest 5 migration guide for anything else the test run surfaces.
  - Also check the `nesting.test.ts` worker-thread harness, which uses `module.registerHooks` to load `.ts`.
- `@types/node` → **latest 24.x** (`^24`), not 26.x.
  - This is the one deliberate exception to "latest". Type definitions must match the runtime, or code that uses Node 26-only APIs would typecheck but fail on Node 24.
- All other dev dependencies → latest, re-checked with `npm outdated` at implementation time.
- Regenerate `package-lock.json` with `npm install` and commit it.

### 3.3 Fixture tools

`test/browser/fixtures/*/package.json` keep **exact** versions. Bump them to the latest at implementation time if newer than in §2. Keeping them current from then on is Dependabot's job (§5.3).

### 3.4 GitHub Actions

- `actions/checkout` → v7.x and `actions/setup-node` → v7.x. These are major bumps.
- Before bumping, read both release notes. Confirm these still behave the same:
  - checkout: `persist-credentials: false`, `submodules: recursive`, `fetch-depth`;
  - setup-node: `registry-url`, `package-manager-cache`, `cache: npm`.
- Adjust inputs if any were renamed.
- `upload-artifact` / `download-artifact`: stay on the latest v7 / v8.

## 4. Version 1.0.0

### 4.1 Stability promise

From 1.0.0, semver applies to the public API (README "Versioning" section, updated):
- **Public API:** everything exported from the package entry:
  - `createQpdf` and its options;
  - the `Qpdf` methods and their option and result types;
  - `QpdfError` and its `code` values;
  - `qpdfVersion`.
- **Documented behaviour** is also covered: exit-code handling, input transfer rules, and `run()` file semantics.
- **Major (2.0.0):** any breaking change to the above. That includes raising `engines.node` or the minimum TypeScript version (≥ 5.7).
- **Minor:** a new bundled qpdf version, new helpers, new options. A qpdf update that changes PDF output byte-for-byte is not breaking. A qpdf update that removes a feature the typed helpers rely on would be breaking, and is handled as a major.
- **Patch:** fixes, an Emscripten update, docs, CI.

### 4.2 Version bump

- CHANGELOG: add `## 1.0.0 — <release date>` above `## 0.1.0`, listing:
  - Node ≥ 24 (`engines` raised from `>=20.16`, called out as the breaking change from 0.x);
  - the stability promise;
  - "no API changes since 0.1.0";
  - the hardening items.
- Bump with `npm version 1.0.0 --no-git-tag-version`, then commit `package.json`, `package-lock.json` and the CHANGELOG as `release: v1.0.0`.
- No tag is created on the branch (§6).

## 5. Hardening

### 5.1 Pin every GitHub Action to a full commit SHA

- Every `uses:` in `.github/workflows/*.yml` becomes `owner/repo@<40-char sha> # vX.Y.Z`.
- SHAs are resolved at implementation time from the release tag (`gh api repos/<owner>/<repo>/commits/<tag> -q .sha`). The §2 SHAs are the values as of today.
- A test, `test/unit/repo-policy.test.ts`, fails if any `uses:` in `.github/workflows/*.yml` is not a 40-hex SHA followed by a `# v…` comment. This keeps unpinned actions from creeping back in.

### 5.2 Pin the Emscripten image by digest

- New file `build/emsdk-digest` holds the multi-arch index digest (`sha256:…`). `build/emsdk-version` keeps the version, which `meta.mjs` and the existing test compare against.
- `scripts/build-wasm.sh` runs `emscripten/emsdk:${EMSDK_VERSION}@${EMSDK_DIGEST}`. Docker verifies the digest and fails if the tag was moved.
- AGENTS.md "Upgrade Emscripten" adds a step for the digest:

  ```sh
  docker buildx imagetools inspect emscripten/emsdk:<v> | grep Digest
  ```

  (Dependabot can't update a digest outside a Dockerfile.)

### 5.3 Dependabot

`.github/dependabot.yml`:
- **npm, `/`:** weekly. One grouped PR for all dev dependencies, with majors in a separate group so they get individual attention.
- **npm, `/test/browser/fixtures/vite-app` and `/test/browser/fixtures/webpack-app`:** weekly, grouped, with `ignore` for `@mssio/qpdf-wasm`. That dependency is a `file:` tarball that only exists after `npm pack`.
- **github-actions, `/`:** weekly, grouped. Dependabot updates the SHA pins and their version comments together.
- `open-pull-requests-limit` stays modest (5). Commit-message prefixes: `chore(deps)` for npm, `ci(deps)` for actions.

Dependabot PRs run `ci.yml` normally; unlike `GITHUB_TOKEN` PRs, they do trigger workflows.

**Risk:** Dependabot may fail to update a fixture whose `file:` dependency path doesn't exist. Verify after the first scheduled run. If it fails, drop the two fixture entries and rely on the root group plus a note in AGENTS.md to bump the fixture pins by hand.

### 5.4 Release only from `main`

In `release.yml`'s `build` job, after the tag/version check:
- The check lives in `scripts/check-release-ref.sh <tag> <sha>`, which replaces the inline tag/version step and is tested by `test/node/release-ref.test.ts`. The `build` job checks out with `fetch-depth: 0`. The script fails unless the tag equals `v` + the `package.json` version and `git merge-base --is-ancestor "$GITHUB_SHA" origin/main` holds.
- The message must say the tag must point at a commit on `main`.
- The checkout keeps `persist-credentials: false`. Fetching a public repo needs no credentials.

### 5.5 Verify npm registry signatures

- After every `npm ci` in `ci.yml` and `release.yml`, run `npm audit signatures`. It fails on missing or invalid registry signatures or provenance attestations.
- Not run on the fixture installs, which have no lockfile; Dependabot and exact pins cover those.

### 5.6 Branch protection (maintainer step, documented only)

AGENTS.md gets a "Repository settings" section, to set once on GitHub:
- Settings → Rules → Rulesets → new branch ruleset for `main`:
  - require a pull request before merging;
  - require status check `CI / verify` to pass;
  - block force pushes;
  - restrict deletions.
- Allow the maintainer to bypass in an emergency.
- Settings → Actions → General: workflow permissions "Read repository contents" by default. The workflows already request what they need per job.

## 6. Release procedure for 1.0.0

The maintainer asked Claude to create and push the `v1.0.0` tag after `main` is pushed (2026-10-06). Pushing the tag publishes to npm.

1. **Maintainer:** merge `chore/v1-hardening` into `main` and push `main`. If branch protection is on, do it through a PR.
2. **Claude, before tagging, checks and stops if any check fails:**
   - `origin/main` contains the merged work and its `package.json` version is `1.0.0`;
   - the CI run for that `main` commit has passed (`gh run list --branch main`);
   - the maintainer confirms that trusted publishing is configured on npmjs.com and `NPM_TOKEN` is deleted. Claude can't see npm settings. 1.0.0 is the first release published through trusted publishing (OIDC).
3. **Claude:** on that `main` commit, tag the release and push the tag:

   ```sh
   git tag -a v1.0.0 -m "release: v1.0.0"
   git push origin v1.0.0
   ```

   The release workflow checks that the tag matches `package.json` (`1.0.0`) and is on `main`.
4. **Claude:** watch the Release run to the end and confirm `npm view @mssio/qpdf-wasm version` shows `1.0.0`. If the publish job fails with an auth error, report it; the trusted-publisher settings are the first thing to check:
   - `mssio` / `qpdf-wasm` / `release.yml`;
   - environment empty.

## 7. Testing

- **Unit:** the new `repo-policy.test.ts` (§5.1; also checks Node alignment, the emsdk digest format and CHANGELOG/version agreement) and `test/node/release-ref.test.ts` (§5.4). The existing suite runs unchanged under Vitest 5.
- **Typecheck:** passes against `@types/node@24`.
- **Validation:** `npx --yes @action-validator/cli` on every workflow, plus `dependabot.yml` against GitHub's schema. Use action-validator's support for it if present; otherwise `npx --yes ajv-cli` with the published schema.
- **Full verification:** a clean-tree `bash scripts/ci.sh` with the digest-pinned image. Every step must pass, with 9/9 browser tests.
- **First real run on GitHub:**
  - CI on the PR;
  - Dependabot's first scheduled run (§5.3 risk);
  - the 1.0.0 release run (OIDC publish).

## 8. Documentation

- **README:**
  - Node ≥ 24;
  - "Versioning" rewritten per §4.1.
- **AGENTS.md:**
  - Node 24;
  - the digest step in "Upgrade Emscripten";
  - the Dependabot note;
  - the SHA-pinning rule (new hard rule: "Every action is pinned to a commit SHA; Dependabot updates them");
  - "Repository settings" (§5.6);
  - the release procedure without the bootstrap-token steps, which are done.
- **CHANGELOG:** §4.2.

# AGENTS.md — @mssio/qpdf-wasm

## What this is

[qpdf](https://github.com/qpdf/qpdf), compiled **unmodified** to WebAssembly with Emscripten and
published to npm as `@mssio/qpdf-wasm`. A typed Promise API runs qpdf in a Web Worker (browser)
or inline (Node). The design source of truth is
`docs/superpowers/specs/2026-10-05-qpdf-wasm-design.md`. Read it before changing architecture.

## Repo map

| Path | Responsibility |
|---|---|
| `vendor/qpdf` | qpdf git submodule pinned to a release tag. **Read-only.** |
| `build/` | Wasm build: `emsdk-version` (pinned Emscripten), `build.sh` (runs in Docker; also regenerates `THIRD_PARTY_NOTICES.md` and README's qpdf version line), `qpdf-version.sh`, `patches/` |
| `scripts/` | Host-side tooling: Docker wrapper, dist copy, package/README/size checks, `check-generated.sh` (build output committed?), browser-test helpers, `ci.sh` |
| `src/wasm/` | Generated `qpdf.mjs`/`qpdf.wasm`/`meta.mjs` (gitignored) + committed `.d.mts` declarations |
| `src/jobs/` | Pure functions: options → qpdf job JSON (`JobSpec`). One file per helper |
| `src/errors.ts` | `QpdfError` and stderr classification (the only place that matches qpdf message text) |
| `src/input.ts` | `PdfInput` → `Uint8Array` (copy/detach rules) |
| `src/engine.ts` | Runs one `JobSpec` in a **fresh** module instance over MEMFS |
| `src/wasm-loader.ts` | Finds and compiles `qpdf.wasm` (fetch, or `file:` in Node) |
| `src/inline-executor.ts`, `src/worker-pool.ts` | The two `Executor`s (calling thread / Web Workers) |
| `src/worker.ts`, `src/worker-handler.ts`, `src/protocol.ts`, `src/transfer.ts` | Worker entry, its logic, message types, transfer lists |
| `src/api.ts`, `src/index.ts` | Typed helpers over an `Executor`; public exports |
| `examples/` | README recipes. **Executed by tests and embedded verbatim in README** |
| `test/unit` · `test/node` · `test/browser` · `test/types` | No-wasm tests · real-wasm Node tests · Playwright + Vite/webpack fixture apps · consumer type tests (checked by `typecheck`) |

## Commands

| Command | Needs | Does |
|---|---|---|
| `git submodule update --init` | git | Fetch `vendor/qpdf` |
| `npm ci` | Node 24 | Install dev deps |
| `npm run build:wasm` | Docker | Build `src/wasm/*`, regenerate `THIRD_PARTY_NOTICES.md` and README's qpdf version line (~1 min) |
| `bash scripts/check-generated.sh` | build:wasm | Fails if the regenerated notices/README differ from what is committed |
| `npm run typecheck` | — | `tsc --noEmit` |
| `npm run test:unit` | — | Unit tests (no wasm) |
| `npm run test:node` | build:wasm | Real-wasm integration tests |
| `npm test` | build:wasm | Unit + Node tests |
| `npm run build` | build:wasm | `dist/` (tsc + copy wasm) |
| `npm run lint:package` | build | publint + are-the-types-wrong |
| `npm run check:package` | build | Tarball contents check |
| `npm run check:readme` | — | README embeds every `examples/*.mjs` verbatim |
| `npx playwright install --with-deps` then `npm run test:browser` | build | Browser tests (Chromium/Firefox/WebKit; Vite build, Vite dev, webpack 5). `QPDF_TARBALL=<path>` tests an existing tarball instead of packing |
| `bash scripts/ci.sh` | Docker, browsers | Everything CI runs, in order |
| `npx --yes @action-validator/cli .github/workflows/<file>.yml` | — | Validate a workflow after editing it |

## Hard rules

1. **Never edit `vendor/qpdf`.** Wasm concerns go in `build/build.sh`; unavoidable changes go in `build/patches/` (see its README).
2. **Never bump qpdf and Emscripten in the same PR.**
3. **Typed helpers go through qpdf job JSON** (`--job-json-file`), never qpdf C++ internals or ad-hoc CLI strings.
4. **One fresh module instance per job.** Never cache or reuse a module instance; qpdf has process-global state. Cache only the compiled `WebAssembly.Module`.
5. **No Node built-in imports in `src/`.** Use `process.getBuiltinModule` (see `src/wasm-loader.ts`) so bundlers never see them.
6. **qpdf message text is matched only in `src/errors.ts`**, and every pattern has a test.
7. **Every API change updates, in the same PR:** `src/types.ts`, tests, `examples/` + README, AGENTS.md if workflow changed, CHANGELOG.md.
8. **Never commit build output** (`dist/`, `out/`, `src/wasm/*.mjs|wasm`) and **never publish from a local machine**; releases come only from `.github/workflows/release.yml`.

## How to

### Upgrade qpdf

The weekly `qpdf-update` workflow does this automatically and opens `chore: qpdf vX.Y.Z` with the CI result and size delta. By hand:

```bash
git -C vendor/qpdf fetch --depth 1 origin tag vX.Y.Z && git -C vendor/qpdf checkout vX.Y.Z
npm run build:wasm            # also regenerates THIRD_PARTY_NOTICES.md
bash scripts/ci.sh
```

If it fails, check in this order:
- build flags or CMake options renamed (read qpdf's `README-maintainer.md` / release notes)
- job-JSON keys changed (`vendor/qpdf/job.yml`, `libqpdf/qpdf/auto_job_schema.hh`)
- stderr wording changed (`src/errors.ts` tests fail)

Commit the submodule, the regenerated notices and README, and a CHANGELOG entry ("Bundles qpdf X.Y.Z"). Release as a **minor** version.

### Upgrade Emscripten

Change `build/emsdk-version`, then run `npm run build:wasm && bash scripts/ci.sh`. Separate PR. Note the size delta in the PR.

### Add a typed helper

1. `src/jobs/<name>.ts`: pure builder returning a `JobSpec` via `jobSpec()`, plus a unit test in `test/unit/jobs.test.ts`. Validate the job JSON against `vendor/qpdf/libqpdf/qpdf/auto_job_schema.hh`.
2. Add types to `src/types.ts`, the method to `Qpdf`, and the wiring in `src/api.ts`.
3. Integration test in `test/node/api.test.ts` that verifies the output with qpdf itself.
4. Recipe `examples/<name>.mjs`, a test in `test/node/recipes.test.ts`, the recipe pasted into README, and a CHANGELOG entry.

### Cut a release

1. Make sure `main` is green. Move CHANGELOG "Unreleased" to the new version.
2. `npm version <patch|minor|major> -m "release: v%s"` (creates the tag).
3. `git push --follow-tags`. `release.yml` runs three jobs: `build` (tag must match `package.json`; wasm, dist, package checks, `npm pack` → artifact), `test` (all tests; browser tests install that artifact via `QPDF_TARBALL`), and `publish` (the only job with `id-token: write`; no checkout or installs, just `npm publish <tarball> --provenance`). Keep it that way: never run `npm ci`/fixtures in the job that can publish.
4. **First release only:**
   - Enable GitHub → repo Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests" (the `qpdf-update` workflow needs it to open PRs).
   - Before tagging: create a 7-day granular npm token (read+write) and add it as the Actions secret `NPM_TOKEN`.
   - After the publish: on npmjs.com → package → Settings → Trusted Publisher → GitHub Actions, set `mssio` / `qpdf-wasm` / `release.yml` and allow `npm publish`. Optionally enable "require 2FA and disallow tokens".
   - Then delete the token and the `NPM_TOKEN` secret.

## Known gotchas

- qpdf exit code **3 = success with warnings**. Helpers resolve and return `warnings`.
- The Emscripten glue is built `ENVIRONMENT=web,worker`. In Node it only works because the engine passes `instantiateWasm`. Never call `createQpdfModule()` without it.
- Inputs are **transferred** to the worker. A caller's whole-buffer `Uint8Array`/`ArrayBuffer` becomes detached; `src/input.ts` turns reuse into a clear `TypeError`.
- The transfer list must contain unique buffers (`src/transfer.ts`), or `postMessage` throws `DataCloneError`.
- `Blob` inputs need `await blob.arrayBuffer()` (done in `toBytes`).
- The emsdk Docker image has no Ninja: use `-G "Unix Makefiles"`.
- qpdf's CMake uses its **own** dependency variables: `ZLIB_H_PATH`, `ZLIB_LIB_PATH`, `LIBJPEG_H_PATH`, `LIBJPEG_LIB_PATH`.
- Split output names: `out-1.pdf` for one page per file, `out-1-2.pdf` for ranges. Sort numerically (`collectSplitOutputs`).
- 256-bit encryption with a user password but an empty owner password is refused by qpdf (exit 2).
- The wasm is linked with `-sSTACK_SIZE=8MB -Wl,--stack-first`. qpdf recurses on nested objects; Emscripten's 64 KB default overflowed into static data (random traps, corruption, an endless loop). `test/node/nesting.test.ts` guards it, running each job in a `worker_threads` worker so a hang fails by timeout. Never lower the stack. (`-sSTACK_FIRST` is internal in Emscripten 6.0.11; `-Wl,--stack-first` is the supported switch.)
- `THIRD_PARTY_NOTICES.md` covers qpdf, zlib, libjpeg, Emscripten (glue + system libs), musl, and libc++/libc++abi (Apache-2.0 WITH LLVM-exception). `build.sh` fails if a license file is missing; if an Emscripten upgrade moves one, fix the path there.
- README's qpdf version sits between `<!-- qpdf-version -->` markers; `build.sh` rewrites it. Don't edit that line by hand or remove the markers.
- Browser fixtures pin vite, webpack and webpack-cli to exact versions and install with `--ignore-scripts`; bump the pins deliberately. The webpack fixture sets `resolve.tsconfig: false`, otherwise webpack ≥ 5.106 follows the repo's `tsconfig.json` `paths` to `src/` and the tarball goes untested.
- Workflows check out with `persist-credentials: false`; `qpdf-update.yml` hands its write token only to the push step. Keep tokens out of steps that install or run dependencies.
- PRs opened by the update workflow's `GITHUB_TOKEN` do not trigger `ci.yml`. The update workflow therefore runs `scripts/ci.sh` itself and reports the result in the PR body.

## Verification before claiming done

| Change | Must pass |
|---|---|
| `src/jobs/*`, `src/errors.ts`, `src/input.ts` | `npm run typecheck && npm test` |
| `src/engine.ts`, `src/api.ts`, executors, worker | the above + `npm run build && npm run test:browser` |
| `build/*`, qpdf/Emscripten bump | `bash scripts/ci.sh` (everything) |
| `package.json`, exports, files | `npm run build && npm run lint:package && npm run check:package && npm run test:browser` |
| README/examples | `npm run check:readme && npm run test:node` |
| `.github/workflows/*` | `npx --yes @action-validator/cli <each changed workflow>` |

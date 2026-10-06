# @mssio/qpdf-wasm — Design

- **Date:** 2026-10-05
- **Status:** Draft for review
- **Package:** `@mssio/qpdf-wasm` (npm)
- **Repository:** https://github.com/mssio/qpdf-wasm (git remote `origin`)

## 1. Goal

Ship [qpdf](https://github.com/qpdf/qpdf) as a WebAssembly library that any single-page app (React, Vue, Svelte, Angular, vanilla) can install from npm and use client-side, with the full qpdf feature set, without freezing the UI, and with qpdf upgrades that are routine rather than porting projects.

### Success criteria

1. `npm install @mssio/qpdf-wasm` works in a Vite or webpack 5 SPA with zero bundler configuration.
2. Every qpdf CLI capability is reachable from JS (via `run()`); common operations have typed helpers.
3. Jobs run in a Web Worker; the main thread stays responsive.
4. A new qpdf release becomes a tested pull request automatically; merging it and tagging produces an npm release with no manual build steps.
5. The published package satisfies the licenses of qpdf, zlib, and libjpeg.

### Non-goals (v1)

Framework adapters (`useQpdf()` etc.), streaming of files larger than memory, multithreaded wasm (pthreads/SharedArrayBuffer), CDN/UMD build, server-side-only optimisations. Each can be added later without breaking the v1 API.

## 2. Feasibility evidence (spike, 2026-10-05)

A throwaway spike built qpdf 12.4.2 (master `4eba958`) with Emscripten 6.0.11 in the `emscripten/emsdk` Docker image:

- **No qpdf source changes were needed.**
- Compile time ~25 s; `qpdf.wasm` 2.2 MB (705 KB gzip) + 63 KB JS glue; module init 16 ms.
- In Node: `--check`, `--linearize`/`--check-linearization`, AES-256 encrypt→decrypt round trip, merge, split, rotate, compress, and `--json` all succeeded in ≤30 ms on ~30 KB fixtures.
- **Defect found:** calling `callMain` repeatedly on one module instance broke `--json` (`QPDFLogger: called setSave on standard output after standard output has already been used`). qpdf keeps process-global state. → Design uses a fresh module instance per job (§4.3).
- Cosmetic: program name in messages defaults to the script name → set `thisProgram: "qpdf"`.
- Not yet verified: browser execution, large-file performance/memory.

## 3. Build

### 3.1 Inputs (all pinned)

| Input | Pin | Mechanism |
|---|---|---|
| qpdf | release tag, e.g. `v12.4.2` | git submodule at `vendor/qpdf` |
| Emscripten | exact version, e.g. `6.0.11` | Docker image tag `emscripten/emsdk:6.0.11` in `build/emsdk-version` |
| zlib | whatever the pinned Emscripten port provides | `embuilder build zlib` |
| libjpeg | whatever the pinned Emscripten port provides (IJG v9f at spike time) | `embuilder build libjpeg` |
| Crypto | qpdf native crypto | `-DREQUIRE_CRYPTO_NATIVE=ON -DUSE_IMPLICIT_CRYPTO=OFF` |

**Rule: qpdf source is never edited.** Wasm-specific concerns live in `build/build.sh`. If a patch ever becomes unavoidable, it is stored as `build/patches/NNNN-description.patch`, applied at build time, and documented in `build/patches/README.md` with the upstream issue link, so every upgrade shows whether it still applies.

### 3.2 Build script (`build/build.sh`, run inside the Docker image)

1. `embuilder build zlib libjpeg`.
2. `emcmake cmake -S vendor/qpdf -B out/cmake -G "Unix Makefiles"` with:
   - `-DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DBUILD_STATIC_LIBS=ON -DBUILD_DOC=OFF`
   - crypto flags from §3.1
   - qpdf's own dependency variables: `ZLIB_H_PATH`, `ZLIB_LIB_PATH`, `LIBJPEG_H_PATH`, `LIBJPEG_LIB_PATH` pointing into the Emscripten sysroot
   - C/C++ flags: `-O3 -fwasm-exceptions`
   - Linker flags: `-fwasm-exceptions -sALLOW_MEMORY_GROWTH=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createQpdfModule -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sENVIRONMENT=web,worker -sEXPORTED_RUNTIME_METHODS=FS,callMain` (web/worker only: Emscripten's Node code contains `import("node:module")`, which breaks webpack; verified 2026-10-05 that this glue runs in Node when `instantiateWasm` is supplied, which the engine always does)
3. `make -j$(nproc) qpdf` (only the CLI target; tests and examples are not built).
4. Copy `qpdf.js` → `dist/wasm/qpdf.mjs` and `qpdf.wasm` → `dist/wasm/qpdf.wasm`.
5. Regenerate `THIRD_PARTY_NOTICES.md` with the full license texts actually used (qpdf `LICENSE.txt` + `NOTICE.md`, zlib `LICENSE` and libjpeg `README` from the Emscripten port sources). The full texts live in that one file; there is no separate `dist/licenses/`.

A host-side wrapper `npm run build:wasm` invokes Docker with the pinned image; the TypeScript build (`npm run build`) is separate and needs no Docker.

## 4. Runtime architecture

### 4.1 Layout

```
src/
  index.ts       createQpdf(), QpdfError, public types, qpdfVersion
  client.ts      main thread: worker pool, job queue, Promise bridging, transferables
  worker.ts      worker entry: loads/compiles wasm once, runs each job in a fresh instance
  engine.ts      pure function: (wasmModule, job) → result; used by worker and inline mode
  jobs/          one file per typed helper → builds a qpdf job-JSON object
  run.ts         raw CLI escape hatch
build/           build.sh, emsdk-version, patches/
vendor/qpdf      submodule
test/            unit/, node/, browser/, fixtures/
```

Each unit has one responsibility: `jobs/*` only translate options to job JSON (pure, unit-testable); `engine.ts` only executes a job against a compiled module; `worker.ts` only hosts the engine; `client.ts` only does transport and scheduling.

### 4.2 Public API

```ts
type PdfInput = Uint8Array | ArrayBuffer | Blob;

interface CreateQpdfOptions {
  wasmUrl?: string | URL;   // default: new URL("./wasm/qpdf.wasm", import.meta.url)
  workers?: number;         // default 1
  inline?: boolean;         // run on the calling thread; default true where global Worker is undefined (Node), else false
}

interface QpdfResult { output: Uint8Array; warnings: string[] }

interface Qpdf {
  merge(inputs: PdfInput[], opts?: { password?: string[] }): Promise<QpdfResult>;
  split(input: PdfInput, opts?: { pagesPerFile?: number; password?: string }):
    Promise<{ outputs: Uint8Array[]; warnings: string[] }>;
  selectPages(input: PdfInput, ranges: string, opts?: { password?: string }): Promise<QpdfResult>; // qpdf range syntax "1-3,7,z"
  rotate(input: PdfInput, rotations: { angle: 90 | 180 | 270 | -90; pages?: string }[],
    opts?: { password?: string }): Promise<QpdfResult>;
  encrypt(input: PdfInput, opts: {
    userPassword: string; ownerPassword: string; bits?: 256 | 128; // default 256
    allow?: { print?: boolean; modify?: boolean; extract?: boolean; annotate?: boolean };
  }): Promise<QpdfResult>;
  decrypt(input: PdfInput, opts: { password: string }): Promise<QpdfResult>;
  linearize(input: PdfInput, opts?: { password?: string }): Promise<QpdfResult>;
  compress(input: PdfInput, opts?: { password?: string; level?: number }): Promise<QpdfResult>; // object streams + recompress flate
  info(input: PdfInput, opts?: { password?: string }): Promise<{
    pdfVersion: string; pageCount: number; encrypted: boolean; warnings: string[];
  }>;
  run(args: string[], opts?: { files?: Record<string, PdfInput> }):
    Promise<{ exitCode: number; stdout: string; stderr: string; files: Record<string, Uint8Array> }>;
  terminate(): void;
}

export function createQpdf(opts?: CreateQpdfOptions): Promise<Qpdf>;
export const qpdfVersion: string;   // e.g. "12.4.2", generated at build time
export class QpdfError extends Error {
  code: "INVALID_PASSWORD" | "INVALID_PDF" | "FAILED" | "TERMINATED";
  exitCode: number | null; stderr: string;
}
```

- Typed helpers build a qpdf **job JSON** object (qpdf's documented, versioned interface), write it to `/job.json` in MEMFS, and run `--job-json-file=/job.json`. They never depend on qpdf C++ internals.
- `run()` passes `args` to `callMain` verbatim. `files` are written to MEMFS at the given paths before the run (relative paths resolve against `/work`, the working directory). After the run, every regular file under `/work` that was not an input is returned in `files`, keyed by its path relative to `/work`. Because each job uses a fresh instance (§4.3), this is exactly the set of files the job produced — including split outputs whose count the caller cannot know in advance.
- `run()` never throws for non-zero exit codes; it returns them. It rejects only for transport failures or `terminate()`.

### 4.3 Job lifecycle

1. `createQpdf()` starts the worker(s); the worker fetches and compiles `qpdf.wasm` once via `WebAssembly.compileStreaming` and caches the `WebAssembly.Module`. Nothing is downloaded until `createQpdf()` is called.
2. A helper call normalises inputs to `Uint8Array` (`Blob` → `arrayBuffer()`), posts `{ job, files }` to a free worker with the buffers listed as transferables.
3. The worker instantiates a **fresh** Emscripten module from the cached `WebAssembly.Module` (`instantiateWasm` hook, `thisProgram: "qpdf"`), writes inputs to MEMFS, runs, reads outputs, and posts them back as transferables. The instance is then dropped.
4. With `workers > 1`, jobs go to the first idle worker; otherwise they queue FIFO.
5. `terminate()` terminates all workers and rejects queued and in-flight jobs with `QpdfError{code:"TERMINATED"}`.

**Caller note (documented):** transferred `ArrayBuffer`s are detached in the caller. Inputs given as `Uint8Array` that are views onto larger buffers are copied, not transferred.

### 4.4 Error handling

qpdf exit codes: `0` success, `2` error, `3` success with warnings.

| Situation | Typed helpers | `run()` |
|---|---|---|
| exit 0 | resolve, `warnings: []` | resolve with `exitCode: 0` |
| exit 3 | resolve, `warnings` parsed from stderr lines | resolve with `exitCode: 3` |
| exit 2 and stderr reports invalid password | reject `INVALID_PASSWORD` | resolve with `exitCode: 2` |
| exit 2 and input is not a parseable PDF | reject `INVALID_PDF` | resolve with `exitCode: 2` |
| any other exit 2 | reject `FAILED` with `stderr` | resolve with `exitCode: 2` |
| worker crash / wasm abort / OOM | reject `FAILED`; the pool replaces that worker | reject `FAILED` |
| `terminate()` | reject `TERMINATED` | reject `TERMINATED` |

Password and invalid-PDF detection match qpdf's stderr messages; the exact patterns live in one module (`src/errors.ts`) and are covered by tests so a qpdf wording change fails CI on the upgrade PR rather than silently degrading.

## 5. Packaging

- `package.json`: `"name": "@mssio/qpdf-wasm"`, `"type": "module"`, `"exports"` with `types` + `import` conditions for `.` (the worker is reached internally via `new URL`, not an export), `"sideEffects": ["./dist/worker.js"]` (only the worker entry has side effects), `"repository": { "type": "git", "url": "git+https://github.com/mssio/qpdf-wasm.git" }`, `"homepage"` and `"bugs"` pointing at the GitHub repo, `"files": ["dist", "LICENSE", "THIRD_PARTY_NOTICES.md"]`, `"publishConfig": { "access": "public" }` (provenance is automatic under trusted publishing).
- `dist/` contains the compiled TS (ESM + `.d.ts`), `dist/wasm/qpdf.mjs`, `dist/wasm/qpdf.wasm`, `dist/wasm/meta.mjs` and their `.d.mts` declarations.
- Worker is created with `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })` and the wasm is located with `new URL("./wasm/qpdf.wasm", import.meta.url)` — the patterns Vite, webpack 5, Rollup, esbuild and Next.js resolve without configuration.
- Node ≥ 20.16 is supported via inline mode (§4.2 default when global `Worker` is undefined). Library code never imports Node built-ins; it reads `file:` URLs through `process.getBuiltinModule` (added in 20.16), which bundlers cannot see.
- Invalid arguments (e.g. `merge([])`, out-of-range `level`) throw `TypeError`/`RangeError`; `QpdfError` is reserved for qpdf/runtime failures.

## 6. Licensing

- Project code: **Apache-2.0** (`LICENSE`).
- `THIRD_PARTY_NOTICES.md` (generated by the build from the actual sources, §3.2 step 5) includes: qpdf `LICENSE.txt` and `NOTICE.md` (covers bundled public-domain Rijndael and MIT-style sphlib SHA-2), the zlib license, and the IJG libjpeg license.
- README states: "This software is based in part on the work of the Independent JPEG Group." and "Contains qpdf X.Y.Z, built unmodified for WebAssembly" (or lists patches, per §3.1).
- The project name and README must not imply endorsement by the qpdf project.

## 7. Versioning, upgrades, releases

- **Independent semver.** qpdf version bump → minor release. JS API break → major. Packaging/bug fixes → patch. `qpdfVersion` export and README line identify the bundled qpdf. CHANGELOG records each qpdf bump.
- **Upgrade automation** (`.github/workflows/qpdf-update.yml`, weekly cron + manual dispatch): query latest qpdf GitHub release; if newer than the submodule tag, bump the submodule, run the full CI suite, and open a PR titled `chore: qpdf vX.Y.Z` with the release-notes link and the gzip size delta.
- **Emscripten upgrades** are a separate, manual PR changing `build/emsdk-version`, never bundled with a qpdf bump.
- **Release** (`.github/workflows/release.yml`, on `v*` tag push, GitHub-hosted `ubuntu-latest`, Node 24, `permissions: { id-token: write, contents: read }`, no package-manager cache): build wasm in Docker, build TS, run all tests, `npm publish --access public`. The `.wasm` is never built on a developer machine for release.
- **npm authentication:** npm trusted publishing (OIDC) — no long-lived token. Provenance is generated automatically (requires the GitHub repo to be public). Because a trusted publisher can only be attached once the package exists, the very first release may use a short-lived (≤7-day) granular token in the `NPM_TOKEN` secret; the workflow passes `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`, which is empty once the secret is deleted, at which point OIDC is used. After the first publish: configure the trusted publisher (`mssio` / `qpdf-wasm` / `release.yml`), optionally set "require 2FA and disallow tokens", delete the token and the secret. These maintainer steps are documented in AGENTS.md (§9.2 "cut a release").

## 8. Testing

All levels run on every PR, on upgrade PRs, and before publish.

1. **Unit (Vitest, no wasm):** each `jobs/*` builder produces the expected job JSON for representative options; `src/errors.ts` classifies sample stderr correctly.
2. **Node integration (Vitest, real wasm, `inline: true`):** fixtures from qpdf's own test corpus (Apache-2.0).
   - merge → page count is the sum; split → expected file count; selectPages/rotate → page count/rotation verified via `info`/`run(["--json"])`.
   - encrypt → `info.encrypted === true`; decrypt with the password → `run(["--check"])` exit 0; wrong password → `INVALID_PASSWORD`.
   - linearize → `--check-linearization` reports no errors; compress → output passes `--check`.
   - corrupted input → `INVALID_PDF`; a fixture producing warnings → resolves with non-empty `warnings`.
   - **50 sequential mixed jobs including `--json`** succeed (regression test for the spike's instance-reuse defect).
3. **Browser (Playwright: Chromium, Firefox, WebKit):** a Vite fixture app and a webpack 5 fixture app install the packed tarball (`npm pack`) and run merge + encrypt in the worker; asserts the main thread stays responsive (a `requestAnimationFrame` counter keeps ticking during a job).
4. **Package checks:** `publint`, `@arethetypeswrong/cli`, tarball contents include `LICENSE`, `THIRD_PARTY_NOTICES.md`, `dist/wasm/qpdf.wasm`; gzip size of `qpdf.wasm` reported and the job warns (non-blocking) if it grew >10% versus the latest published version.

## 9. Documentation

Both files are deliverables with the same weight as code. README recipes are executed by the Node integration tests (§9.1 item 4), so they are verified on every PR and release. Every PR that changes the API, build, or workflow updates README and AGENTS.md in the same PR.

### 9.1 `README.md` (audience: developers using the package)

1. **Header:** name, one-sentence pitch, npm version / CI / license badges, bundled qpdf version.
2. **Why:** full qpdf in the browser, no server, runs in a worker, ~705 KB gzip (measured value updated each release).
3. **Install + 10-line quick start:** `createQpdf()` → `merge()` → download the result as a Blob.
4. **Recipes** (each a complete, copy-pasteable snippet that is executed by the Node integration tests, so examples cannot rot): merge, split, select pages, rotate, encrypt, decrypt with password prompt on `INVALID_PASSWORD`, linearize, compress, info, and `run()` with a raw qpdf command.
5. **Framework usage:** short snippets for React, Vue, Svelte, and vanilla, showing creating one instance and calling `terminate()` on teardown.
6. **API reference:** every export, option, and error code from §4.2 and §4.4, plus the `run()` file semantics and the transferable-buffer caveat.
7. **Bundlers & hosting:** zero-config for Vite/webpack 5/Rollup/esbuild/Next.js; `wasmUrl` for CDNs; required MIME type `application/wasm`; CSP note (`wasm-unsafe-eval`, `worker-src`).
8. **Node usage** (inline mode).
9. **Performance & limits:** measured timings and memory (§10), files are held in memory.
10. **Versioning:** independent semver, how to find the bundled qpdf version, upgrade cadence.
11. **Building from source:** prerequisites (Docker, Node), `git clone --recursive`, `npm run build:wasm`, `npm run build`, `npm test`.
12. **License & credits:** Apache-2.0, link to `THIRD_PARTY_NOTICES.md`, the IJG sentence, qpdf attribution, statement that this is not an official qpdf project.

### 9.2 `AGENTS.md` (audience: future coding agents and new maintainers)

Concise, imperative, kept current. Created in the first implementation task and updated as the project grows. Sections:

1. **What this is:** one paragraph plus a link to this spec as the source of design truth.
2. **Repo map:** each top-level directory and key file with its single responsibility (mirrors §4.1).
3. **Commands:** exact commands for wasm build, TS build, each test level, lint, pack, and what each needs (Docker or not).
4. **Hard rules:**
   - Never edit `vendor/qpdf`; use `build/patches/` per §3.1.
   - Never bump qpdf and Emscripten in the same PR.
   - Typed helpers go through qpdf job JSON, never qpdf C++ internals.
   - One fresh module instance per job; never reuse an instance (spike defect, §2).
   - Every API change updates README, `.d.ts`, tests, and CHANGELOG in the same PR.
   - Never commit build output (`dist/`, `out/`) or publish from a local machine.
5. **How to:** upgrade qpdf (what the bot PR does, what to check when it fails); upgrade Emscripten; add a typed helper (job-JSON builder + unit test + integration test + README recipe); cut a release.
6. **Known gotchas:** qpdf global state, exit code 3 means success, `Blob` inputs need `arrayBuffer()`, detached buffers after transfer, Emscripten `-G "Unix Makefiles"` (no Ninja in the image), qpdf's own CMake variable names for zlib/libjpeg.
7. **Verification before claiming done:** which test levels must pass for which kind of change.

A `CLAUDE.md` containing only `@AGENTS.md` is added so Claude Code loads the same file.

## 10. Open items to resolve during implementation

None blocking. Two measurements will be recorded in the README once available: browser timings on a ~10 MB PDF, and peak memory for merging ten ~10 MB PDFs.

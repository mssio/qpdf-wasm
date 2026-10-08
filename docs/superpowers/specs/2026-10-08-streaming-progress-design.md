# @mssio/qpdf-wasm 1.1.0: streaming write progress — Design

- **Date:** 2026-10-08
- **Status:** Draft for review
- **Builds on:** `docs/superpowers/specs/2026-10-05-qpdf-wasm-design.md` (still the source of truth for architecture; this spec changes only what it lists)
- **Branch:** `feat/streaming-progress`

## 1. Goal

Let callers show a real progress bar while qpdf writes a PDF. Every writing helper and `run()` accept an optional
`onProgress?: (percent: number) => void`, which is called while the job runs, not after it ends. The first consumer is
pdf.mss.io (`mssio/pdf-mss-io`, `docs/todo.md` "Real progress bar").

### Success criteria

1. `merge`, `split`, `selectPages`, `rotate`, `encrypt`, `decrypt`, `linearize`, `compress` and `run()` accept
   `onProgress`. `info()` does not (type error).
2. With `onProgress` set, a large encrypt reports integers from 0 to 100 that strictly increase once qpdf's repeats are
   dropped (§3, guarantee 2), delivered to the main thread while the worker is still running (browser test, all
   browsers and bundler apps).
3. Progress lines never appear in `RunResult.stdout`/`stderr` when `onProgress` is set. Without it, output is
   byte-for-byte what 1.0.0 produced.
4. The callback is never called after the job's promise settles or after `terminate()`.
5. Every existing call compiles and behaves as before. Released as **1.1.0** (minor).

### Non-goals

- Progress before qpdf starts writing (parsing, page copying, `info()`): qpdf has no hook for it without patching
  `vendor/qpdf` (hard rule 1). Callers show an indeterminate state until the first call (§7).
- An overall percentage across `split()` output files (it would need an extra qpdf run to count pages).
- Changes to pdf-mss-io. That repo upgrades and adds its bar afterwards.
- No file index or phase in the callback; `split()` callers only get the percent for the current file.
- No qpdf or Emscripten bump.

## 2. How qpdf reports progress (verified 2026-10-08, qpdf 12.4.2 wasm)

- `--progress` (job JSON `"progress": ""`) only sets a flag. `QPDFJob::setWriterOptions` (`QPDFJob.cc:2938`) attaches
  a reporter to `QPDFWriter`, so progress exists **only while writing an output file**. `--json`, `--show-npages`,
  `--check`, `--check-linearization` accept the flag and print nothing.
- Line format: `qpdf: <outfile>: write progress: N%`, on qpdf's info stream. That is stdout, except when the PDF itself
  is written to stdout (`-`): then `qpdf: standard output: write progress: N%` goes to stderr.
- Emscripten's `print`/`printErr` receive each line as qpdf writes it (encrypt of a 2.7 MB file: lines between 145 and
  196 ms, not batched at exit). In a worker, `postMessage` from inside that callback reaches the main thread while qpdf
  is still running.
- Values rise from 0 to 100 but can skip and repeat: encrypt `0,2,2,3,3,…` or `0,4,5,7,…` depending on the object
  count, linearize `…,49,50,50,50,51,51,…,99,99,100`. `split()` writes one `0…100` sequence per output file, and
  every line names the pattern (`out.pdf`), not the actual file. Linearize can start above 0 (2% on a 20-page
  image-heavy file): qpdf reports half of its analysis percentage, from the first analysis value.

### Where the time goes (Node, desktop)

| Input | Job | Before 0% | 0 → 100% | Total |
|---|---|---|---|---|
| 30 MB image-heavy (60 large streams) | encrypt | 31 ms | 208 ms | 245 ms |
| | compress | 5 ms | 1177 ms | 1186 ms |
| 36.5 MB object-heavy (4,000 form copies) | encrypt | 1663 ms | 662 ms | 2431 ms |
| | merge (2 inputs) | 6269 ms | 1924 ms | 8753 ms |
| | selectPages | 4700 ms | 203 ms | 5022 ms |

Longest gap between two percents: 482 ms, compress, 36.5 MB object-heavy. (The 30 MB image-heavy compress: 21 ms.)

For image-heavy files the bar moves for nearly the whole job. For object-heavy files most of the time passes before
0%. §7 tells callers how to handle that.

## 3. Public API

All additions are optional, so 1.0.0 code compiles and runs unchanged.

```ts
export interface ProgressOptions {
  /** Write progress, 0–100, called on the calling thread while qpdf writes. See README "Progress bar". */
  onProgress?: (percent: number) => void;
}
/** Options for selectPages, rotate and linearize. */
export interface OutputOptions extends PasswordOptions, ProgressOptions {}
export interface DecryptOptions extends ProgressOptions {
  password: string;
}
```

- `MergeOptions`, `SplitOptions`, `CompressOptions`, `EncryptOptions`, `RunOptions` extend `ProgressOptions`.
- `selectPages`, `rotate`, `linearize` take `OutputOptions` (was `PasswordOptions`); `decrypt` takes `DecryptOptions`
  (was `{ password: string }`). Both are supersets, so existing calls still type-check.
- `info()` keeps `PasswordOptions`. `PasswordOptions` itself is unchanged.
- `ProgressOptions`, `OutputOptions`, `DecryptOptions` are exported from `src/index.ts`.

### Guarantees (documented in README and JSDoc)

1. `percent` is an integer, 0–100.
2. Within one output file, values strictly increase (repeats are dropped). `split()` starts again at 0 for each output
   file.
3. Calls happen while the job runs. All calls for a job happen before its promise settles.
4. No call after the promise settles, and none after `terminate()`.
5. If the callback throws, the job continues; the error is rethrown asynchronously (`queueMicrotask`), so it surfaces
   as an uncaught error instead of being swallowed. (A throw inside Emscripten's `print` would abort qpdf.)
6. No progress for `run()` arguments that write no PDF, and none before qpdf starts writing.
7. Calls are not throttled or batched. Each new percent goes to the callback as soon as it arrives, so there are at
   most 101 calls per output file. §5's streaming assertion (browser) depends on this; do not add batching later.

## 4. Architecture and data flow

### 4.1 Requesting progress

- **Helpers** (hard rule 3: job JSON only): `src/jobs/job.ts` gets `withProgress(job, options)`, like `withPassword`.
  It adds `progress: ""` when `options.onProgress` is set. Each writing builder applies it. `infoJob` does not.
- **`run()`**: when `onProgress` is set, `--progress` is put **first** in the arguments (before any `--pages … --`).
  Without `onProgress`, `args` are passed through untouched, so a caller's own `--progress` lines stay in `stdout`.
  Exception: qpdf takes its help options (`--version`, `--help`, ...) only as the sole argument. When `args` is
  exactly one argument starting with `--` (but not `--job-json-file`), nothing is prepended; `onProgress` never fires.
  A sole `--job-json-file=…` or `@argfile` still writes a PDF and keeps `--progress`.

### 4.2 Recognizing lines — `src/progress.ts` (new, pure)

```ts
/** Returns a line handler: true when the line was a progress line (consumed), false otherwise. */
export function createProgressFilter(onPercent: (percent: number) => void): (line: string) => boolean;
/** Calls fn; a throw is rethrown asynchronously so it cannot abort qpdf or the pool. */
export function callSafely(callback: (percent: number) => void, percent: number): void;
```

- Uses `parseProgressLine` from `src/errors.ts`, which matches `/: write progress: (\d+)%$/` (hard rule 6: qpdf
  message text is matched only there).
- Reports `p` whenever `p !== last`: a rise continues the output file, a drop starts the next one (a linearized
  file starts above 0). Repeats are consumed silently.

### 4.3 Engine — `src/engine.ts`

`runJob(wasm, spec, onProgress?)`. When `onProgress` is given, `print` and `printErr` both pass each line through the
filter first; consumed lines are not pushed to `stdout`/`stderr`. When it is not given, nothing changes.

### 4.4 Executors

- `Executor.exec(spec, onProgress?)` (internal interface, `src/types.ts`).
- **Inline** (`src/inline-executor.ts`): wraps the callback with an `active` flag. `exec` clears it when it settles,
  `terminate()` clears it for every running job. Inline `terminate()` still does not abort a running job; it only
  silences its callback. Calls go through `callSafely`.
- **Worker protocol** (`src/protocol.ts`):
  - `ToWorker` job: `{ type: "job"; id; spec; progress: boolean }`.
  - `FromWorker` adds `{ type: "progress"; id: number; percent: number }`.
- **Worker handler** (`src/worker-handler.ts`): when `message.progress`, passes
  `(percent) => port.postMessage({ type: "progress", id, percent })` to `runJob`. Messages from one worker arrive in
  order, so every progress message precedes that job's `result`/`error`.
- **Pool** (`src/worker-pool.ts`): `Pending` keeps `onProgress`. On a progress message, call it through `callSafely`
  only when `slot.current?.id === data.id`. After `settle` (`current = null`) or `terminate()` (slots removed), stray
  messages match nothing and are dropped.

### 4.5 API wiring — `src/api.ts`

Each helper passes `options?.onProgress` to `executor.exec`. `run()` adds `--progress` as in §4.1.

## 5. Testing

### Unit (`npm run test:unit`, no wasm)

- `test/unit/progress.test.ts`: parses a line; ignores other lines; drops repeats (`50,50,51` → `50,51`); restarts
  at 0 (`…,100,0,1` reports both sequences); matches the stderr form (`standard output`); `callSafely` rethrows
  asynchronously and returns normally.
- `test/unit/jobs.test.ts`: every writing builder has `progress: ""` only when `onProgress` is set; `infoJob` never.
- `test/unit/worker-pool-progress.test.ts`, with a scripted fake worker that posts chosen messages:
  - progress reaches the right job with two workers busy at once;
  - no call after that job's `result` or `error`;
  - no call after `terminate()`;
  - a throwing callback does not break the pool, and the job still resolves.
- `test/types/consumer.ts`: `onProgress` accepted on every writing helper and `run()`; `@ts-expect-error` on `info()`;
  1.0.0-style calls without it still compile.

### Node, real wasm (`npm run test:node`)

`test/node/progress.test.ts`, on an image-heavy PDF generated in the test (~10 MB, so it stays fast):
- encrypt: first value 0, last 100, strictly increasing, ≥ 50 values; `stdout`/`stderr` have no progress lines;
- linearize: strictly increasing (repeats dropped);
- split (`pagesPerFile` giving 3 files): three runs, each 0 → 100;
- `run()` with `onProgress`: lines stripped; output to `-`: progress (on stderr) is still reported and stripped;
- `run(["--progress", …])` without `onProgress`: lines stay in `stdout` (1.0.0 behaviour);
- inline executor: after `terminate()`, no further calls;
- the recipe `examples/progress.mjs` runs (`recipes.test.ts`).

### Browser (`npm run test:browser`; Chromium, Firefox, WebKit × Vite build, Vite dev, webpack 5)

`test/browser/smoke.js` builds an image-heavy PDF of about 30 MB in the page (uncompressed random image streams,
`crypto.getRandomValues` in 64 KB chunks), encrypts it with `onProgress`, and records `[percent, performance.now()]`
plus the time the promise resolved. `smoke.spec.ts` asserts: first 0, last 100, strictly increasing, ≥ 50 values. When
the job took more than 300 ms, it also asserts the first value arrived at least 25% of the job's duration before the
promise resolved (values streamed instead of arriving in one batch at the end).

## 6. Documentation and release

- **README:**
  - new "Progress bar" section with recipe `examples/progress.mjs` (embedded verbatim, `check:readme`);
  - API table: new option on each method;
  - the caveats in §7.
- **CHANGELOG:** `## 1.1.0 — <date>`: adds `onProgress`; bundles qpdf 12.4.2 (unchanged).
- **AGENTS.md:** repo map row for `src/progress.ts`.
- **Version:** `npm version minor --no-git-tag-version` → 1.1.0.
- **Release:** PR from `feat/streaming-progress` → green `verify` → merge → on `main`, tag `v1.1.0` and push →
  `release.yml` publishes. Claude asks before tagging and pushing the tag.

## 7. Guidance for callers (README, and the pdf-mss-io follow-up)

- Show an **indeterminate** state ("Preparing…", elapsed time) until the first call, then a percentage. Object-heavy
  files can spend most of a job before 0% (§2).
- 100% means "qpdf finished writing this output", not "the caller's job is done". Callers often run more qpdf calls
  before or after (a password check before, `info()` on the output after). Show a short "Finishing…" state after
  100% instead of a bar stuck at 100%.
- Stuck-job limit: before the first call, keep the existing size-based time limit. After the first call, reset a
  stall timer on every call and fail only when no call has arrived for N seconds. Suggested N: 30 s. A single percent
  can take a long time: up to 482 ms on desktop for compress (§2), several times that on phones. 30 s leaves a wide
  margin above that.
- `split()`: the percent is for the current output file.
- `inline: true` in a browser runs qpdf on the main thread, so the page cannot repaint between calls.
- Drop calls from a job the UI no longer shows (pdf-mss-io: the `generation` check in `useQpdfJob`).

## 8. Files touched

`src/types.ts`, `src/index.ts`, `src/api.ts`, `src/engine.ts`, `src/progress.ts` (new), `src/protocol.ts`,
`src/worker-handler.ts`, `src/worker-pool.ts`, `src/inline-executor.ts`, `src/jobs/*.ts` (writing builders, `job.ts`),
tests listed in §5, `examples/progress.mjs`, `README.md`, `CHANGELOG.md`, `AGENTS.md`, `package.json`,
`package-lock.json`.

# @mssio/qpdf-wasm 1.1.0 (streaming write progress) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every writing helper and `run()` accept an optional `onProgress(percent)`, called with qpdf's write progress
while the job runs (worker and inline), released as 1.1.0.

**Architecture:** The engine reads qpdf's `write progress: N%` lines in Emscripten's `print`/`printErr` hooks, which
fire once per line while `callMain` runs. A pure filter (`src/progress.ts`) drops repeats and keeps the lines out of
`stdout`/`stderr`. The line pattern lives in `src/errors.ts` (hard rule 6). The worker posts
`{ type: "progress", id, percent }`. The pool forwards it only to the job currently on that slot. The inline executor
calls the callback directly behind a settled/terminated guard. Helpers ask for progress through job JSON
(`progress: ""`); `run()` puts `--progress` first in its arguments.

**Tech Stack:** TypeScript 7 (strict, `noUncheckedIndexedAccess`), Vitest 5, Playwright (Chromium/Firefox/WebKit ×
Vite build, Vite dev, webpack 5), qpdf 12.4.2 wasm (Emscripten 6.0.11), Node 24.

**Spec:** `docs/superpowers/specs/2026-10-08-streaming-progress-design.md` (builds on
`docs/superpowers/specs/2026-10-05-qpdf-wasm-design.md`). Read both, plus `AGENTS.md`.

## Summary

| # | Task | Implementer model | Reviewer model | Effort | Main risk |
|---|---|---|---|---|---|
| 1 | Line parsing (`parseProgressLine` in `errors.ts`), `src/progress.ts`, unit tests, spec §2/§4.2 fixes | haiku | sonnet | ~10 min | none significant |
| 2 | Public types, `withProgress` in job builders, exports, type tests | sonnet | sonnet | ~15 min | breaking an existing signature (type test guards it) |
| 3 | Engine, inline executor, API wiring, image-heavy PDF generator, Node progress tests | sonnet | **opus** | ~25 min | `queueMicrotask` spy interfering with the inline job |
| 4 | Worker protocol, handler, pool forwarding, scripted-worker unit tests, worker-path Node test | sonnet | **opus** | ~25 min | stale progress reaching the wrong job |
| 5 | Browser smoke: in-page 30 MB encrypt with `onProgress`, streaming assertion | sonnet | sonnet | ~20 min (browser suite ≈ 5–10 min) | timing flakiness on CI WebKit |
| 6 | Recipe, README, AGENTS.md, CHANGELOG, `release: v1.1.0`, full verification | sonnet | sonnet | ~30 min (`ci.sh` ≈ 10–15 min) | README/recipe drift (`check:readme` guards it) |
| 7 | PR, CI, merge, tag `v1.1.0` (**each outward step needs the maintainer's go-ahead**) | — (main session) | — | depends on CI | publishing from a red `main` |
| — | Final whole-branch review (+ one fix wave if needed) | — | **opus** | ~15–30 min | — |

## Global Constraints

- **Never edit `vendor/qpdf`.** No build flag or Emscripten change in this branch.
- **Helpers go through qpdf job JSON**: progress is `"progress": ""` in the job. Only `run()` adds the CLI flag `--progress`, as its **first** argument.
- **qpdf message text is matched only in `src/errors.ts`**, and every pattern has a test there (`parseProgressLine`).
- **No Node built-in imports in `src/`.** `queueMicrotask` is a global and is fine.
- **One fresh module instance per job** (unchanged; do not touch that logic).
- **Backward compatible:** every new option is optional; without `onProgress`, job JSON, args, `stdout` and `stderr` are byte-for-byte what 1.0.0 produced.
- **Guarantees (spec §3):**
  - values are integers 0–100;
  - they strictly increase within one output file, after repeats are dropped; `split()` restarts at 0 for each output file;
  - calls happen while the job runs, never after its promise settles or after `terminate()`;
  - a throwing callback does not stop the job, and the error is rethrown via `queueMicrotask`;
  - **calls are not throttled or batched** (at most 101 per output file).
- `info()` does **not** accept `onProgress` (type error).
- Version **1.1.0**. The newest CHANGELOG heading must equal `package.json`'s version (`test/unit/repo-policy.test.ts`).
- Never commit build output (`dist/`, `out/`, `src/wasm/*.mjs|wasm`, `test/browser/fixtures/*/{dist,smoke.js,image-heavy-pdf.js}`). Never publish from a local machine.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A caller's callback throws** (a bug in UI code). Expect: the job still produces a valid PDF, and the error surfaces asynchronously. Tested in Task 3 (inline) and Task 4 (pool).
2. **`run()` with the caller's own `--progress` *and* `onProgress`.** Expect: works, values reported once, lines stripped. Tested in Task 3.
3. **`onProgress` on a `run()` that writes nothing** (`--check`, `--json`, as pdf-mss-io's Info page does). Expect: never called, `stdout` intact. Tested in Task 3.
4. **A damaged input with progress on** (qpdf repairs are routine). Expect: the same `warnings` as without progress. Tested in Task 3.
5. **`{ onProgress: undefined }` passed explicitly** (common with spread options in React code). Expect: treated as not set, so no `progress` key and `progress: false` to the worker. Tested in Tasks 2 and 4.

## Facts verified while planning (2026-10-08, built wasm)

- `--progress` with `--check` exits 0 and prints no progress lines. `--check` on `form.pdf` prints `checking in.pdf` first.
- `--progress --progress` is accepted (exit 0).
- `damaged.pdf` with `--progress`: exit 3. stderr has the `WARNING: in.pdf: file is damaged` lines; progress still goes to stdout.
- `in.pdf -` (PDF to stdout): progress goes to **stderr** as `qpdf: standard output: write progress: N%`.
- `test/browser/image-heavy-pdf.js` encrypt (Node, desktop):
  - `imageHeavyPdf(20)` (9.8 MB): ~300 ms, 62 distinct values;
  - `imageHeavyPdf(60)` (29.4 MB): ~820 ms, 100 distinct values;
  - nearly all the time is in the write phase.
- **Encrypt also repeats and skips values** (e.g. `0,2,2,3,3,…` or `0,4,5,7,…`), not only linearize. Assertions must therefore check "strictly increasing after the filter", never "every integer 0–100".
- `imageHeavyPdf(6, 300)` split with `--split-pages=2`: three `0…100` runs.

---

### Task 1: Progress line parsing and filter

**Files:**
- Modify: `src/errors.ts` (append after `parseWarnings`)
- Create: `src/progress.ts`
- Test: `test/unit/errors.test.ts`, `test/unit/progress.test.ts` (new)
- Modify: `docs/superpowers/specs/2026-10-08-streaming-progress-design.md` (§2 "Values" bullet, §4.2)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseProgressLine(line: string): number | null` (in `src/errors.ts`);
  - `createProgressFilter(onPercent: (percent: number) => void): (line: string) => boolean`;
  - `callSafely(callback: (percent: number) => void, percent: number): void` (both in `src/progress.ts`).

- [ ] **Step 1: Write the failing tests**

In `test/unit/errors.test.ts`, add `parseProgressLine` to the existing import from `../../src/errors.js`, then append:

```ts
describe("parseProgressLine", () => {
  it("reads the percent from qpdf's --progress lines", () => {
    expect(parseProgressLine("qpdf: out.pdf: write progress: 0%")).toBe(0);
    expect(parseProgressLine("qpdf: out.pdf: write progress: 100%")).toBe(100);
    expect(parseProgressLine("qpdf: standard output: write progress: 42%")).toBe(42);
  });
  it("returns null for any other line", () => {
    expect(parseProgressLine("checking in.pdf")).toBeNull();
    expect(parseProgressLine("WARNING: in.pdf: file is damaged")).toBeNull();
    expect(parseProgressLine("qpdf: out.pdf: write progress: 42% done")).toBeNull();
    expect(parseProgressLine("")).toBeNull();
  });
});
```

Create `test/unit/progress.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { callSafely, createProgressFilter } from "../../src/progress.js";

const line = (percent: number) => `qpdf: out.pdf: write progress: ${percent}%`;

function feed(lines: string[]): { percents: number[]; consumed: boolean[] } {
  const percents: number[] = [];
  const filter = createProgressFilter((percent) => percents.push(percent));
  return { percents, consumed: lines.map(filter) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createProgressFilter", () => {
  it("reports progress lines and consumes them", () => {
    expect(feed([line(0), line(1), line(100)])).toEqual({ percents: [0, 1, 100], consumed: [true, true, true] });
  });
  it("passes every other line through", () => {
    expect(feed(["checking in.pdf", "WARNING: in.pdf: file is damaged", ""])).toEqual({
      percents: [],
      consumed: [false, false, false],
    });
  });
  it("drops repeated values but still consumes their lines", () => {
    const { percents, consumed } = feed([0, 2, 2, 3, 50, 50, 50, 51, 99, 99, 100].map(line));
    expect(percents).toEqual([0, 2, 3, 50, 51, 99, 100]);
    expect(consumed.every(Boolean)).toBe(true);
  });
  it("starts again at 0 for the next split output file, but not on a repeated 0", () => {
    expect(feed([0, 60, 100, 0, 100, 0, 0, 100].map(line)).percents).toEqual([0, 60, 100, 0, 100, 0, 100]);
  });
  it("reads the stderr form qpdf uses when the PDF goes to stdout", () => {
    expect(feed(["qpdf: standard output: write progress: 7%"]).percents).toEqual([7]);
  });
});

describe("callSafely", () => {
  it("calls the callback with the percent", () => {
    const callback = vi.fn();
    callSafely(callback, 42);
    expect(callback).toHaveBeenCalledWith(42);
  });
  it("rethrows the callback's error asynchronously instead of throwing", () => {
    const boom = new Error("boom");
    const scheduled = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(() => {});
    expect(() =>
      callSafely(() => {
        throw boom;
      }, 1),
    ).not.toThrow();
    const task = scheduled.mock.calls[0]?.[0];
    expect(task).toBeTypeOf("function");
    expect(() => task!()).toThrow(boom);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/unit/errors.test.ts test/unit/progress.test.ts`
Expected: FAIL. `parseProgressLine` is not exported, and `../../src/progress.js` cannot be resolved.

- [ ] **Step 3: Implement**

Append to `src/errors.ts`, after `parseWarnings`:

```ts
const PROGRESS_LINE = /: write progress: (\d+)%$/;

/** The percent in a qpdf `--progress` line ("qpdf: out.pdf: write progress: 42%"), or null for any other line. */
export function parseProgressLine(line: string): number | null {
  const match = PROGRESS_LINE.exec(line);
  return match ? Number(match[1]) : null;
}
```

Create `src/progress.ts`:

```ts
import { parseProgressLine } from "./errors.js";

/**
 * A line handler for qpdf's stdout/stderr: returns true when the line was a progress line (consumed).
 * Reports each percent once, rising. qpdf repeats values (encrypt, linearize) and starts again at 0
 * for each split output file.
 */
export function createProgressFilter(onPercent: (percent: number) => void): (line: string) => boolean {
  let last = -1;
  return (line) => {
    const percent = parseProgressLine(line);
    if (percent === null) return false;
    if (percent > last || (percent === 0 && last !== 0)) {
      last = percent;
      onPercent(percent);
    }
    return true;
  };
}

/** Calls the caller's callback. A throw is rethrown asynchronously, so it can't abort qpdf or break the pool. */
export function callSafely(callback: (percent: number) => void, percent: number): void {
  try {
    callback(percent);
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/unit/errors.test.ts test/unit/progress.test.ts && npm run typecheck`
Expected: PASS, and typecheck clean.

- [ ] **Step 5: Align the spec with hard rule 6 and the measured values**

In the spec, §2, replace the bullet that starts `- Values: normally` with:

```md
- Values rise from 0 to 100 but can skip and repeat: encrypt `0,2,2,3,3,…` or `0,4,5,7,…` depending on the object
  count, linearize `…,49,50,50,50,51,51,…,99,99,100`. `split()` writes one `0…100` sequence per output file, and
  every line names the pattern (`out.pdf`), not the actual file.
```

In §4.2, replace the two bullets under the code block (`- Matches …` and `- Reports \`p\` …`) with:

```md
- Uses `parseProgressLine` from `src/errors.ts`, which matches `/: write progress: (\d+)%$/` (hard rule 6: qpdf
  message text is matched only there).
- Reports `p` when `p > last`, or when `p === 0` and `last !== 0` (a new split output file starts). Otherwise
  consumes the line silently (repeats).
```

- [ ] **Step 6: Commit**

```bash
git add src/errors.ts src/progress.ts test/unit/errors.test.ts test/unit/progress.test.ts docs/superpowers/specs/2026-10-08-streaming-progress-design.md
git commit -m "feat: parse qpdf write-progress lines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Public types and job builders

**Files:**
- Modify: `src/types.ts`, `src/index.ts`, `src/jobs/job.ts`, and the job builders `merge.ts`, `split.ts`, `select-pages.ts`, `rotate.ts`, `encrypt.ts`, `decrypt.ts`, `linearize.ts`, `compress.ts`
- Test: `test/unit/jobs.test.ts`, `test/types/consumer.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - Exported types:
    - `ProgressOptions { onProgress?: (percent: number) => void }`;
    - `OutputOptions extends PasswordOptions, ProgressOptions`;
    - `DecryptOptions extends ProgressOptions { password: string }`.
  - `MergeOptions`, `SplitOptions`, `CompressOptions`, `EncryptOptions` and `RunOptions` extend `ProgressOptions`.
  - New `Qpdf` signatures:
    - `selectPages(input, ranges, options?: OutputOptions)`;
    - `rotate(input, rotations, options?: OutputOptions)`;
    - `decrypt(input, options: DecryptOptions)`;
    - `linearize(input, options?: OutputOptions)`.
  - `withProgress(job: Record<string, unknown>, options: ProgressOptions): Record<string, unknown>` in `src/jobs/job.ts`.

- [ ] **Step 1: Write the failing tests**

In `test/unit/jobs.test.ts`, change the type import to
`import type { JobSpec, ProgressOptions } from "../../src/types.js";` and append:

```ts
describe("progress in every writing builder", () => {
  const onProgress = () => {};
  const builders: Record<string, (options: ProgressOptions) => JobSpec> = {
    merge: (options) => mergeJob([A, B], options),
    split: (options) => splitJob(A, options),
    selectPages: (options) => selectPagesJob(A, "1", options),
    rotate: (options) => rotateJob(A, [{ angle: 90 }], options),
    encrypt: (options) => encryptJob(A, { userPassword: "u", ownerPassword: "o", ...options }),
    decrypt: (options) => decryptJob(A, { password: "pw", ...options }),
    linearize: (options) => linearizeJob(A, options),
    compress: (options) => compressJob(A, options),
  };
  for (const [name, build] of Object.entries(builders)) {
    it(`${name}: asks qpdf for progress only when onProgress is set`, () => {
      expect(jobOf(build({ onProgress }))).toHaveProperty("progress", "");
      expect(jobOf(build({}))).not.toHaveProperty("progress");
      expect(jobOf(build({ onProgress: undefined }))).not.toHaveProperty("progress");
    });
  }
  it("keeps the password next to progress", () => {
    expect(jobOf(linearizeJob(A, { password: "pw", onProgress }))).toEqual({
      inputFile: "in.pdf",
      linearize: "",
      outputFile: "out.pdf",
      password: "pw",
      progress: "",
    });
  });
  it("info never asks for progress", () => {
    expect(jobOf(infoJob(A))).not.toHaveProperty("progress");
  });
});
```

In `test/types/consumer.ts`, change the import line to
`import { createQpdf, type DecryptOptions, type OutputOptions, type ProgressOptions } from "@mssio/qpdf-wasm";`
and append:

```ts
export async function progress(input: File, report: (percent: number) => void): Promise<void> {
  const qpdf = await createQpdf();
  const onProgress = report;
  await qpdf.merge([input], { onProgress });
  await qpdf.split(input, { pagesPerFile: 2, onProgress });
  await qpdf.selectPages(input, "1", { password: "pw", onProgress });
  await qpdf.rotate(input, [{ angle: 90 }], { onProgress });
  await qpdf.encrypt(input, { userPassword: "u", ownerPassword: "o", onProgress });
  await qpdf.decrypt(input, { password: "pw", onProgress });
  await qpdf.linearize(input, { onProgress });
  await qpdf.compress(input, { level: 6, onProgress });
  await qpdf.run(["in.pdf", "out.pdf"], { files: { "in.pdf": input }, onProgress });
  // 1.0.0-style calls still compile.
  await qpdf.decrypt(input, { password: "pw" });
  await qpdf.linearize(input, { password: "pw" });
  await qpdf.selectPages(input, "1");
  // info() never writes a PDF, so it takes no onProgress.
  // @ts-expect-error onProgress is not an info() option
  await qpdf.info(input, { onProgress });
  const shared: ProgressOptions = { onProgress };
  const output: OutputOptions = { password: "pw", ...shared };
  const decrypt: DecryptOptions = { password: "pw", ...shared };
  await qpdf.rotate(input, [{ angle: 180, pages: "1" }], output);
  await qpdf.decrypt(input, decrypt);
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/unit/jobs.test.ts; npm run typecheck`
Expected: the `progress in every writing builder` tests FAIL (no `progress` key). Typecheck FAILS: `DecryptOptions`, `OutputOptions` and `ProgressOptions` are not exported, and `onProgress` is not a known property.

- [ ] **Step 3: Implement the types**

In `src/types.ts`:
- Add after `PasswordOptions`:

```ts
export interface ProgressOptions {
  /**
   * Called with qpdf's write progress, 0–100, while the job runs, on the calling thread. Values strictly increase
   * within one output file; `split()` starts again at 0 for each file. Never called before qpdf starts writing,
   * after the promise settles, or after `terminate()`. See README "Progress bar".
   */
  onProgress?: (percent: number) => void;
}

/** Options for `selectPages`, `rotate` and `linearize`. */
export interface OutputOptions extends PasswordOptions, ProgressOptions {}

export interface DecryptOptions extends ProgressOptions {
  password: string;
}
```

- Change these declarations to `export interface MergeOptions extends ProgressOptions {`, `export interface SplitOptions extends ProgressOptions {`, `export interface CompressOptions extends ProgressOptions {`, `export interface EncryptOptions extends ProgressOptions {` and `export interface RunOptions extends ProgressOptions {`. Leave their bodies unchanged.
- In `interface Qpdf`, change these four lines:

```ts
  selectPages(input: PdfInput, ranges: string, options?: OutputOptions): Promise<QpdfResult>;
  rotate(input: PdfInput, rotations: Rotation[], options?: OutputOptions): Promise<QpdfResult>;
  decrypt(input: PdfInput, options: DecryptOptions): Promise<QpdfResult>;
  linearize(input: PdfInput, options?: OutputOptions): Promise<QpdfResult>;
```

(`info` keeps `options?: PasswordOptions`.)

In `src/index.ts`, add `DecryptOptions`, `OutputOptions` and `ProgressOptions` to the `export type { … }` list, keeping it alphabetical.

- [ ] **Step 4: Implement the builders**

In `src/jobs/job.ts`, change the import to `import type { JobSpec, ProgressOptions } from "../types.js";` and append:

```ts
/** Asks qpdf for write progress (job JSON `progress`) when the caller passed onProgress. */
export function withProgress(job: Record<string, unknown>, options: ProgressOptions): Record<string, unknown> {
  return options.onProgress === undefined ? job : { ...job, progress: "" };
}
```

Then update each builder. Add `withProgress` to its `./job.js` import, and change the option types as shown:

`src/jobs/merge.ts`, last line of `mergeJob`:
```ts
  return jobSpec(withProgress({ empty: "", pages, outputFile: OUTPUT }, options), files);
```

`src/jobs/split.ts`, last line of `splitJob`:
```ts
  return jobSpec(withProgress(withPassword(job, options.password), options), { [INPUT]: input });
```

`src/jobs/select-pages.ts`:
```ts
import type { JobSpec, OutputOptions } from "../types.js";
import { INPUT, jobSpec, OUTPUT, withPassword, withProgress } from "./job.js";

export function selectPagesJob(input: Uint8Array, ranges: string, options: OutputOptions = {}): JobSpec {
  if (ranges.trim() === "") throw new RangeError("selectPages() needs a page range such as \"1-3,7\"");
  const job = { inputFile: INPUT, pages: [{ file: ".", range: ranges }], outputFile: OUTPUT };
  return jobSpec(withProgress(withPassword(job, options.password), options), { [INPUT]: input });
}
```

`src/jobs/rotate.ts`: change the type import to `import type { JobSpec, OutputOptions, Rotation } from "../types.js";`, the signature to `options: OutputOptions = {}`, and the last line to:
```ts
  return jobSpec(withProgress(withPassword(job, options.password), options), { [INPUT]: input });
```

`src/jobs/encrypt.ts`, last line of `encryptJob`:
```ts
  return jobSpec(withProgress(job, options), { [INPUT]: input });
```

`src/jobs/decrypt.ts`:
```ts
import type { DecryptOptions, JobSpec } from "../types.js";
import { INPUT, jobSpec, OUTPUT, withPassword, withProgress } from "./job.js";

export function decryptJob(input: Uint8Array, options: DecryptOptions): JobSpec {
  const job = withPassword({ inputFile: INPUT, decrypt: "", outputFile: OUTPUT }, options.password);
  return jobSpec(withProgress(job, options), { [INPUT]: input });
}
```

`src/jobs/linearize.ts`:
```ts
import type { JobSpec, OutputOptions } from "../types.js";
import { INPUT, jobSpec, OUTPUT, withPassword, withProgress } from "./job.js";

export function linearizeJob(input: Uint8Array, options: OutputOptions = {}): JobSpec {
  const job = withPassword({ inputFile: INPUT, linearize: "", outputFile: OUTPUT }, options.password);
  return jobSpec(withProgress(job, options), { [INPUT]: input });
}
```

`src/jobs/compress.ts`, last line of `compressJob`:
```ts
  return jobSpec(withProgress(withPassword(job, options.password), options), { [INPUT]: input });
```

`src/jobs/info.ts`: no change.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run typecheck && npm run test:unit`
Expected: PASS. The `@ts-expect-error` on `info()` is satisfied, meaning passing `onProgress` to `info()` really is an error.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/index.ts src/jobs test/unit/jobs.test.ts test/types/consumer.ts
git commit -m "feat: onProgress option types and job JSON progress

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Engine, inline executor, API wiring, Node tests

**Files:**
- Modify: `src/types.ts` (`Executor`), `src/engine.ts`, `src/inline-executor.ts`, `src/api.ts`
- Create: `test/browser/image-heavy-pdf.js` (shared with the browser smoke in Task 5)
- Test: `test/node/progress.test.ts` (new)

**Interfaces:**
- Consumes:
  - `createProgressFilter` and `callSafely` (Task 1);
  - `ProgressOptions` and the builder signatures (Task 2).
- Produces:
  - `Executor.exec(spec: JobSpec, onProgress?: (percent: number) => void): Promise<RunResult>`;
  - `runJob(wasm: WebAssembly.Module, spec: JobSpec, onProgress?: (percent: number) => void): Promise<RunResult>`;
  - `imageHeavyPdf(pages: number, side?: number): Uint8Array` (default `side` 700; each page holds `side²` random bytes).

- [ ] **Step 1: Create the PDF generator**

Create `test/browser/image-heavy-pdf.js`. It is plain JavaScript because Task 5 copies it into the browser fixture apps:

```js
// Builds an image-heavy PDF in memory: `pages` pages, each with one uncompressed `side`×`side` grey image of
// random bytes. qpdf compresses and writes those streams, so nearly the whole job is in its write phase (where it
// reports progress). Plain JS with no imports: also copied into the browser fixture apps.

/**
 * @param {number} pages
 * @param {number} [side]
 * @returns {Uint8Array}
 */
export function imageHeavyPdf(pages, side = 700) {
  const text = new TextEncoder();
  /** @type {Uint8Array[]} */
  const chunks = [];
  /** @type {number[]} */
  const offsets = [];
  let length = 0;
  /** @param {string | Uint8Array} part */
  const push = (part) => {
    const bytes = typeof part === "string" ? text.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  /** @param {number} id @param {...(string | Uint8Array)} parts */
  const object = (id, ...parts) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    parts.forEach(push);
    push("\nendobj\n");
  };

  push("%PDF-1.7\n");
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i * 3} 0 R`).join(" ");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`);
  const content = "q 612 0 0 792 0 0 cm /Im0 Do Q";
  for (let i = 0; i < pages; i++) {
    const page = 3 + i * 3;
    const pixels = new Uint8Array(side * side);
    // getRandomValues fills at most 65,536 bytes per call.
    for (let at = 0; at < pixels.length; at += 65536) crypto.getRandomValues(pixels.subarray(at, at + 65536));
    object(
      page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 ${page + 1} 0 R >> >> /Contents ${page + 2} 0 R >>`,
    );
    object(
      page + 1,
      `<< /Type /XObject /Subtype /Image /Width ${side} /Height ${side} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${pixels.length} >>\nstream\n`,
      pixels,
      "\nendstream",
    );
    object(page + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  const size = 3 + pages * 3;
  const entries = offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`);
  const xrefAt = length; // startxref must point at the xref table, so capture it before pushing it
  push(`xref\n0 ${size}\n0000000000 65535 f \n${entries.join("")}`);
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const pdf = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    pdf.set(chunk, at);
    at += chunk.length;
  }
  return pdf;
}
```

A wrong `startxref` would make qpdf repair the file and print warnings. The encrypt test's `warnings` assertion
(`toEqual([])`) catches that.

- [ ] **Step 2: Write the failing Node tests**

Create `test/node/progress.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createQpdf, type Qpdf } from "../../src/index.js";
import { imageHeavyPdf } from "../browser/image-heavy-pdf.js";
import { fixture } from "../helpers.js";

let qpdf: Qpdf;
/** 20 pages, ~9.8 MB: qpdf reports ~60 distinct percents while encrypting it. */
let big: Uint8Array;

beforeAll(async () => {
  qpdf = await createQpdf({ inline: true });
  big = imageHeavyPdf(20);
});
afterAll(() => qpdf.terminate());

const PROGRESS_TEXT = /write progress/;

function recorder() {
  const percents: number[] = [];
  return { percents, onProgress: (percent: number) => void percents.push(percent) };
}

/** Spec §3: integers, 0 first, 100 last, strictly increasing. */
function expectRising(percents: number[]): void {
  expect(percents[0]).toBe(0);
  expect(percents.at(-1)).toBe(100);
  percents.forEach((percent, index) => {
    expect(Number.isInteger(percent)).toBe(true);
    if (index > 0) expect(percent).toBeGreaterThan(percents[index - 1]!);
  });
}

describe("onProgress (inline)", () => {
  it("reports encrypt progress rising from 0 to 100", async () => {
    const { percents, onProgress } = recorder();
    const { output, warnings } = await qpdf.encrypt(big.slice(), { userPassword: "u", ownerPassword: "o", onProgress });
    expectRising(percents);
    expect(percents.length).toBeGreaterThanOrEqual(50);
    expect(warnings).toEqual([]);
    expect((await qpdf.info(output, { password: "u" })).encrypted).toBe(true);
  });

  it("drops linearize's repeated values", async () => {
    const { percents, onProgress } = recorder();
    await qpdf.linearize(big.slice(), { onProgress });
    expectRising(percents);
  });

  it("starts again at 0 for each split output file", async () => {
    const { percents, onProgress } = recorder();
    const { outputs } = await qpdf.split(imageHeavyPdf(6, 300), { pagesPerFile: 2, onProgress });
    expect(outputs).toHaveLength(3);
    const runs: number[][] = [];
    for (const percent of percents) {
      if (percent === 0) runs.push([]);
      runs.at(-1)!.push(percent);
    }
    expect(runs).toHaveLength(3);
    runs.forEach(expectRising);
  });

  it("keeps progress lines out of run()'s stdout and stderr", async () => {
    const { percents, onProgress } = recorder();
    const result = await qpdf.run(["--encrypt", "u", "o", "256", "--", "in.pdf", "out.pdf"], {
      files: { "in.pdf": big.slice() },
      onProgress,
    });
    expect(result.exitCode).toBe(0);
    expectRising(percents);
    expect(result.stdout).not.toMatch(PROGRESS_TEXT);
    expect(result.stderr).not.toMatch(PROGRESS_TEXT);
  });

  it("reports and strips the progress qpdf sends to stderr when the PDF goes to stdout", async () => {
    const { percents, onProgress } = recorder();
    const result = await qpdf.run(["in.pdf", "-"], { files: { "in.pdf": await fixture("form.pdf") }, onProgress });
    expect(result.exitCode).toBe(0);
    expectRising(percents);
    expect(result.stderr).not.toMatch(PROGRESS_TEXT);
  });

  it("leaves a caller's own --progress lines in stdout when onProgress is not set (1.0.0 behaviour)", async () => {
    const result = await qpdf.run(["--progress", "in.pdf", "out.pdf"], { files: { "in.pdf": await fixture("form.pdf") } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/write progress: 100%/);
  });

  it("accepts a caller's own --progress together with onProgress", async () => {
    const { percents, onProgress } = recorder();
    const result = await qpdf.run(["--progress", "in.pdf", "out.pdf"], {
      files: { "in.pdf": await fixture("form.pdf") },
      onProgress,
    });
    expect(result.exitCode).toBe(0);
    expectRising(percents);
    expect(result.stdout).not.toMatch(PROGRESS_TEXT);
  });

  it("never calls onProgress for a run that writes no PDF", async () => {
    const onProgress = vi.fn();
    const result = await qpdf.run(["--check", "in.pdf"], { files: { "in.pdf": await fixture("form.pdf") }, onProgress });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^checking in\.pdf$/m);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("returns the same warnings for a damaged file with progress on", async () => {
    const damaged = await fixture("damaged.pdf");
    const without = await qpdf.compress(damaged.slice());
    const { percents, onProgress } = recorder();
    const withProgress = await qpdf.compress(damaged.slice(), { onProgress });
    expect(withProgress.warnings.join("\n")).toContain("file is damaged");
    expect(withProgress.warnings).toEqual(without.warnings);
    expect(percents.at(-1)).toBe(100);
  });

  it("keeps running when onProgress throws, and rethrows asynchronously", async () => {
    const scheduled = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(() => {});
    let rethrows = 0;
    try {
      const { output } = await qpdf.encrypt(big.slice(), {
        userPassword: "u",
        ownerPassword: "o",
        onProgress: () => {
          throw new Error("callback bug");
        },
      });
      rethrows = scheduled.mock.calls.length;
      expect((await qpdf.info(output, { password: "u" })).encrypted).toBe(true);
    } finally {
      scheduled.mockRestore();
    }
    expect(rethrows).toBeGreaterThanOrEqual(50);
  });

  it("stops calling onProgress after terminate()", async () => {
    const own = await createQpdf({ inline: true });
    const percents: number[] = [];
    // Inline terminate() cannot abort the running job, so it still resolves; only the callback goes quiet.
    await own.encrypt(big.slice(), {
      userPassword: "u",
      ownerPassword: "o",
      onProgress: (percent) => {
        percents.push(percent);
        if (percent >= 10) own.terminate();
      },
    });
    expect(percents.at(-1)).toBeGreaterThanOrEqual(10);
    expect(percents.filter((percent) => percent >= 10)).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/node/progress.test.ts`
Expected: FAIL. No callback is ever called (`percents[0]` is `undefined`), and the first `run()` test finds progress text in `stdout`. The 1.0.0-behaviour test and the `--check` test already pass.

- [ ] **Step 4: Implement the engine**

In `src/types.ts`, replace the `Executor` interface:

```ts
/** Internal: runs JobSpecs somewhere (calling thread or workers). */
export interface Executor {
  /** `onProgress` receives qpdf's write progress while the job runs (see src/progress.ts). */
  exec(spec: JobSpec, onProgress?: (percent: number) => void): Promise<RunResult>;
  terminate(): void;
}
```

In `src/engine.ts`, add `import { createProgressFilter } from "./progress.js";`. Then replace the top of `runJob` (up to `const mod = …`) and the `instantiate` function:

```ts
export async function runJob(
  wasm: WebAssembly.Module,
  spec: JobSpec,
  onProgress?: (percent: number) => void,
): Promise<RunResult> {
  const paths = Object.keys(spec.files).map(resolvePath);
  const stdout: string[] = [];
  const stderr: string[] = [];
  // qpdf prints progress to stdout, or to stderr when the PDF itself goes to stdout. Without onProgress,
  // every line is kept as before.
  const isProgress = onProgress ? createProgressFilter(onProgress) : () => false;
  const mod = await instantiate(
    wasm,
    (line) => {
      if (!isProgress(line)) stdout.push(line);
    },
    (line) => {
      if (!isProgress(line)) stderr.push(line);
    },
  );
```

```ts
function instantiate(
  wasm: WebAssembly.Module,
  print: (line: string) => void,
  printErr: (line: string) => void,
): Promise<QpdfModule> {
  let fail!: (error: unknown) => void;
  const failed = new Promise<never>((_, reject) => {
    fail = reject;
  });
  const created = createQpdfModule({
    thisProgram: "qpdf",
    print,
    printErr,
    // Required: the glue is built for web/worker only and cannot load the wasm itself in Node.
    instantiateWasm(imports, ready) {
      WebAssembly.instantiate(wasm, imports).then((instance) => ready(instance, wasm), fail);
      return {};
    },
  });
  return Promise.race([created, failed]);
}
```

The rest of `runJob` stays the same.

- [ ] **Step 5: Implement the inline executor**

Replace `src/inline-executor.ts`:

```ts
import { runJob } from "./engine.js";
import { crashError, terminatedError } from "./errors.js";
import { callSafely } from "./progress.js";
import type { Executor } from "./types.js";

/** Runs jobs on the calling thread. Used in Node and with `inline: true`. */
export function createInlineExecutor(wasm: WebAssembly.Module): Executor {
  let terminated = false;
  return {
    async exec(spec, onProgress) {
      if (terminated) throw terminatedError();
      let settled = false;
      // Never after this job settles or after terminate(); a throwing callback must not abort qpdf.
      const report =
        onProgress &&
        ((percent: number) => {
          if (!settled && !terminated) callSafely(onProgress, percent);
        });
      try {
        return await runJob(wasm, spec, report);
      } catch (error) {
        throw crashError(error);
      } finally {
        settled = true;
      }
    },
    terminate() {
      terminated = true;
    },
  };
}
```

- [ ] **Step 6: Wire the API**

In `src/api.ts`, replace `succeed`, `single` and the returned object:

```ts
  async function succeed(spec: JobSpec, onProgress?: (percent: number) => void): Promise<{ result: RunResult; warnings: string[] }> {
    const result = await executor.exec(spec, onProgress);
    if (result.exitCode !== 0 && result.exitCode !== 3) throw failureFromResult(result);
    return { result, warnings: parseWarnings(result.stderr) };
  }

  async function single(spec: JobSpec, onProgress?: (percent: number) => void): Promise<QpdfResult> {
    const { result, warnings } = await succeed(spec, onProgress);
    const output = result.files[OUTPUT];
    if (!output) {
      throw new QpdfError("FAILED", "qpdf reported success but wrote no output", {
        exitCode: result.exitCode,
        stderr: result.stderr,
      });
    }
    return { output, warnings };
  }

  return {
    merge: async (inputs, options) =>
      single(mergeJob(await Promise.all(inputs.map(toBytes)), options), options?.onProgress),
    split: async (input, options) => {
      const { result, warnings } = await succeed(splitJob(await toBytes(input), options), options?.onProgress);
      return { outputs: collectSplitOutputs(result.files), warnings };
    },
    selectPages: async (input, ranges, options) =>
      single(selectPagesJob(await toBytes(input), ranges, options), options?.onProgress),
    rotate: async (input, rotations, options) =>
      single(rotateJob(await toBytes(input), rotations, options), options?.onProgress),
    encrypt: async (input, options) => single(encryptJob(await toBytes(input), options), options.onProgress),
    decrypt: async (input, options) => single(decryptJob(await toBytes(input), options), options.onProgress),
    linearize: async (input, options) => single(linearizeJob(await toBytes(input), options), options?.onProgress),
    compress: async (input, options) => single(compressJob(await toBytes(input), options), options?.onProgress),
    info: async (input, options) => {
      const { result, warnings } = await succeed(infoJob(await toBytes(input), options));
      return { ...parseInfo(result.stdout), warnings };
    },
    run: async (args, options = {}) => {
      const entries = await Promise.all(
        Object.entries(options.files ?? {}).map(async ([name, data]: [string, PdfInput]) => [name, await toBytes(data)] as const),
      );
      // --progress goes first, before any `--pages … --`. Without onProgress, args pass through untouched.
      const argv = options.onProgress === undefined ? args : ["--progress", ...args];
      return executor.exec({ args: argv, files: Object.fromEntries(entries) }, options.onProgress);
    },
    terminate: () => executor.terminate(),
  };
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run typecheck && npm test`
Expected: PASS, all unit and Node tests including the pre-existing ones. The "keeps running when onProgress throws" test mocks `queueMicrotask` for the length of one inline job. `await` does not go through that global, so the job is unaffected. If the test hangs anyway, stop and report it: something in the job path uses `queueMicrotask`. Do not weaken the test.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/engine.ts src/inline-executor.ts src/api.ts test/browser/image-heavy-pdf.js test/node/progress.test.ts
git commit -m "feat: stream qpdf write progress to onProgress (inline)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Worker protocol, handler and pool

**Files:**
- Modify: `src/protocol.ts`, `src/worker-handler.ts`, `src/worker-pool.ts`
- Test: `test/unit/worker-pool-progress.test.ts` (new), `test/node/progress.test.ts` (append)

**Interfaces:**
- Consumes:
  - `runJob(wasm, spec, onProgress?)` and `Executor.exec(spec, onProgress?)` (Task 3);
  - `callSafely` (Task 1);
  - `imageHeavyPdf` and the `recorder`/`expectRising` helpers in `test/node/progress.test.ts` (Task 3).
- Produces:
  - `ToWorker` job: `{ type: "job"; id: number; spec: JobSpec; progress: boolean }`;
  - `FromWorker` adds `{ type: "progress"; id: number; percent: number }`.

- [ ] **Step 1: Write the failing unit tests**

Create `test/unit/worker-pool-progress.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { FromWorker, ToWorker } from "../../src/protocol.js";
import type { JobSpec, RunResult } from "../../src/types.js";
import { createWorkerPool, type WorkerLike } from "../../src/worker-pool.js";

type JobMessage = Extract<ToWorker, { type: "job" }>;
const RESULT: RunResult = { exitCode: 0, stdout: "", stderr: "", files: {} };
const spec = (): JobSpec => ({ args: ["x"], files: {} });

/**
 * A worker whose replies the test sends by hand. emit() delivers even after terminate(), like a message that was
 * already in flight, so the tests check the pool's own guards.
 */
class ScriptedWorker implements WorkerLike {
  onmessage: ((event: { data: FromWorker }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;
  readonly jobs: JobMessage[] = [];

  postMessage(message: ToWorker): void {
    if (message.type === "init") queueMicrotask(() => this.emit({ type: "ready" }));
    else this.jobs.push(message);
  }

  emit(data: FromWorker): void {
    this.onmessage?.({ data });
  }

  terminate(): void {}
}

async function setup(size = 1) {
  const workers: ScriptedWorker[] = [];
  const pool = await createWorkerPool({
    size,
    wasmUrl: "qpdf.wasm",
    spawn: () => {
      const worker = new ScriptedWorker();
      workers.push(worker);
      return worker;
    },
  });
  return { pool, workers };
}

describe("worker pool progress", () => {
  it("asks the worker for progress only when the job has onProgress", async () => {
    const { pool, workers } = await setup();
    const worker = workers[0]!;
    const withCallback = pool.exec(spec(), () => {});
    expect(worker.jobs[0]).toMatchObject({ type: "job", progress: true });
    worker.emit({ type: "result", id: worker.jobs[0]!.id, result: RESULT });
    await withCallback;
    const without = pool.exec(spec());
    expect(worker.jobs[1]).toMatchObject({ type: "job", progress: false });
    worker.emit({ type: "result", id: worker.jobs[1]!.id, result: RESULT });
    await without;
    const explicitUndefined = pool.exec(spec(), undefined);
    expect(worker.jobs[2]).toMatchObject({ type: "job", progress: false });
    worker.emit({ type: "result", id: worker.jobs[2]!.id, result: RESULT });
    await explicitUndefined;
    pool.terminate();
  });

  it("forwards each job's progress to its own callback", async () => {
    const { pool, workers } = await setup(2);
    const a: number[] = [];
    const b: number[] = [];
    const jobA = pool.exec(spec(), (percent) => a.push(percent));
    const jobB = pool.exec(spec(), (percent) => b.push(percent));
    const [workerA, workerB] = [workers[0]!, workers[1]!];
    const idA = workerA.jobs[0]!.id;
    const idB = workerB.jobs[0]!.id;
    workerA.emit({ type: "progress", id: idA, percent: 0 });
    workerB.emit({ type: "progress", id: idB, percent: 0 });
    workerB.emit({ type: "progress", id: idB, percent: 40 });
    workerA.emit({ type: "progress", id: idA, percent: 100 });
    expect(a).toEqual([0, 100]);
    expect(b).toEqual([0, 40]);
    workerA.emit({ type: "result", id: idA, result: RESULT });
    workerB.emit({ type: "result", id: idB, result: RESULT });
    await Promise.all([jobA, jobB]);
    pool.terminate();
  });

  it("ignores progress for a settled job, even while the next job runs", async () => {
    const { pool, workers } = await setup();
    const worker = workers[0]!;
    const first: number[] = [];
    const second: number[] = [];
    const jobA = pool.exec(spec(), (percent) => first.push(percent));
    const jobB = pool.exec(spec(), (percent) => second.push(percent)); // queued behind jobA
    const idA = worker.jobs[0]!.id;
    worker.emit({ type: "result", id: idA, result: RESULT });
    await jobA;
    const idB = worker.jobs[1]!.id; // dispatched when jobA settled
    worker.emit({ type: "progress", id: idA, percent: 50 });
    worker.emit({ type: "error", id: idB, message: "boom" });
    await expect(jobB).rejects.toThrow("boom");
    worker.emit({ type: "progress", id: idB, percent: 50 });
    expect(first).toEqual([]);
    expect(second).toEqual([]);
    pool.terminate();
  });

  it("ignores progress after terminate()", async () => {
    const { pool, workers } = await setup();
    const worker = workers[0]!;
    const calls: number[] = [];
    const job = pool.exec(spec(), (percent) => calls.push(percent));
    const id = worker.jobs[0]!.id;
    worker.emit({ type: "progress", id, percent: 10 });
    pool.terminate();
    await expect(job).rejects.toMatchObject({ code: "TERMINATED" });
    worker.emit({ type: "progress", id, percent: 20 });
    expect(calls).toEqual([10]);
  });

  it("keeps the job and the pool working when onProgress throws", async () => {
    const { pool, workers } = await setup();
    const worker = workers[0]!;
    const scheduled = vi.spyOn(globalThis, "queueMicrotask").mockImplementation(() => {});
    try {
      const job = pool.exec(spec(), () => {
        throw new Error("callback bug");
      });
      const id = worker.jobs[0]!.id;
      worker.emit({ type: "progress", id, percent: 0 });
      worker.emit({ type: "result", id, result: RESULT });
      await expect(job).resolves.toEqual(RESULT);
      expect(scheduled).toHaveBeenCalledTimes(1);
      const next = pool.exec(spec());
      worker.emit({ type: "result", id: worker.jobs[1]!.id, result: RESULT });
      await expect(next).resolves.toEqual(RESULT);
    } finally {
      scheduled.mockRestore();
      pool.terminate();
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/unit/worker-pool-progress.test.ts`
Expected: FAIL. The job message has no `progress` field, and progress messages hit the final `else` branch (treated as `error`), so they reject jobs.

- [ ] **Step 3: Implement the protocol and handler**

Replace `src/protocol.ts`:

```ts
import type { JobSpec, RunResult } from "./types.js";

export type ToWorker =
  | { type: "init"; wasmUrl: string }
  | { type: "job"; id: number; spec: JobSpec; progress: boolean };

export type FromWorker =
  | { type: "ready" }
  | { type: "init-error"; message: string }
  | { type: "progress"; id: number; percent: number }
  | { type: "result"; id: number; result: RunResult }
  | { type: "error"; id: number; message: string };
```

In `src/worker-handler.ts`, replace the job `try` block:

```ts
    const { id, spec, progress } = message;
    try {
      if (!wasm) throw new QpdfError("FAILED", "qpdf worker received a job before init");
      // One message per new percent, unbatched (spec §3, guarantee 7). Messages from one worker arrive in order,
      // so every progress message reaches the pool before this job's result or error.
      const onProgress = progress ? (percent: number) => port.postMessage({ type: "progress", id, percent }) : undefined;
      const result = await runJob(wasm, spec, onProgress);
      port.postMessage({ type: "result", id, result }, transferablesOf(result.files));
    } catch (error) {
      // Same wording as the inline executor; the pool turns this into QpdfError FAILED.
      port.postMessage({ type: "error", id, message: crashError(error).message });
    }
```

- [ ] **Step 4: Implement the pool**

In `src/worker-pool.ts`:
- Add `import { callSafely } from "./progress.js";`.
- Add a field to `Pending`, after `spec: JobSpec;`:

```ts
  onProgress: ((percent: number) => void) | undefined;
```

- In `slot.worker.onmessage`, insert this branch **before** `} else if (data.type === "result") {`:

```ts
        } else if (data.type === "progress") {
          // Only the job on this slot right now: a settled or terminated job has `current` cleared or replaced.
          const job = slot.current;
          if (job?.id === data.id && job.onProgress) callSafely(job.onProgress, data.percent);
```

- In `dispatch`, change the `postMessage` line to:

```ts
          slot.worker.postMessage(
            { type: "job", id: job.id, spec: job.spec, progress: job.onProgress !== undefined },
            transferablesOf(job.spec.files),
          );
```

- Replace `exec`:

```ts
    exec(spec, onProgress) {
      if (terminated) return Promise.reject(terminatedError());
      if (slots.length === 0) return Promise.reject(new QpdfError("FAILED", "no qpdf workers are available"));
      return new Promise<RunResult>((resolve, reject) => {
        queue.push({ id: nextId++, spec, onProgress, resolve, reject });
        dispatch();
      });
    },
```

- [ ] **Step 5: Add the worker-path Node test**

Append to `test/node/progress.test.ts` and extend its imports with:
`import { createQpdfApi } from "../../src/api.js";`, `import { defaultWasmUrl } from "../../src/wasm-loader.js";`, `import { createWorkerPool } from "../../src/worker-pool.js";`, `import { FakeWorker } from "../unit/fake-worker.js";`.

```ts
describe("onProgress (worker protocol, real wasm)", () => {
  it("streams encrypt progress from the worker, all before the result", async () => {
    const pooled = createQpdfApi(
      await createWorkerPool({ size: 1, wasmUrl: defaultWasmUrl().href, spawn: () => new FakeWorker() }),
    );
    try {
      const { percents, onProgress } = recorder();
      let atSettle = -1;
      await pooled
        .encrypt(big.slice(), { userPassword: "u", ownerPassword: "o", onProgress })
        .then(() => {
          atSettle = percents.length;
        });
      await new Promise((resolve) => setTimeout(resolve, 50)); // let any stray message arrive
      expect(percents.length).toBe(atSettle);
      expectRising(percents);
      expect(percents.length).toBeGreaterThanOrEqual(50);
    } finally {
      pooled.terminate();
    }
  });
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run typecheck && npm test`
Expected: PASS, including the existing `test/node/worker-pool.test.ts` (crash, terminate and transfer behaviour unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/protocol.ts src/worker-handler.ts src/worker-pool.ts test/unit/worker-pool-progress.test.ts test/node/progress.test.ts
git commit -m "feat: forward worker progress messages to the job's onProgress

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Browser test, streaming encrypt in real workers

**Files:**
- Modify: `test/browser/smoke.js`, `test/browser/smoke.spec.ts`, `scripts/prepare-browser-fixtures.sh`, `.gitignore`

**Interfaces:**
- Consumes:
  - `imageHeavyPdf(pages, side?)` from `test/browser/image-heavy-pdf.js` (Task 3);
  - `onProgress` on `encrypt` (Tasks 2–4, through the packed tarball).
- Produces: the `SmokeResult` fields `progressPercents: number[]`, `firstProgressMs: number` and `progressJobMs: number`.

- [ ] **Step 1: Write the failing browser assertions**

In `test/browser/smoke.spec.ts`, add these fields to `interface SmokeResult`:

```ts
  progressPercents: number[];
  firstProgressMs: number;
  progressJobMs: number;
```

Append inside the test, after the frame-gap block:

```ts
    // Streaming progress (spec §3): 0 first, 100 last, strictly increasing, from a large encrypt.
    const percents = r.progressPercents;
    expect(percents[0]).toBe(0);
    expect(percents.at(-1)).toBe(100);
    expect(percents.every((p, i) => Number.isInteger(p) && (i === 0 || p > percents[i - 1]!))).toBe(true);
    expect(percents.length).toBeGreaterThanOrEqual(50);
    // Values arrived while the worker ran, not in one batch at the end. This relies on calls not being
    // throttled or batched (spec §3, guarantee 7). Only meaningful when the job was long enough to measure.
    if (r.progressJobMs > 300) {
      expect(r.firstProgressMs, `progressJobMs=${Math.round(r.progressJobMs)}`).toBeLessThan(r.progressJobMs * 0.75);
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build && npm run test:browser`
Expected: FAIL in all 9 tests. `r.progressPercents` is `undefined` (TypeError on `percents[0]`).

- [ ] **Step 3: Implement the smoke job and copy the generator into the apps**

In `test/browser/smoke.js`, add `import { imageHeavyPdf } from "./image-heavy-pdf.js";` below the existing import, and insert before `return {`:

```js
    // Streaming progress: a ~30 MB image-heavy PDF, where qpdf spends nearly the whole job writing.
    const big = imageHeavyPdf(60);
    const progress = [];
    const progressStarted = performance.now();
    await qpdf.encrypt(big, {
      userPassword: "u",
      ownerPassword: "o",
      onProgress: (percent) => progress.push({ percent, at: performance.now() - progressStarted }),
    });
    const progressJobMs = performance.now() - progressStarted;
```

Add to the returned object:

```js
      progressPercents: progress.map((p) => p.percent),
      firstProgressMs: progress[0]?.at ?? -1,
      progressJobMs,
```

In `scripts/prepare-browser-fixtures.sh`, below the `cp "$ROOT/test/browser/smoke.js" "$dir/smoke.js"` line, add:

```bash
  cp "$ROOT/test/browser/image-heavy-pdf.js" "$dir/image-heavy-pdf.js"
```

In `.gitignore`, below `test/browser/fixtures/*/smoke.js`, add:

```
test/browser/fixtures/*/image-heavy-pdf.js
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run build && npm run test:browser`
Expected: 9 passed (Chromium, Firefox, WebKit × vite build, webpack 5, vite dev). Then run `git status --short` and expect no `test/browser/fixtures/` entries.

- [ ] **Step 5: Commit**

```bash
git add test/browser/smoke.js test/browser/smoke.spec.ts scripts/prepare-browser-fixtures.sh .gitignore
git commit -m "test(browser): progress rises 0 to 100 and streams during a large encrypt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Recipe, docs, version 1.1.0, full verification

**Files:**
- Create: `examples/progress.mjs`
- Modify: `test/node/recipes.test.ts`, `README.md`, `AGENTS.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: the whole feature (Tasks 1–5).
- Produces: `compressWithProgressBar(file, bar)` in `examples/progress.mjs` (`bar`: a `<progress>` element or anything with `max`, `value` and `removeAttribute()`).

- [ ] **Step 1: Write the failing recipe test**

In `test/node/recipes.test.ts`, add `import { compressWithProgressBar } from "../../examples/progress.mjs";` with the other example imports, and add inside `describe("README recipes", …)`:

```ts
  it("progress bar", async () => {
    const events: (number | "indeterminate")[] = [];
    const bar = {
      max: 1,
      removeAttribute: (name: string) => {
        if (name === "value") events.push("indeterminate");
      },
      set value(percent: number) {
        events.push(percent);
      },
    };
    const output = await compressWithProgressBar(await fixture("shared-form-images.pdf"), bar);
    expect(events[0]).toBe("indeterminate");
    expect(events[1]).toBe(0);
    expect(events.at(-1)).toBe(100);
    expect(bar.max).toBe(100);
    expect(await pageCount(output)).toBe(6);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/node/recipes.test.ts`
Expected: FAIL. `../../examples/progress.mjs` cannot be resolved.

- [ ] **Step 3: Write the recipe**

Create `examples/progress.mjs`:

```js
import { createQpdf } from "@mssio/qpdf-wasm";

// `bar` is a <progress> element.
export async function compressWithProgressBar(file, bar) {
  const qpdf = await createQpdf();
  try {
    bar.removeAttribute("value"); // indeterminate until qpdf starts writing
    const { output } = await qpdf.compress(file, {
      onProgress: (percent) => {
        bar.max = 100;
        bar.value = percent;
      },
    });
    return output;
  } finally {
    qpdf.terminate();
  }
}
```

Run: `npx vitest run test/node/recipes.test.ts`. Expected: PASS.

- [ ] **Step 4: README**

Insert this section directly **before** `### Any qpdf command` in `README.md`. The code block must equal `examples/progress.mjs` exactly; `check:readme` compares them.

````md
### Progress bar

<!-- examples/progress.mjs -->
```js
import { createQpdf } from "@mssio/qpdf-wasm";

// `bar` is a <progress> element.
export async function compressWithProgressBar(file, bar) {
  const qpdf = await createQpdf();
  try {
    bar.removeAttribute("value"); // indeterminate until qpdf starts writing
    const { output } = await qpdf.compress(file, {
      onProgress: (percent) => {
        bar.max = 100;
        bar.value = percent;
      },
    });
    return output;
  } finally {
    qpdf.terminate();
  }
}
```

Every method except `info()` takes `onProgress`, and so does `run()`. qpdf calls it while it **writes** the output:

- Values are integers from 0 to 100 that strictly increase within one output file. Each new value is passed on at
  once, never batched (at most 101 calls per file).
- There are no calls before qpdf starts writing (reading the input, copying pages). For PDFs with many small objects
  that can be most of the job, so show an indeterminate state until the first call.
- 100% means qpdf finished writing that output, not that your work is done. If you run more qpdf calls afterwards
  (or before, like a password check), show a short "Finishing…" state instead of a bar stuck at 100%.
- `split()` starts again at 0 for each output file.
- `run()` reports progress only for commands that write a PDF; `--check`, `--json` and similar never call it.
- No calls after the promise settles or after `terminate()`. If the callback throws, the job continues and the
  error is rethrown asynchronously.
- With `inline: true` in a browser, qpdf runs on the main thread, so the page can't repaint between calls.
- To detect a stuck job, keep a size-based time limit until the first call, then fail only when no call has
  arrived for a while (we suggest 30 s: one percent can take seconds on a phone).
````

In the `### Methods` table, replace these rows:

```md
| `merge(inputs, { password?: (string \| undefined)[], onProgress? })` | `{ output, warnings }` |
| `split(input, { pagesPerFile? = 1, password?, onProgress? })` | `{ outputs, warnings }` in page order |
| `selectPages(input, ranges, { password?, onProgress? })` | `{ output, warnings }`. `ranges` uses [qpdf page-range syntax](https://qpdf.readthedocs.io/en/stable/cli.html#page-ranges): `"1-3,7,z"` |
| `rotate(input, [{ angle: 90 \| 180 \| 270 \| -90, pages? = "1-z" }], { password?, onProgress? })` | `{ output, warnings }`. Adds to the current rotation |
| `encrypt(input, { userPassword, ownerPassword, bits? = 256 \| 128, allow?: { print?, modify?, extract?, annotate? }, onProgress? })` | `{ output, warnings }`. AES. Anything not set to `false` stays allowed |
| `decrypt(input, { password, onProgress? })` | `{ output, warnings }` |
| `linearize(input, { password?, onProgress? })` | `{ output, warnings }` |
| `compress(input, { level? = 9, password?, onProgress? })` | `{ output, warnings }`. Object streams + recompressed streams |
| `run(args, { files?, onProgress? })` | `{ exitCode, stdout, stderr, files }`. Raw qpdf CLI; never rejects for qpdf exit codes. `files` are written to qpdf's working directory; the result's `files` holds every file the run created there. With `onProgress`, qpdf's progress lines are kept out of `stdout`/`stderr` |
```

At the end of the paragraph that starts `All inputs accept` (directly above the table), append the sentence:
`` `onProgress(percent)` reports write progress; see [Progress bar](#progress-bar). ``

- [ ] **Step 5: AGENTS.md**

In `AGENTS.md`'s repo map:
- Replace the `src/errors.ts` row with:
  `| \`src/errors.ts\` | \`QpdfError\`, stderr classification and the progress-line pattern (the only place that matches qpdf message text) |`
- Add a row below it:
  `| \`src/progress.ts\` | Write progress: drops repeats, keeps progress lines out of output, calls \`onProgress\` safely |`

In "Known gotchas", add:
`` - `--progress` prints to stdout, or to **stderr** when the PDF itself goes to stdout (`-`). With `onProgress` set, the engine strips progress lines from both; without it, output is untouched. Helpers request progress through job JSON (`progress: ""`), `run()` by putting `--progress` first. ``

(The CHANGELOG entry goes into the release commit in Step 7, so every commit keeps `repo-policy.test.ts` green.)

- [ ] **Step 6: Commit the docs**

Run: `npm run check:readme && npm test`
Expected: `README recipes in sync (11 recipes)` and PASS.

```bash
git add examples/progress.mjs test/node/recipes.test.ts README.md AGENTS.md
git commit -m "docs: progress bar recipe, README, AGENTS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: CHANGELOG and version 1.1.0 (release commit)**

At the top of `CHANGELOG.md`, below the intro paragraph, add the following. Use the release day as the date; if Task 7 tags on a later day, update it in the same PR before merging.

```md
## 1.1.0 — 2026-10-08

- **Progress:** `merge`, `split`, `selectPages`, `rotate`, `encrypt`, `decrypt`, `linearize`, `compress` and `run()`
  accept `onProgress?: (percent: number) => void`, called with qpdf's write progress while the job runs. See README
  "Progress bar". `info()` does not take it (it never writes a PDF).
- New exported types: `ProgressOptions`, `OutputOptions`, `DecryptOptions`. Existing calls compile and behave as before.
- Bundles qpdf 12.4.2 (unmodified), built with Emscripten 6.0.11.
```

Then:

```bash
npm version minor --no-git-tag-version
npm test
git add CHANGELOG.md package.json package-lock.json
git commit -m "release: v1.1.0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `package.json` says `"version": "1.1.0"` and `npm test` passes (including `repo-policy.test.ts`). Do **not** create a tag.

- [ ] **Step 8: Full verification**

Run: `bash scripts/ci.sh`
Expected: every step passes, including typecheck, unit + Node tests, `check-generated.sh`, build, `lint:package`, `check:package`, `check:readme` and the 9 browser tests. It needs Docker for `build:wasm`. If Docker is unavailable, run instead:
`npm run typecheck && npm test && npm run build && npm run lint:package && npm run check:package && npm run check:readme && npm run test:browser`.
Report which of the two you ran.

---

### Task 7: PR and release (main session, maintainer go-ahead at each outward step)

- [ ] **Step 1: Push and open the PR.** Ask the maintainer first. Then:

```bash
git push
gh pr create --base main --head feat/streaming-progress --title "feat: streaming write progress (1.1.0)" --body-file <scratchpad>/pr-body.md
```

The PR body covers:
- a summary of the API;
- the guarantees (spec §3);
- the pdf-mss-io caller guidance (spec §7);
- test counts;
- the size delta from `node scripts/size-report.mjs`, if it reports one.

It ends with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 2: Wait for CI.** Run `gh pr checks --watch`. Expected: `verify` green. If it is red, investigate with superpowers:systematic-debugging; never merge red.

- [ ] **Step 3: Merge.** The maintainer merges, or explicitly asks Claude to (`gh pr merge --merge`).

- [ ] **Step 4: Tag.** Only after the maintainer says go:

```bash
git switch main && git pull
git tag -a v1.1.0 -m "release: v1.1.0" && git push origin v1.1.0
```

- [ ] **Step 5: Watch the release.** Run `gh run watch` on `release.yml`, then `npm view @mssio/qpdf-wasm version`. Expected: `1.1.0`, which can take a few minutes to appear.

# @mssio/qpdf-wasm

[qpdf](https://github.com/qpdf/qpdf), the PDF transformation tool, compiled to WebAssembly.
Merge, split, rotate, encrypt, decrypt, linearize and compress PDFs **in the browser or Node**,
with no server and no native dependencies.

[![npm](https://img.shields.io/npm/v/@mssio/qpdf-wasm)](https://www.npmjs.com/package/@mssio/qpdf-wasm)
[![CI](https://github.com/mssio/qpdf-wasm/actions/workflows/ci.yml/badge.svg)](https://github.com/mssio/qpdf-wasm/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@mssio/qpdf-wasm)](./LICENSE)

<!-- qpdf-version -->Contains qpdf 12.4.2, built unmodified for WebAssembly.<!-- /qpdf-version -->
At runtime: `import { qpdfVersion } from "@mssio/qpdf-wasm"`.

> This is an independent project, not an official qpdf release. qpdf is built **unmodified** from its
> upstream source.

## Why

- **The real qpdf**: every qpdf feature is reachable, including through the raw CLI (`run()`).
- **Runs in a Web Worker** by default, so your UI never freezes.
- **Works with any framework**: plain ESM + Promises + TypeScript types. React, Vue, Svelte, Angular, vanilla.
- **Zero bundler config** with Vite and webpack 5 (tested); see Bundlers & hosting for others.
- **Lazy**: the ~700 KB (gzip) wasm downloads only when you call `createQpdf()`.

## Install

```sh
npm install @mssio/qpdf-wasm
```

TypeScript users need TypeScript ≥ 5.7: outputs are typed `Uint8Array<ArrayBuffer>`, so `new Blob([output])`
type-checks.

## Quick start

```js
import { createQpdf } from "@mssio/qpdf-wasm";

const qpdf = await createQpdf();                 // starts a worker, loads qpdf.wasm
const [a, b] = document.querySelector("input[type=file]").files;
const { output } = await qpdf.merge([a, b]);     // File/Blob, Uint8Array or ArrayBuffer
const url = URL.createObjectURL(new Blob([output], { type: "application/pdf" }));
window.open(url);
```

## Recipes

Every recipe below is a real file in [`examples/`](./examples) and is executed by the test suite.

### Merge

<!-- examples/merge.mjs -->
```js
import { createQpdf } from "@mssio/qpdf-wasm";

export async function mergePdfs(files) {
  const qpdf = await createQpdf();
  try {
    const { output } = await qpdf.merge(files);
    return new Blob([output], { type: "application/pdf" });
  } finally {
    qpdf.terminate();
  }
}
```

### Split into pages

<!-- examples/split.mjs -->
```js
import { createQpdf } from "@mssio/qpdf-wasm";

export async function splitPdf(file) {
  const qpdf = await createQpdf();
  try {
    const { outputs } = await qpdf.split(file); // one PDF per page, in page order
    return outputs;
  } finally {
    qpdf.terminate();
  }
}
```

### Select pages

<!-- examples/select-pages.mjs -->
```js
import { createQpdf } from "@mssio/qpdf-wasm";

export async function extractPages(file, ranges) {
  const qpdf = await createQpdf();
  try {
    const { output } = await qpdf.selectPages(file, ranges); // e.g. "1-3,7,z" (z = last page)
    return output;
  } finally {
    qpdf.terminate();
  }
}
```

### Rotate

<!-- examples/rotate.mjs -->
```js
import { createQpdf } from "@mssio/qpdf-wasm";

export async function rotateFirstPage(file) {
  const qpdf = await createQpdf();
  try {
    const { output } = await qpdf.rotate(file, [{ angle: 90, pages: "1" }]);
    return output;
  } finally {
    qpdf.terminate();
  }
}
```

### Encrypt

<!-- examples/encrypt.mjs -->
```js
import { createQpdf } from "@mssio/qpdf-wasm";

export async function protectPdf(file, userPassword, ownerPassword) {
  const qpdf = await createQpdf();
  try {
    const { output } = await qpdf.encrypt(file, {
      userPassword,
      ownerPassword,
      allow: { print: true, modify: false }, // AES-256 by default
    });
    return output;
  } finally {
    qpdf.terminate();
  }
}
```

### Decrypt, prompting for the password

<!-- examples/decrypt.mjs -->
```js
import { createQpdf, QpdfError } from "@mssio/qpdf-wasm";

export async function unlockPdf(file, askPassword) {
  const qpdf = await createQpdf();
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const password = await askPassword(attempt);
      try {
        // Inputs are transferred to the worker, so pass a copy when you may retry.
        const { output } = await qpdf.decrypt(file.slice(), { password });
        return output;
      } catch (error) {
        if (!(error instanceof QpdfError && error.code === "INVALID_PASSWORD")) throw error;
      }
    }
    throw new Error("Too many wrong passwords");
  } finally {
    qpdf.terminate();
  }
}
```

### Linearize (fast web view)

<!-- examples/linearize.mjs -->
```js
import { createQpdf } from "@mssio/qpdf-wasm";

export async function optimizeForWeb(file) {
  const qpdf = await createQpdf();
  try {
    const { output } = await qpdf.linearize(file); // "fast web view"
    return output;
  } finally {
    qpdf.terminate();
  }
}
```

### Compress

<!-- examples/compress.mjs -->
```js
import { createQpdf } from "@mssio/qpdf-wasm";

export async function shrinkPdf(file) {
  const qpdf = await createQpdf();
  try {
    const { output } = await qpdf.compress(file, { level: 9 });
    return output;
  } finally {
    qpdf.terminate();
  }
}
```

### Inspect

<!-- examples/info.mjs -->
```js
import { createQpdf } from "@mssio/qpdf-wasm";

export async function describePdf(file) {
  const qpdf = await createQpdf();
  try {
    const { pdfVersion, pageCount, encrypted } = await qpdf.info(file);
    return `PDF ${pdfVersion}, ${pageCount} pages, ${encrypted ? "encrypted" : "not encrypted"}`;
  } finally {
    qpdf.terminate();
  }
}
```

### Any qpdf command

<!-- examples/run.mjs -->
```js
import { createQpdf } from "@mssio/qpdf-wasm";

export async function checkPdf(file) {
  const qpdf = await createQpdf();
  try {
    // Any qpdf command line works; files are placed in qpdf's working directory.
    const { exitCode, stdout, stderr } = await qpdf.run(["--check", "input.pdf"], { files: { "input.pdf": file } });
    // qpdf exit codes: 0 = success, 3 = success with warnings, 2 = error
    return { ok: exitCode === 0, report: exitCode === 0 ? stdout : stderr };
  } finally {
    qpdf.terminate();
  }
}
```

The recipes create and terminate an instance each, so they're self-contained. In an app, create **one**
instance and reuse it (see below).

## Framework usage

Create one instance for the app (or a component's lifetime) and call `terminate()` when done. With SSR
frameworks such as Next.js, Nuxt or SvelteKit, create the instance on the client only (inside `useEffect`,
`onMounted` or `onMount`, as below).

**React**

```jsx
import { useEffect, useState } from "react";
import { createQpdf } from "@mssio/qpdf-wasm";

export function useQpdf() {
  const [qpdf, setQpdf] = useState(null);
  useEffect(() => {
    let instance;
    let cancelled = false;
    createQpdf()
      .then((q) => (cancelled ? q.terminate() : setQpdf((instance = q))))
      .catch((error) => console.error("qpdf failed to load", error));
    return () => {
      cancelled = true;
      instance?.terminate();
    };
  }, []);
  return qpdf; // null until ready
}
```

**Vue**

```js
import { onBeforeUnmount, onMounted, shallowRef } from "vue";
import { createQpdf } from "@mssio/qpdf-wasm";

export function useQpdf() {
  const qpdf = shallowRef(null);
  let ready;
  onMounted(() => {
    // Client only: onMounted never runs during SSR.
    ready = createQpdf().then((q) => (qpdf.value = q));
    ready.catch((error) => console.error("qpdf failed to load", error));
  });
  onBeforeUnmount(() => ready?.then((q) => q.terminate(), () => {}));
  return qpdf; // null until ready
}
```

**Svelte**

```svelte
<script>
  import { onMount } from "svelte";
  import { createQpdf } from "@mssio/qpdf-wasm";
  let ready; // created on the client only: onMount never runs during SSR
  onMount(() => {
    ready = createQpdf();
    ready.catch((error) => console.error("qpdf failed to load", error));
    return () => ready.then((q) => q.terminate(), () => {});
  });
  async function merge(files) {
    const qpdf = await ready;
    return (await qpdf.merge([...files])).output;
  }
</script>
```

**Vanilla**

```js
import { createQpdf } from "@mssio/qpdf-wasm";
export const qpdf = await createQpdf(); // module-level singleton
```

## API

### `createQpdf(options?) → Promise<Qpdf>`

| Option | Type | Default | |
|---|---|---|---|
| `wasmUrl` | `string \| URL` | next to the package JS | Load `qpdf.wasm` from elsewhere (e.g. a CDN) |
| `workers` | `number` | `1` | Workers in the pool; jobs beyond that are queued |
| `inline` | `boolean` | `true` where there is no global `Worker` (Node), else `false` | Run on the calling thread instead of a worker |

### Methods

All inputs accept `Uint8Array | ArrayBuffer | Blob` (including `File`). All outputs are `Uint8Array`.
`warnings` lists qpdf warnings when qpdf succeeded with warnings (e.g. a repaired damaged file).

| Method | Returns |
|---|---|
| `merge(inputs, { password?: (string \| undefined)[] })` | `{ output, warnings }` |
| `split(input, { pagesPerFile? = 1, password? })` | `{ outputs, warnings }` in page order |
| `selectPages(input, ranges, { password? })` | `{ output, warnings }`. `ranges` uses [qpdf page-range syntax](https://qpdf.readthedocs.io/en/stable/cli.html#page-ranges): `"1-3,7,z"` |
| `rotate(input, [{ angle: 90 \| 180 \| 270 \| -90, pages? = "1-z" }], { password? })` | `{ output, warnings }`. Adds to the current rotation |
| `encrypt(input, { userPassword, ownerPassword, bits? = 256 \| 128, allow?: { print?, modify?, extract?, annotate? } })` | `{ output, warnings }`. AES. Anything not set to `false` stays allowed |
| `decrypt(input, { password })` | `{ output, warnings }` |
| `linearize(input, { password? })` | `{ output, warnings }` |
| `compress(input, { level? = 9, password? })` | `{ output, warnings }`. Object streams + recompressed streams |
| `info(input, { password? })` | `{ pdfVersion, pageCount, encrypted, warnings }` |
| `run(args, { files? })` | `{ exitCode, stdout, stderr, files }`. Raw qpdf CLI; never rejects for qpdf exit codes. `files` are written to qpdf's working directory; the result's `files` holds every file the run created there |
| `terminate()` | Stops workers; pending and later calls reject with `TERMINATED` |

`qpdfVersion` (string) is the bundled qpdf version.

### Errors

Helpers reject with `QpdfError { code, message, exitCode, stderr }`:

| `code` | When |
|---|---|
| `INVALID_PASSWORD` | Wrong or missing password for an encrypted PDF |
| `INVALID_PDF` | The input is not a readable PDF |
| `FAILED` | Any other qpdf failure (`message` is qpdf's reason); qpdf crashing (`message` starts with `qpdf crashed:`) or its worker dying; `qpdf.wasm` or the worker script failing to load; `inline: false` where Web Workers don't exist |
| `TERMINATED` | `terminate()` was called |

Invalid arguments (e.g. `merge([])`, `compress(x, { level: 12 })`) throw `RangeError`/`TypeError`.

### Inputs are transferred, not copied

To avoid copying large files, `Uint8Array`/`ArrayBuffer` inputs are **transferred** to the worker, so
your buffer becomes empty (detached) after the call. Reusing it throws a `TypeError` that says so.
To keep using the bytes, pass a copy: `qpdf.info(bytes.slice())`. `Blob`/`File` inputs and views into
larger buffers (e.g. `subarray`) are copied automatically, so your data stays intact.

## Bundlers & hosting

- **Vite and webpack 5**: no configuration needed, in production builds and (for Vite) the dev server.
  Tested in CI in Chromium, Firefox and WebKit.
- **Next.js** (webpack or Turbopack): uses the same standard
  `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })` and
  `new URL("./wasm/qpdf.wasm", import.meta.url)` patterns. Not tested in CI.
- **Rollup and esbuild**: these do not emit assets for `new URL(..., import.meta.url)` on their own, so you
  need an `import.meta.url` asset plugin. Not tested.
- **CDN / custom location**: `createQpdf({ wasmUrl: "https://cdn.example.com/qpdf.wasm" })`.
- **MIME type**: serve `.wasm` as `application/wasm` for the fastest (streaming) compile. Other types still work.
- **Content-Security-Policy**: allow `script-src 'wasm-unsafe-eval'` and `worker-src 'self'`.

## Node.js

Node ≥ 20.16. With no global `Worker`, jobs run inline on the calling thread automatically:

```js
import { readFile, writeFile } from "node:fs/promises";
import { createQpdf } from "@mssio/qpdf-wasm";

const qpdf = await createQpdf();
const { output } = await qpdf.linearize(await readFile("in.pdf"));
await writeFile("out.pdf", output);
```

**Node vs browser.** Inline mode (Node, or `inline: true`) never transfers, so it never detaches your inputs,
and `terminate()` cannot cancel a job that is already running (it only rejects later calls). Code that runs in
both should still pass `bytes.slice()` whenever it reuses the bytes after a call.

## Performance & limits

- `qpdf.wasm` is compiled once per worker and cached. In our tests, starting a job takes a few milliseconds
  after that, and small test PDFs (~30 KB) process in tens of milliseconds; large files scale with size.
- Files are held in memory (in the worker). Peak memory can be much more than input + output: merging 1,500
  small files into a 34 MB output peaked around 600 MB RSS in Node. Each job's wasm heap is capped at 2 GB.
- Inline mode (Node) runs each job synchronously on the calling thread, so it blocks the Node event loop for
  the duration of the job. Run it in a `worker_threads` worker if your server must stay responsive.

## Versioning

This package uses its own semver:
- **minor**: a new bundled qpdf version
- **major**: breaking changes to this package's JS API
- **patch**: fixes

qpdf releases are picked up automatically and land as tested pull requests. The bundled qpdf version is in
`qpdfVersion` and in the [CHANGELOG](./CHANGELOG.md).

## Building from source

Requires Docker and Node 24.

```sh
git clone --recursive https://github.com/mssio/qpdf-wasm.git
cd qpdf-wasm
npm ci
npm run build:wasm   # compiles qpdf in the pinned emscripten/emsdk image (~1 min)
npm test
npm run build
```

See [AGENTS.md](./AGENTS.md) for the full contributor guide.

## License & credits

- This package: [Apache-2.0](./LICENSE).
- [qpdf](https://github.com/qpdf/qpdf) by Jay Berkenbilt and Manfred Holger, Apache-2.0.
- zlib by Jean-loup Gailly and Mark Adler; libjpeg by the Independent JPEG Group.
- Full license texts: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

This software is based in part on the work of the Independent JPEG Group.

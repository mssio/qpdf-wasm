# @mssio/qpdf-wasm

[qpdf](https://github.com/qpdf/qpdf), the PDF transformation tool, compiled to WebAssembly.
Merge, split, rotate, encrypt, decrypt, linearize and compress PDFs **in the browser or Node**,
with no server and no native dependencies.

[![npm](https://img.shields.io/npm/v/@mssio/qpdf-wasm)](https://www.npmjs.com/package/@mssio/qpdf-wasm)
[![CI](https://github.com/mssio/qpdf-wasm/actions/workflows/ci.yml/badge.svg)](https://github.com/mssio/qpdf-wasm/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@mssio/qpdf-wasm)](./LICENSE)

Bundled qpdf version: see [CHANGELOG](./CHANGELOG.md) or `import { qpdfVersion } from "@mssio/qpdf-wasm"`.

> This is an independent project, not an official qpdf release. qpdf is built **unmodified** from its
> upstream source.

## Why

- **The real qpdf**: every qpdf feature is reachable, including through the raw CLI (`run()`).
- **Runs in a Web Worker** by default, so your UI never freezes.
- **Works with any framework**: plain ESM + Promises + TypeScript types. React, Vue, Svelte, Angular, vanilla.
- **Zero bundler config**: tested with Vite (production build and dev server) and webpack 5 in Chromium,
  Firefox and WebKit. Rollup, esbuild and Next.js understand the same standard
  `new URL(..., import.meta.url)` and `new Worker(new URL(...))` patterns (not tested here).
- **Lazy**: the ~697 KB (gzip) wasm downloads only when you call `createQpdf()`.

## Install

```sh
npm install @mssio/qpdf-wasm
```

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
    return { ok: exitCode === 0, report: exitCode === 0 ? stdout : stderr };
  } finally {
    qpdf.terminate();
  }
}
```

The recipes create and terminate an instance each, so they're self-contained. In an app, create **one**
instance and reuse it (see below).

## Framework usage

Create one instance for the app (or a component's lifetime) and call `terminate()` when done.

**React**

```jsx
import { useEffect, useState } from "react";
import { createQpdf } from "@mssio/qpdf-wasm";

export function useQpdf() {
  const [qpdf, setQpdf] = useState(null);
  useEffect(() => {
    let instance;
    let cancelled = false;
    createQpdf().then((q) => (cancelled ? q.terminate() : setQpdf((instance = q))));
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
import { onBeforeUnmount, shallowRef } from "vue";
import { createQpdf } from "@mssio/qpdf-wasm";

export function useQpdf() {
  const qpdf = shallowRef(null);
  const ready = createQpdf().then((q) => (qpdf.value = q));
  onBeforeUnmount(() => ready.then((q) => q.terminate()));
  return qpdf;
}
```

**Svelte**

```svelte
<script>
  import { onDestroy } from "svelte";
  import { createQpdf } from "@mssio/qpdf-wasm";
  const ready = createQpdf();
  onDestroy(() => ready.then((q) => q.terminate()));
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
| `FAILED` | Any other qpdf failure (`message` is qpdf's reason), a crashed worker, or `qpdf.wasm` failing to load |
| `TERMINATED` | `terminate()` was called |

Invalid arguments (e.g. `merge([])`, `compress(x, { level: 12 })`) throw `RangeError`/`TypeError`.

### Inputs are transferred, not copied

To avoid copying large files, `Uint8Array`/`ArrayBuffer` inputs are **transferred** to the worker, so
your buffer becomes empty (detached) after the call. Reusing it throws a `TypeError` that says so.
To keep using the bytes, pass a copy: `qpdf.info(bytes.slice())`. `Blob`/`File` inputs and views into
larger buffers (e.g. `subarray`) are copied automatically, so your data stays intact.

## Bundlers & hosting

- **Vite and webpack 5**: no configuration needed, in production builds and (for Vite) the dev server.
  This is covered by the browser test suite in Chromium, Firefox and WebKit.
- **Rollup, esbuild, Next.js**: the package uses the standard
  `new Worker(new URL("./worker.js", import.meta.url), { type: "module" })` and
  `new URL("./wasm/qpdf.wasm", import.meta.url)` patterns, which these tools understand. They are not part
  of this project's test matrix.
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

## Performance & limits

- Module start-up is a few milliseconds once `qpdf.wasm` is compiled (compiled once per worker and cached).
- Small PDFs process in tens of milliseconds.
- Files are held in memory (in the worker), so peak memory is roughly input size + output size.

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

import { QpdfError } from "./errors.js";
import { createProgressFilter } from "./progress.js";
import type { JobSpec, RunResult } from "./types.js";
import createQpdfModule, { type QpdfModule } from "./wasm/qpdf.mjs";

/** Working directory inside each module instance; relative job paths resolve here. */
export const WORKDIR = "/work";

/**
 * Runs one qpdf job in a brand-new module instance. qpdf keeps process-global state
 * (e.g. its logger), so an instance must never be reused for a second job.
 */
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

  mod.FS.mkdir(WORKDIR);
  mod.FS.chdir(WORKDIR);
  const inputs = new Set<string>();
  Object.values(spec.files).forEach((data, index) => {
    const path = paths[index]!;
    mkdirp(mod, path.slice(0, path.lastIndexOf("/")));
    mod.FS.writeFile(path, data);
    inputs.add(path);
  });

  const exitCode = callMain(mod, spec.args);

  const files: Record<string, Uint8Array<ArrayBuffer>> = {};
  for (const path of listFiles(mod, WORKDIR)) {
    if (!inputs.has(path)) files[path.slice(WORKDIR.length + 1)] = mod.FS.readFile(path);
  }
  return { exitCode, stdout: stdout.join("\n"), stderr: stderr.join("\n"), files };
}

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

function callMain(mod: QpdfModule, args: string[]): number {
  try {
    // Copy: Emscripten's callMain unshifts thisProgram into the array it is given.
    return mod.callMain([...args]) ?? 0;
  } catch (error) {
    // qpdf calls exit(); Emscripten surfaces that as a thrown ExitStatus { status }.
    if (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") {
      return error.status;
    }
    throw error;
  }
}

function resolvePath(name: string): string {
  const absolute = name.startsWith("/") ? name : `${WORKDIR}/${name}`;
  const segments = absolute.split("/").filter((s) => s !== "" && s !== ".");
  const path = `/${segments.join("/")}`;
  if (segments.includes("..") || path === "/" || path === WORKDIR) {
    throw new QpdfError("FAILED", `invalid file path: ${name}`);
  }
  return path;
}

function mkdirp(mod: QpdfModule, dir: string): void {
  let current = "";
  for (const part of dir.split("/").filter(Boolean)) {
    current += `/${part}`;
    if (!mod.FS.analyzePath(current).exists) mod.FS.mkdir(current);
  }
}

function* listFiles(mod: QpdfModule, dir: string): Generator<string> {
  for (const name of mod.FS.readdir(dir)) {
    if (name === "." || name === "..") continue;
    const path = `${dir}/${name}`;
    const { mode } = mod.FS.stat(path);
    if (mod.FS.isDir(mode)) yield* listFiles(mod, path);
    else if (mod.FS.isFile(mode)) yield path;
  }
}

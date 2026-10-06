// Runs one qpdf operation from src/ (inline mode) in a worker thread, so the test can terminate a
// job that never returns: a synchronous wasm loop would also block a test timeout on the same thread.
// Node strips the TypeScript types; the hook maps src's relative "./x.js" imports to "./x.ts".
import { registerHooks } from "node:module";
import { parentPort, workerData } from "node:worker_threads";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && specifier.endsWith(".js")) return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
      throw error;
    }
  },
});

const { createQpdf, QpdfError } = await import("../../src/index.ts");
const { op, pdf } = workerData;
const qpdf = await createQpdf({ inline: true });
const files = { "in.pdf": pdf };
try {
  if (op === "compress") {
    await qpdf.compress(pdf);
    parentPort.postMessage({ kind: "resolved" });
  } else {
    const args = { copy: ["in.pdf", "out.pdf"], check: ["--check", "in.pdf"], json: ["--json", "in.pdf"] }[op];
    const result = await qpdf.run(args, { files });
    parentPort.postMessage({ kind: "exit", exitCode: result.exitCode });
  }
} catch (error) {
  parentPort.postMessage({
    kind: "rejected",
    qpdfError: error instanceof QpdfError,
    name: error?.name,
    message: String(error?.message ?? error),
  });
}

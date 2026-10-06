import { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";

// Regression: qpdf recurses on nested PDF objects. With Emscripten's default 64 KB stack this
// overflowed into static data (crashes, corruption, or an endless loop). See build/build.sh STACK_SIZE.

const TIMEOUT_MS = 20_000;

/** A valid 3-object PDF whose catalog has /X nested `depth` levels deep, with a correct xref table. */
function nestedPdf(kind: "array" | "dict", depth: number): Uint8Array {
  const x = kind === "array" ? `${"[".repeat(depth)}${"]".repeat(depth)}` : `${"<< /A ".repeat(depth)}null${" >>".repeat(depth)}`;
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R /X ${x} >>`,
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
  ];
  let pdf = "%PDF-1.7\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

type Outcome =
  | { kind: "exit"; exitCode: number }
  | { kind: "resolved" }
  | { kind: "rejected"; qpdfError: boolean; name: string; message: string }
  | { kind: "crashed"; message: string }
  | { kind: "hung" };

function runIsolated(op: string, pdf: Uint8Array): Promise<Outcome> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./nesting-worker.mjs", import.meta.url), { workerData: { op, pdf } });
    const timer = setTimeout(() => {
      void worker.terminate();
      resolve({ kind: "hung" });
    }, TIMEOUT_MS);
    const finish = (outcome: Outcome) => {
      clearTimeout(timer);
      void worker.terminate();
      resolve(outcome);
    };
    worker.once("message", finish);
    worker.once("error", (error: Error) => finish({ kind: "crashed", message: `${error.name}: ${error.message}` }));
  });
}

describe.each(["array", "dict"] as const)("deeply nested %s objects", (kind) => {
  describe.each([100, 300, 490])("depth %i", (depth) => {
    const pdf = nestedPdf(kind, depth);
    it.each(["copy", "check", "json", "compress"])(
      "%s completes without crashing or hanging",
      async (op) => {
        const outcome = await runIsolated(op, pdf);
        if (outcome.kind === "exit") {
          expect([0, 2, 3], JSON.stringify(outcome)).toContain(outcome.exitCode);
        } else if (outcome.kind === "rejected") {
          // A clean qpdf failure is fine; a wasm trap (even when wrapped as "qpdf crashed") is not.
          expect(outcome, JSON.stringify(outcome)).toMatchObject({ qpdfError: true });
          expect(outcome.message).not.toMatch(/qpdf crashed|RuntimeError|out of bounds|signature mismatch|unreachable/);
        } else {
          expect(outcome).toEqual({ kind: "resolved" });
        }
      },
      TIMEOUT_MS + 10_000,
    );
  });
});

// Type-level test, checked by `npm run typecheck` and never executed: what a consumer writes with
// TypeScript >= 5.7 and lib "dom". Outputs must be Uint8Array<ArrayBuffer> to be valid BlobParts.
import { createQpdf, type DecryptOptions, type OutputOptions, type ProgressOptions } from "@mssio/qpdf-wasm";

export async function consumer(input: File): Promise<Blob[]> {
  const qpdf = await createQpdf();
  const { output } = await qpdf.compress(input);
  const { outputs } = await qpdf.split(input);
  const { files } = await qpdf.run(["--check", "in.pdf"], { files: { "in.pdf": input } });
  const buffer: ArrayBuffer = output.buffer;
  return [
    new Blob([output], { type: "application/pdf" }),
    new Blob([buffer]),
    ...outputs.map((part) => new Blob([part])),
    ...Object.values(files).map((file) => new Blob([file])),
  ];
}

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

// Type-level test, checked by `npm run typecheck` and never executed: what a consumer writes with
// TypeScript >= 5.7 and lib "dom". Outputs must be Uint8Array<ArrayBuffer> to be valid BlobParts.
import { createQpdf } from "@mssio/qpdf-wasm";

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

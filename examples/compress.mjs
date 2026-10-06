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

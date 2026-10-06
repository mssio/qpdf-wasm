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

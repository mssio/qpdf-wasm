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

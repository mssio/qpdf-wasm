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

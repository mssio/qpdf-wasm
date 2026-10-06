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

import { createQpdf } from "@mssio/qpdf-wasm";

export async function rotateFirstPage(file) {
  const qpdf = await createQpdf();
  try {
    const { output } = await qpdf.rotate(file, [{ angle: 90, pages: "1" }]);
    return output;
  } finally {
    qpdf.terminate();
  }
}

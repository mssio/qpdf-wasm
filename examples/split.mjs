import { createQpdf } from "@mssio/qpdf-wasm";

export async function splitPdf(file) {
  const qpdf = await createQpdf();
  try {
    const { outputs } = await qpdf.split(file); // one PDF per page, in page order
    return outputs;
  } finally {
    qpdf.terminate();
  }
}

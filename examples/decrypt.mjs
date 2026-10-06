import { createQpdf, QpdfError } from "@mssio/qpdf-wasm";

export async function unlockPdf(file, askPassword) {
  const qpdf = await createQpdf();
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const password = await askPassword(attempt);
      try {
        // Inputs are transferred to the worker, so pass a copy when you may retry.
        const { output } = await qpdf.decrypt(file.slice(), { password });
        return output;
      } catch (error) {
        if (!(error instanceof QpdfError && error.code === "INVALID_PASSWORD")) throw error;
      }
    }
    throw new Error("Too many wrong passwords");
  } finally {
    qpdf.terminate();
  }
}

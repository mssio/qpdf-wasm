import { createQpdf } from "@mssio/qpdf-wasm";

export async function protectPdf(file, userPassword, ownerPassword) {
  const qpdf = await createQpdf();
  try {
    const { output } = await qpdf.encrypt(file, {
      userPassword,
      ownerPassword,
      allow: { print: true, modify: false }, // AES-256 by default
    });
    return output;
  } finally {
    qpdf.terminate();
  }
}

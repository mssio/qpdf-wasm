import { createQpdf } from "@mssio/qpdf-wasm";

export async function checkPdf(file) {
  const qpdf = await createQpdf();
  try {
    // Any qpdf command line works; files are placed in qpdf's working directory.
    const { exitCode, stdout, stderr } = await qpdf.run(["--check", "input.pdf"], { files: { "input.pdf": file } });
    return { ok: exitCode === 0, report: exitCode === 0 ? stdout : stderr };
  } finally {
    qpdf.terminate();
  }
}

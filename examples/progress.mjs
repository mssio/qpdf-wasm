import { createQpdf } from "@mssio/qpdf-wasm";

// `bar` is a <progress> element.
export async function compressWithProgressBar(file, bar) {
  const qpdf = await createQpdf();
  try {
    bar.removeAttribute("value"); // indeterminate until qpdf starts writing
    const { output } = await qpdf.compress(file, {
      onProgress: (percent) => {
        bar.max = 100;
        bar.value = percent;
      },
    });
    return output;
  } finally {
    qpdf.terminate();
  }
}

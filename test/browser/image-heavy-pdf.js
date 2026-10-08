// Builds an image-heavy PDF in memory: `pages` pages, each with one uncompressed `side`×`side` grey image of
// random bytes. qpdf compresses and writes those streams, so nearly the whole job is in its write phase (where it
// reports progress). Plain JS with no imports: also copied into the browser fixture apps.

/**
 * @param {number} pages
 * @param {number} [side]
 * @returns {Uint8Array}
 */
export function imageHeavyPdf(pages, side = 700) {
  const text = new TextEncoder();
  /** @type {Uint8Array[]} */
  const chunks = [];
  /** @type {number[]} */
  const offsets = [];
  let length = 0;
  /** @param {string | Uint8Array} part */
  const push = (part) => {
    const bytes = typeof part === "string" ? text.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  /** @param {number} id @param {...(string | Uint8Array)} parts */
  const object = (id, ...parts) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    parts.forEach(push);
    push("\nendobj\n");
  };

  push("%PDF-1.7\n");
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i * 3} 0 R`).join(" ");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`);
  const content = "q 612 0 0 792 0 0 cm /Im0 Do Q";
  for (let i = 0; i < pages; i++) {
    const page = 3 + i * 3;
    const pixels = new Uint8Array(side * side);
    // getRandomValues fills at most 65,536 bytes per call.
    for (let at = 0; at < pixels.length; at += 65536) crypto.getRandomValues(pixels.subarray(at, at + 65536));
    object(
      page,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 ${page + 1} 0 R >> >> /Contents ${page + 2} 0 R >>`,
    );
    object(
      page + 1,
      `<< /Type /XObject /Subtype /Image /Width ${side} /Height ${side} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${pixels.length} >>\nstream\n`,
      pixels,
      "\nendstream",
    );
    object(page + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  const size = 3 + pages * 3;
  const entries = offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`);
  const xrefAt = length; // startxref must point at the xref table, so capture it before pushing it
  push(`xref\n0 ${size}\n0000000000 65535 f \n${entries.join("")}`);
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const pdf = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    pdf.set(chunk, at);
    at += chunk.length;
  }
  return pdf;
}

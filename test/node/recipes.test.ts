import { describe, expect, it } from "vitest";
import { createQpdf } from "@mssio/qpdf-wasm";
import { shrinkPdf } from "../../examples/compress.mjs";
import { unlockPdf } from "../../examples/decrypt.mjs";
import { protectPdf } from "../../examples/encrypt.mjs";
import { describePdf } from "../../examples/info.mjs";
import { optimizeForWeb } from "../../examples/linearize.mjs";
import { mergePdfs } from "../../examples/merge.mjs";
import { rotateFirstPage } from "../../examples/rotate.mjs";
import { checkPdf } from "../../examples/run.mjs";
import { extractPages } from "../../examples/select-pages.mjs";
import { splitPdf } from "../../examples/split.mjs";
import { fixture } from "../helpers.js";

const pageCount = async (bytes: Uint8Array) => {
  const qpdf = await createQpdf({ inline: true });
  try {
    return (await qpdf.info(bytes)).pageCount;
  } finally {
    qpdf.terminate();
  }
};

describe("README recipes", () => {
  it("merge", async () => {
    const blob = await mergePdfs([await fixture("form.pdf"), await fixture("shared-form-images.pdf")]);
    expect(blob.type).toBe("application/pdf");
    expect(await pageCount(new Uint8Array(await blob.arrayBuffer()))).toBe(9);
  });
  it("split", async () => {
    expect(await splitPdf(await fixture("form.pdf"))).toHaveLength(3);
  });
  it("select pages", async () => {
    expect(await pageCount(await extractPages(await fixture("shared-form-images.pdf"), "1-2"))).toBe(2);
  });
  it("rotate", async () => {
    expect(await pageCount(await rotateFirstPage(await fixture("form.pdf")))).toBe(3);
  });
  it("encrypt + decrypt with a password prompt", async () => {
    const locked = await protectPdf(await fixture("form.pdf"), "secret", "owner");
    const prompts: number[] = [];
    const unlocked = await unlockPdf(locked, async (attempt: number) => {
      prompts.push(attempt);
      return attempt === 1 ? "wrong" : "secret";
    });
    expect(prompts).toEqual([1, 2]);
    expect(await pageCount(unlocked)).toBe(3);
  });
  it("linearize", async () => {
    expect(await pageCount(await optimizeForWeb(await fixture("form.pdf")))).toBe(3);
  });
  it("compress", async () => {
    expect(await pageCount(await shrinkPdf(await fixture("form.pdf")))).toBe(3);
  });
  it("info", async () => {
    expect(await describePdf(await fixture("form.pdf"))).toBe("PDF 1.4, 3 pages, not encrypted");
  });
  it("run", async () => {
    expect((await checkPdf(await fixture("form.pdf"))).ok).toBe(true);
    expect((await checkPdf(await fixture("not-a-pdf.txt"))).ok).toBe(false);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createQpdf, QpdfError, qpdfVersion, type Qpdf } from "../../src/index.js";
import { fixture } from "../helpers.js";

let qpdf: Qpdf;
const form = () => fixture("form.pdf"); // 3 pages
const shared = () => fixture("shared-form-images.pdf"); // 6 pages

beforeAll(async () => {
  qpdf = await createQpdf({ inline: true });
});
afterAll(() => qpdf.terminate());

const pages = async (pdf: Uint8Array, password?: string) => (await qpdf.info(pdf, { password })).pageCount;

async function rotateMarkers(pdf: Uint8Array): Promise<string[]> {
  const { files } = await qpdf.run(["--qdf", "--object-streams=disable", "in.pdf", "out.pdf"], { files: { "in.pdf": pdf } });
  const text = new TextDecoder("latin1").decode(files["out.pdf"]);
  return [...text.matchAll(/\/Rotate (-?\d+)/g)].map((m) => m[1]!);
}

async function expectQpdfError(promise: Promise<unknown>, code: QpdfError["code"]): Promise<QpdfError> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(QpdfError);
  expect((err as QpdfError).code).toBe(code);
  return err as QpdfError;
}

describe("exports", () => {
  it("exposes the bundled qpdf version", () => {
    expect(qpdfVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("info", () => {
  it("reports version, pages and encryption", async () => {
    expect(await qpdf.info(await form())).toEqual({ pdfVersion: "1.4", pageCount: 3, encrypted: false, warnings: [] });
  });
  it("rejects non-PDF input with INVALID_PDF", async () => {
    await expectQpdfError(qpdf.info(await fixture("not-a-pdf.txt")), "INVALID_PDF");
    await expectQpdfError(qpdf.info(new Uint8Array(0)), "INVALID_PDF");
  });
});

describe("merge / split / selectPages", () => {
  it("merges in order", async () => {
    const { output, warnings } = await qpdf.merge([await form(), await shared()]);
    expect(await pages(output)).toBe(9);
    expect(warnings).toEqual([]);
  });
  it("splits one page per file and in groups", async () => {
    expect((await qpdf.split(await shared())).outputs).toHaveLength(6);
    const { outputs } = await qpdf.split(await shared(), { pagesPerFile: 4 });
    expect(await Promise.all(outputs.map((o) => pages(o)))).toEqual([4, 2]);
  });
  it("returns ≥10 split outputs in page order", async () => {
    const twelve = (await qpdf.merge([await form(), await form(), await form(), await form()])).output;
    const numbered = (await qpdf.rotate(twelve, [{ angle: 90, pages: "10" }])).output;
    const { outputs } = await qpdf.split(numbered);
    expect(outputs).toHaveLength(12);
    expect(await rotateMarkers(outputs[9]!)).toEqual(["90"]);
    expect(await rotateMarkers(outputs[1]!)).toEqual([]);
  });
  it("selects page ranges", async () => {
    expect(await pages((await qpdf.selectPages(await shared(), "1,3-4")).output)).toBe(3);
  });
  it("rejects an out-of-range selection with FAILED and qpdf's reason", async () => {
    const err = await expectQpdfError(qpdf.selectPages(await form(), "99"), "FAILED");
    expect(err.message).toContain("out of range");
    expect(err.exitCode).toBe(2);
  });
  it("throws RangeError for invalid arguments", async () => {
    await expect(qpdf.merge([])).rejects.toThrow(RangeError);
    await expect(qpdf.split(await form(), { pagesPerFile: 0 })).rejects.toThrow(RangeError);
    await expect(createQpdf({ inline: true, workers: 0 })).rejects.toThrow(RangeError);
  });
});

describe("rotate", () => {
  it("rotates selected pages relative to their current rotation", async () => {
    expect(await rotateMarkers(await form())).toEqual([]);
    const { output } = await qpdf.rotate(await form(), [{ angle: 180 }]);
    expect(await rotateMarkers(output)).toEqual(["180", "180", "180"]);
  });
});

describe("encrypt / decrypt", () => {
  it("round-trips AES-256 with a Unicode password", async () => {
    const { output: locked } = await qpdf.encrypt(await form(), { userPassword: "ü-密码", ownerPassword: "owner" });
    expect((await qpdf.info(locked, { password: "ü-密码" })).encrypted).toBe(true);
    const { output } = await qpdf.decrypt(locked, { password: "ü-密码" });
    expect(await qpdf.info(output)).toMatchObject({ encrypted: false, pageCount: 3 });
  });
  it("round-trips AES-128", async () => {
    const { output: locked } = await qpdf.encrypt(await form(), { userPassword: "u", ownerPassword: "o", bits: 128 });
    expect((await qpdf.decrypt(locked, { password: "u" })).output.byteLength).toBeGreaterThan(0);
  });
  it("applies permissions", async () => {
    const { output } = await qpdf.encrypt(await form(), { userPassword: "u", ownerPassword: "o", allow: { print: false } });
    const r = await qpdf.run(["--password=u", "--json", "--json-key=encrypt", "in.pdf"], { files: { "in.pdf": output } });
    const caps = JSON.parse(r.stdout).encrypt.capabilities;
    expect(caps.printlow).toBe(false);
    expect(caps.modify).toBe(true);
  });
  it("rejects a wrong or missing password with INVALID_PASSWORD", async () => {
    const { output: locked } = await qpdf.encrypt(await form(), { userPassword: "u", ownerPassword: "o" });
    await expectQpdfError(qpdf.decrypt(locked.slice(), { password: "nope" }), "INVALID_PASSWORD");
    await expectQpdfError(qpdf.info(locked.slice()), "INVALID_PASSWORD");
  });
  it("opens an encrypted input inside merge with a per-input password", async () => {
    const { output: locked } = await qpdf.encrypt(await form(), { userPassword: "u", ownerPassword: "o" });
    const { output } = await qpdf.merge([locked, await shared()], { password: ["u"] });
    expect(await pages(output)).toBe(9);
  });
  it("surfaces qpdf's refusal of an empty owner password", async () => {
    await expectQpdfError(qpdf.encrypt(await form(), { userPassword: "u", ownerPassword: "" }), "FAILED");
  });
});

describe("linearize / compress", () => {
  it("linearizes", async () => {
    const { output } = await qpdf.linearize(await form());
    const r = await qpdf.run(["--check-linearization", "in.pdf"], { files: { "in.pdf": output } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("no linearization errors");
  });
  it("compresses to a valid file", async () => {
    const { output } = await qpdf.compress(await form(), { level: 6 });
    expect((await qpdf.run(["--check", "in.pdf"], { files: { "in.pdf": output } })).exitCode).toBe(0);
  });
});

describe("warnings (exit code 3)", () => {
  it("resolves and returns qpdf's warnings for a damaged file", async () => {
    const { output, warnings } = await qpdf.linearize(await fixture("damaged.pdf"));
    expect(output.byteLength).toBeGreaterThan(0);
    expect(warnings.join("\n")).toContain("file is damaged");
  });
});

describe("run", () => {
  it("never rejects for qpdf exit codes", async () => {
    const r = await qpdf.run(["--check", "missing.pdf"]);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("missing.pdf");
  });
  it("returns every created file", async () => {
    const r = await qpdf.run(["--split-pages", "in.pdf", "part-%d.pdf"], { files: { "in.pdf": await form() } });
    expect(Object.keys(r.files).sort()).toEqual(["part-1.pdf", "part-2.pdf", "part-3.pdf"]);
  });
});

describe("inputs", () => {
  it("accepts Blob, ArrayBuffer, and views into larger buffers without touching the larger buffer", async () => {
    const bytes = await form();
    expect(await pages(await form())).toBe(3);
    expect((await qpdf.info(new Blob([bytes.slice()]))).pageCount).toBe(3);
    expect((await qpdf.info(bytes.slice().buffer)).pageCount).toBe(3);
    const big = new Uint8Array(bytes.byteLength + 32);
    big.set(bytes, 16);
    expect((await qpdf.info(big.subarray(16, 16 + bytes.byteLength))).pageCount).toBe(3);
    expect(big.byteLength).toBe(bytes.byteLength + 32);
  });
  it("accepts a Node Buffer", async () => {
    expect((await qpdf.info(Buffer.from(await form()))).pageCount).toBe(3);
  });
});

describe("concurrency", () => {
  it("keeps each result with its own call", async () => {
    const results = await Promise.all([
      qpdf.info(await form()),
      qpdf.info(await shared()),
      qpdf.merge([await form(), await shared()]).then((r) => qpdf.info(r.output)),
      qpdf.selectPages(await shared(), "2").then((r) => qpdf.info(r.output)),
      qpdf.info(await form()),
      qpdf.info(await shared()),
    ]);
    expect(results.map((r) => r.pageCount)).toEqual([3, 6, 9, 1, 3, 6]);
  });
});

describe("terminate", () => {
  it("rejects later calls with TERMINATED", async () => {
    const q = await createQpdf({ inline: true });
    q.terminate();
    await expectQpdfError(q.info(await form()), "TERMINATED");
  });
});

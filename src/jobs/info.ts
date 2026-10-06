import type { JobSpec, PasswordOptions, PdfInfo } from "../types.js";
import { INPUT, jobSpec, withPassword } from "./job.js";

export function infoJob(input: Uint8Array, options: PasswordOptions = {}): JobSpec {
  // jsonObject=trailer keeps the "qpdf" key small: it carries pdfversion without dumping every object.
  const job = { inputFile: INPUT, json: "2", jsonKey: ["qpdf", "pages", "encrypt"], jsonObject: ["trailer"] };
  return jobSpec(withPassword(job, options.password), { [INPUT]: input });
}

interface InfoJson {
  pages: unknown[];
  encrypt: { encrypted: boolean };
  qpdf: [{ pdfversion: string }, unknown];
}

export function parseInfo(stdout: string): Omit<PdfInfo, "warnings"> {
  const json = JSON.parse(stdout) as InfoJson;
  return { pdfVersion: json.qpdf[0].pdfversion, pageCount: json.pages.length, encrypted: json.encrypt.encrypted };
}

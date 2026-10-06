import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
export function readText(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}
export function workflowFiles(): string[] {
  return readdirSync(new URL(".github/workflows/", root))
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => `.github/workflows/${f}`);
}
const pkg = JSON.parse(readText("package.json")) as {
  version: string;
  engines: { node: string };
  devDependencies: Record<string, string>;
};

describe("Node version alignment", () => {
  it("requires Node >= 24", () => {
    expect(pkg.engines.node).toBe(">=24");
  });

  it("pins .nvmrc to 24", () => {
    expect(readText(".nvmrc").trim()).toBe("24");
  });

  it("uses Node 24 in every setup-node step", () => {
    for (const file of workflowFiles()) {
      for (const match of readText(file).matchAll(/node-version:\s*(\S+)/g)) {
        expect(match[1], `${file}: ${match[0]}`).toBe("24");
      }
    }
  });

  it("uses @types/node for the same major as the runtime", () => {
    expect(pkg.devDependencies["@types/node"]).toMatch(/^\^24\./);
  });
});

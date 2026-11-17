import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "bip39-english.ts" || name === "node_modules" || name === "dist") return [];
    if (statSync(path).isDirectory()) return filesUnder(path);
    return [path];
  });
}

const BANNED = [
  /\bsecure(?:ly)?\b/i,
  /\bguaranteed\b/i,
  /\baudited\b/i,
  /\btrustless\b/i,
  /\brisk-free\b/i,
  /\bsafe\b/i,
  /pay when delivered/i,
  /only when done/i,
  /until accepted/i,
  /non-custodial/i,
];

describe("public copy", () => {
  it("avoids banned claims in the package text", () => {
    const paths = [
      ...filesUnder(join(ROOT, "src")),
      join(ROOT, "README.md"),
      join(ROOT, "server.json"),
      join(ROOT, "glama.json"),
      join(ROOT, "smithery.yaml"),
      join(ROOT, "Dockerfile"),
      join(ROOT, "LICENSE"),
    ];
    const misses: string[] = [];
    for (const path of paths) {
      const text = readFileSync(path, "utf8");
      for (const pattern of BANNED) {
        if (pattern.test(text)) misses.push(`${path}: ${pattern}`);
      }
    }
    expect(misses).toEqual([]);
  });
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = new URL("..", import.meta.url);

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

const FORBIDDEN = [
  "sendTransaction",
  "sendRawTransaction",
  "signTransaction",
  "privateKeyToAccount",
  "mnemonicToAccount",
  "walletClient",
  "eth_sendRawTransaction",
  "prepare-proposal",
  "register_manifest",
];

describe("static guard", () => {
  it("does not contain a signing or sending path", () => {
    const src = filesUnder(fileURLToPath(new URL("src", ROOT)));
    expect(src.length).toBeGreaterThan(5);
    const combined = src.map((path) => readFileSync(path, "utf8")).join("\n");
    for (const word of FORBIDDEN) {
      expect(combined.includes(word), word).toBe(false);
    }
    expect(combined.includes("viem/accounts")).toBe(false);
  });
});

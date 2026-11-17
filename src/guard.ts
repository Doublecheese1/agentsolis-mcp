import { BIP39_ENGLISH_SET } from "./bip39-english.js";

const KEY_MESSAGE =
  "This tool does not accept a private key or seed phrase. Remove it and try again. Nothing was sent.";

const HEX_64 = /(?:^|[^0-9a-fA-F])(?:0x)?([0-9a-fA-F]{64})(?![0-9a-fA-F])/gi;

/** Fields whose entire value may be a 0x-prefixed 32-byte id. A bare 64-hex string is still rejected. */
const HEX32_FIELDS = new Set(["salt", "deal_id"]);

export class InputRejected extends Error {
  constructor() {
    super(KEY_MESSAGE);
    this.name = "InputRejected";
  }
}

export function looksLikeSeedPhrase(value: string): boolean {
  const entire = value.trim().split(/\s+/).filter(Boolean);
  if (
    (entire.length === 12 || entire.length === 24) &&
    entire.every((word) => /^[A-Za-z]+$/.test(word))
  ) {
    return true;
  }
  const lowered = entire.map((word) => word.toLowerCase());
  if ((lowered.length === 12 || lowered.length === 24) && lowered.every((word) => BIP39_ENGLISH_SET.has(word))) {
    return true;
  }
  const words = value.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  for (const size of [12, 24]) {
    for (let index = 0; index + size <= words.length; index += 1) {
      let match = true;
      for (let offset = 0; offset < size; offset += 1) {
        if (!BIP39_ENGLISH_SET.has(words[index + offset] ?? "")) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
  }
  return false;
}

function fieldHasKeyMaterial(field: string, value: string): boolean {
  if (looksLikeSeedPhrase(value)) return true;
  const trimmed = value.trim();
  if (HEX32_FIELDS.has(field) && /^0x[0-9a-fA-F]{64}$/.test(trimmed)) return false;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return true;
  HEX_64.lastIndex = 0;
  return HEX_64.test(value);
}

export function rejectKeyMaterial(value: unknown, field = "input"): void {
  if (typeof value === "string") {
    if (fieldHasKeyMaterial(field, value)) throw new InputRejected();
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) rejectKeyMaterial(item, field);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) rejectKeyMaterial(item, key);
  }
}

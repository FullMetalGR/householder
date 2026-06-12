import { randomInt } from "node:crypto";

// Phonetically safe: no I, L, O, 0, 1 (spec section 5)
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export function generateCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizeCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

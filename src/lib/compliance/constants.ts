export const ERASURE_REQUIRED_PHRASE = "ERASE PARTICIPANT DATA" as const;

export const ENTRY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 chars — no 0/O/I/1/L

export function generateEntryCodeSuffix(): string {
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += ENTRY_CODE_ALPHABET[Math.floor(Math.random() * ENTRY_CODE_ALPHABET.length)];
  }
  return result;
}

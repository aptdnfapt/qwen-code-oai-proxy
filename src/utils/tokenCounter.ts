const { get_encoding } = require("tiktoken") as any;

function normalizeInput(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }

  if (Array.isArray(input)) {
    return JSON.stringify(input);
  }

  if (typeof input === "object" && input !== null) {
    const value = input as any;
    if (value.content) {
      return typeof value.content === "string" ? value.content : JSON.stringify(value.content);
    }
    return JSON.stringify(value);
  }

  return String(input);
}

export function countTokens(input: unknown): number {
  try {
    const inputString = normalizeInput(input);
    const encoding = get_encoding("cl100k_base");
    const tokens = encoding.encode(inputString);
    const tokenCount = tokens.length;
    encoding.free();
    return tokenCount;
  } catch (error) {
    console.warn("Error counting tokens, falling back to character approximation:", error);
    const inputString = normalizeInput(input);
    return Math.ceil(inputString.length / 4);
  }
}

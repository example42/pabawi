/**
 * Type-safe JSON parsing utility.
 *
 * Wraps JSON.parse to return `unknown` instead of `any`, eliminating the need
 * for explicit type casts at every parse site. This is the recommended pattern
 * for strict TypeScript codebases.
 */

/**
 * Parse a JSON string and return the result typed as `unknown`.
 *
 * Callers must narrow the result with type guards or validation (e.g., Zod)
 * before using the parsed value.
 *
 * @param text - JSON string to parse
 * @returns Parsed value typed as `unknown`
 * @throws SyntaxError if the string is not valid JSON
 */
export function parseJson(text: string): unknown {
  // JSON.parse returns `any`; assigning to `unknown` is the type-safe boundary
  const result: unknown = JSON.parse(text);
  return result;
}

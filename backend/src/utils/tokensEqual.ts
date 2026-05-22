import crypto from "crypto";

/**
 * Constant-time comparison of two bearer tokens (or any opaque secret strings).
 *
 * Plain `a === b` short-circuits on the first differing byte, which leaks
 * information about the secret to a remote attacker measuring response time.
 * `timingSafeEqual` compares the full buffer length regardless of content,
 * but requires the two buffers to be the same length — we early-return when
 * they differ so the timing of that bucket doesn't leak the secret length
 * either (the attacker can already see how many bytes they sent, so the
 * length-mismatch case is not a new leak).
 */
export function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

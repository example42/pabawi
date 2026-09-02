import { describe, it, expect } from "vitest";
import { ansiToHtml } from "./ansiToHtml";

/**
 * Security regression tests for the `{@html}` sink.
 *
 * ansiToHtml output is rendered with `{@html}` in CommandOutput.svelte,
 * RealtimeOutputViewer.svelte, PuppetOutputViewer.svelte, and ExecutionsPage.svelte.
 * These tests lock in the escape-first invariant: any HTML metacharacters in
 * attacker-influenced node output MUST be escaped before span tags are injected,
 * so no live markup can ever be produced. (Assessment finding L-1)
 */
describe("ansiToHtml — XSS / HTML-injection hardening", () => {
  it("escapes an <img onerror> payload so no live markup is produced", () => {
    const out = ansiToHtml('<img src=x onerror=alert(1)>');
    // The dangerous characters must be entity-encoded.
    expect(out).toContain("&lt;img");
    expect(out).toContain("&gt;");
    // No raw tag may survive.
    expect(out).not.toContain("<img");
    expect(out).not.toMatch(/<img[^>]*onerror/i);
  });

  it("escapes a <script> tag", () => {
    const out = ansiToHtml("<script>alert('xss')</script>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("</script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("escapes quotes and ampersands", () => {
    const out = ansiToHtml(`" ' &`);
    expect(out).toContain("&quot;");
    expect(out).toContain("&#039;");
    expect(out).toContain("&amp;");
  });

  it("escapes HTML embedded inside ANSI-coloured segments (span path)", () => {
    // Colour code (red) followed by a payload, then reset. Exercises the
    // branch that wraps text in <span style=...>. The payload must still be
    // escaped inside the span.
    const out = ansiToHtml("\x1b[31m<img src=x onerror=alert(1)>\x1b[0m");
    expect(out).toContain("<span");
    expect(out).toContain("&lt;img");
    expect(out).not.toMatch(/<img[^>]*onerror/i);
  });

  it("only emits span style values from the fixed colour table", () => {
    // A user-controlled value cannot leak into the style attribute: styling is
    // driven solely by the numeric ANSI code lookup, never by output text.
    const out = ansiToHtml("\x1b[31mhello\x1b[0m");
    expect(out).toBe('<span style="color: #cd3131">hello</span>');
  });
});

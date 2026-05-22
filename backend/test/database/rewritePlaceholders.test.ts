import { describe, it, expect } from "vitest";
import { rewritePlaceholders } from "../../src/database/rewritePlaceholders";

describe("rewritePlaceholders", () => {
  it("rewrites a single placeholder", () => {
    expect(rewritePlaceholders("SELECT * FROM t WHERE a = ?")).toBe(
      "SELECT * FROM t WHERE a = $1",
    );
  });

  it("numbers multiple placeholders sequentially", () => {
    expect(rewritePlaceholders("INSERT INTO t (a, b, c) VALUES (?, ?, ?)")).toBe(
      "INSERT INTO t (a, b, c) VALUES ($1, $2, $3)",
    );
  });

  it("handles LIMIT ? OFFSET ?", () => {
    expect(rewritePlaceholders("SELECT * FROM t LIMIT ? OFFSET ?")).toBe(
      "SELECT * FROM t LIMIT $1 OFFSET $2",
    );
  });

  it("leaves SQL without placeholders untouched", () => {
    const sql = "SELECT COUNT(*) FROM t";
    expect(rewritePlaceholders(sql)).toBe(sql);
  });

  it("does not rewrite ? inside a single-quoted string literal", () => {
    expect(
      rewritePlaceholders("SELECT * FROM t WHERE label = 'a?b' AND id = ?"),
    ).toBe("SELECT * FROM t WHERE label = 'a?b' AND id = $1");
  });

  it("does not rewrite ? inside a double-quoted identifier", () => {
    expect(rewritePlaceholders('SELECT "we?rd" FROM t WHERE id = ?')).toBe(
      'SELECT "we?rd" FROM t WHERE id = $1',
    );
  });

  it("handles a doubled-quote escape inside a string literal", () => {
    expect(
      rewritePlaceholders("UPDATE t SET name = 'O''Brien?' WHERE id = ?"),
    ).toBe("UPDATE t SET name = 'O''Brien?' WHERE id = $1");
  });

  it("does not rewrite ? inside a line comment", () => {
    expect(
      rewritePlaceholders("SELECT 1 -- really? yes\nWHERE id = ?"),
    ).toBe("SELECT 1 -- really? yes\nWHERE id = $1");
  });

  it("does not rewrite ? inside a block comment", () => {
    expect(rewritePlaceholders("/* a ? b */ SELECT ?")).toBe(
      "/* a ? b */ SELECT $1",
    );
  });

  it("handles nested block comments", () => {
    expect(rewritePlaceholders("/* a /* ? */ ? */ SELECT ?")).toBe(
      "/* a /* ? */ ? */ SELECT $1",
    );
  });

  it("does not rewrite ? inside a dollar-quoted string", () => {
    expect(rewritePlaceholders("SELECT $$ a ? b $$, ?")).toBe(
      "SELECT $$ a ? b $$, $1",
    );
  });

  it("does not rewrite ? inside a tagged dollar-quoted string", () => {
    expect(rewritePlaceholders("SELECT $tag$ ? $tag$ WHERE id = ?")).toBe(
      "SELECT $tag$ ? $tag$ WHERE id = $1",
    );
  });

  it("leaves existing positional placeholders untouched", () => {
    expect(rewritePlaceholders("SELECT * FROM t WHERE id = $1")).toBe(
      "SELECT * FROM t WHERE id = $1",
    );
  });

  it("rewrites placeholders across an UPSERT", () => {
    expect(
      rewritePlaceholders(
        "INSERT INTO config (key, value) VALUES (?, ?) " +
          "ON CONFLICT(key) DO UPDATE SET value = ?",
      ),
    ).toBe(
      "INSERT INTO config (key, value) VALUES ($1, $2) " +
        "ON CONFLICT(key) DO UPDATE SET value = $3",
    );
  });

  it("handles an empty string", () => {
    expect(rewritePlaceholders("")).toBe("");
  });
});

/**
 * Rewrite SQLite-style `?` parameter placeholders to PostgreSQL positional
 * placeholders (`$1`, `$2`, …).
 *
 * The entire codebase writes parameterised SQL with `?`. `PostgresAdapter`
 * normalises the SQL at query time via this function, so no service needs
 * dialect-specific placeholder handling.
 *
 * The scan deliberately skips `?` characters that are NOT placeholders:
 *
 *   - single-quoted string literals (`'…'`)
 *   - double-quoted identifiers (`"…"`)
 *   - dollar-quoted strings (`$tag$…$tag$`, including the empty tag `$$…$$`)
 *   - line comments (`-- …`)
 *   - block comments, which PostgreSQL allows to nest
 *
 * SQL escapes a quote inside a quoted region by doubling it (`''`, `""`); the
 * scanner handles that by re-entering the quoted state on the doubled quote.
 *
 * Already-positional placeholders (`$1`) are left untouched — do not mix the
 * two styles in a single statement.
 */
export function rewritePlaceholders(sql: string): string {
  let out = "";
  let paramIndex = 0;
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Line comment: -- … up to (and excluding) the newline.
    if (ch === "-" && next === "-") {
      const eol = sql.indexOf("\n", i + 2);
      const end = eol === -1 ? n : eol;
      out += sql.slice(i, end);
      i = end;
      continue;
    }

    // Block comment: /* … */ — PostgreSQL permits nesting.
    if (ch === "/" && next === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") {
          depth++;
          j += 2;
        } else if (sql[j] === "*" && sql[j + 1] === "/") {
          depth--;
          j += 2;
        } else {
          j++;
        }
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }

    // Single-quoted string literal or double-quoted identifier.
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) {
            // Doubled quote — an escaped quote, stay inside the region.
            j += 2;
            continue;
          }
          j++;
          break;
        }
        j++;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }

    // Dollar-quoted string: $tag$ … $tag$ (the tag may be empty: $$ … $$).
    if (ch === "$") {
      const tagMatch = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const close = sql.indexOf(tag, i + tag.length);
        const end = close === -1 ? n : close + tag.length;
        out += sql.slice(i, end);
        i = end;
        continue;
      }
    }

    // A genuine placeholder.
    if (ch === "?") {
      paramIndex++;
      out += "$" + String(paramIndex);
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

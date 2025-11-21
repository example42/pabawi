/**
 * Convert ANSI color codes to HTML with inline styles
 */

interface AnsiStyle {
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

const ansiColors: Record<number, string> = {
  // Standard colors
  30: "#000000", // black
  31: "#cd3131", // red
  32: "#0dbc79", // green
  33: "#e5e510", // yellow
  34: "#2472c8", // blue
  35: "#bc3fbc", // magenta
  36: "#11a8cd", // cyan
  37: "#e5e5e5", // white
  // Bright colors
  90: "#666666", // bright black (gray)
  91: "#f14c4c", // bright red
  92: "#23d18b", // bright green
  93: "#f5f543", // bright yellow
  94: "#3b8eea", // bright blue
  95: "#d670d6", // bright magenta
  96: "#29b8db", // bright cyan
  97: "#ffffff", // bright white
};

const ansiBgColors: Record<number, string> = {
  40: "#000000",
  41: "#cd3131",
  42: "#0dbc79",
  43: "#e5e510",
  44: "#2472c8",
  45: "#bc3fbc",
  46: "#11a8cd",
  47: "#e5e5e5",
  100: "#666666",
  101: "#f14c4c",
  102: "#23d18b",
  103: "#f5f543",
  104: "#3b8eea",
  105: "#d670d6",
  106: "#29b8db",
  107: "#ffffff",
};

function parseAnsiCode(code: string): Partial<AnsiStyle> {
  const codes = code.split(";").map(Number);
  const style: Partial<AnsiStyle> = {};

  for (const c of codes) {
    if (c === 0) {
      // Reset
      return {};
    } else if (c === 1) {
      style.bold = true;
    } else if (c === 2) {
      style.dim = true;
    } else if (c === 3) {
      style.italic = true;
    } else if (c === 4) {
      style.underline = true;
    } else if (ansiColors[c]) {
      style.color = ansiColors[c];
    } else if (ansiBgColors[c]) {
      style.backgroundColor = ansiBgColors[c];
    }
  }

  return style;
}

function styleToString(style: AnsiStyle): string {
  const parts: string[] = [];

  if (style.color) parts.push(`color: ${style.color}`);
  if (style.backgroundColor)
    parts.push(`background-color: ${style.backgroundColor}`);
  if (style.bold) parts.push("font-weight: bold");
  if (style.dim) parts.push("opacity: 0.6");
  if (style.italic) parts.push("font-style: italic");
  if (style.underline) parts.push("text-decoration: underline");

  return parts.join("; ");
}

export function ansiToHtml(text: string): string {
  // Convert literal \u001b strings to actual escape characters
  const processed = text.replace(/\\u001b/g, "\x1b");

  // Escape HTML first
  const escaped = processed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  // Match ANSI escape codes - both \x1b and \u001b formats
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  let result = "";
  let lastIndex = 0;
  let currentStyle: AnsiStyle = {};
  let match;

  while ((match = ansiRegex.exec(escaped)) !== null) {
    // Add text before the ANSI code
    if (match.index > lastIndex) {
      const text = escaped.substring(lastIndex, match.index);
      if (Object.keys(currentStyle).length > 0) {
        result += `<span style="${styleToString(currentStyle)}">${text}</span>`;
      } else {
        result += text;
      }
    }

    // Parse the ANSI code
    const code = match[1];
    if (!code || code === "0") {
      // Reset code
      currentStyle = {};
    } else {
      const newStyle = parseAnsiCode(code);
      if (Object.keys(newStyle).length === 0) {
        currentStyle = {};
      } else {
        // Merge styles
        currentStyle = { ...currentStyle, ...newStyle };
      }
    }

    lastIndex = ansiRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < escaped.length) {
    const text = escaped.substring(lastIndex);
    if (Object.keys(currentStyle).length > 0) {
      result += `<span style="${styleToString(currentStyle)}">${text}</span>`;
    } else {
      result += text;
    }
  }

  return result;
}

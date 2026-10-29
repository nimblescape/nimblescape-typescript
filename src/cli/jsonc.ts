// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Reads JSON with comments and trailing commas, the format of tsconfig.json. ts reads only a few fields of a
// tsconfig.json itself (references, files); tsc reads the whole file.

/** The index after the string that starts at `start` (a quote) in `text`. */
function stringEnd(text: string, start: number): number {
  let i = start + 1;
  for (; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++;
  return i + 1;
}

/** The JSON text without comments and without commas before a closing bracket, with the strings unchanged. */
export function stripJsonc(text: string): string {
  let plain = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const end = stringEnd(text, i);
      plain += text.slice(i, end);
      i = end - 1;
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      plain += '\n';
    } else if (char === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i < 0) break;
      i++;
    } else {
      plain += char;
    }
  }
  // A comma before a closing bracket goes; a comma inside a string, such as "a,}", stays.
  const closing = /\s*[}\]]/y;
  let out = '';
  for (let i = 0; i < plain.length; i++) {
    if (plain[i] === '"') {
      const end = stringEnd(plain, i);
      out += plain.slice(i, end);
      i = end - 1;
      continue;
    }
    closing.lastIndex = i + 1;
    if (plain[i] !== ',' || !closing.test(plain)) out += plain[i];
  }
  return out;
}

/** The parsed JSONC text, or undefined when it is no object. */
export function parseJsonc(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(stripJsonc(text));
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

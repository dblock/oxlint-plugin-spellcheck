import { decodeNamedCharacterReference } from "decode-named-character-reference";

const markdownPunctuation =
  /^[\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e]$/u;

export function mappedText(raw, start, mode = "plain", expected) {
  let text = "";
  const mapping = [];
  for (let index = 0; index < raw.length;) {
    let length = 1;
    let character = raw[index];
    if (mode === "javascript" && character === "\\") {
      const escape =
        /^\\(?:u\{[\da-f]+\}|u[\da-f]{4}|x[\da-f]{2}|\r\n|[\r\n\u2028\u2029]|[0-3][0-7]{0,2}|[4-7][0-7]?|[\s\S])/iu.exec(
          raw.slice(index),
        );
      if (!escape)
        throw new Error(`Cannot map string escape at offset ${start + index}.`);
      length = escape[0].length;
      const value = escape[0].slice(1);
      if (/^[\r\n\u2028\u2029]/u.test(value)) character = "";
      else if (value.startsWith("u{"))
        character = String.fromCodePoint(
          Number.parseInt(value.slice(2, -1), 16),
        );
      else if (/^[ux]/u.test(value))
        character = String.fromCharCode(Number.parseInt(value.slice(1), 16));
      else if (/^[0-7]+$/u.test(value))
        character = String.fromCharCode(Number.parseInt(value, 8));
      else
        character =
          { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v" }[value] ??
          value;
    } else if (
      mode === "markdown" &&
      character === "\\" &&
      markdownPunctuation.test(raw[index + 1] ?? "")
    ) {
      character = raw[index + 1];
      length = 2;
    } else if ((mode === "html" || mode === "markdown") && character === "&") {
      const entity = /^&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/iu.exec(
        raw.slice(index),
      );
      if (entity) {
        let decoded;
        if (entity[1].startsWith("#")) {
          const value = entity[1].slice(1);
          const code = Number.parseInt(
            value.replace(/^x/iu, ""),
            /^x/iu.test(value) ? 16 : 10,
          );
          decoded =
            code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
              ? String.fromCodePoint(code)
              : "\ufffd";
        } else decoded = decodeNamedCharacterReference(entity[1]);
        if (decoded) {
          character = decoded;
          length = entity[0].length;
        }
      }
    }
    text += character;
    for (let unit = 0; unit < character.length; unit++) {
      mapping.push({ start: start + index, end: start + index + length });
    }
    index += length;
  }
  if (expected !== undefined && text !== expected) {
    throw new Error(`Cannot map string contents to source at offset ${start}.`);
  }
  return { text, mapping };
}

const nonProse =
  /(?:https?:\/\/|mailto:|www\.)[^\s<>]+|[\p{L}\p{N}_.+-]+@[\p{L}\p{N}_.-]+/giu;
const wordPattern =
  /[\p{L}\p{M}\p{N}\p{Pc}$]+(?:['\u2019][\p{L}\p{M}\p{N}\p{Pc}$]+)*/gu;
const wordOnly = /^\p{L}[\p{L}\p{M}]*(?:['\u2019]\p{L}[\p{L}\p{M}]*)*$/u;

export function* words(span, identifiers = false) {
  const excluded = [...span.text.matchAll(nonProse)].map((match) => [
    match.index,
    match.index + match[0].length,
  ]);
  const tokens = identifiers ? /\p{L}[\p{L}\p{M}]*/gu : wordPattern;
  for (const match of span.text.matchAll(tokens)) {
    const start = match.index;
    const end = start + match[0].length;
    if (excluded.some(([first, last]) => start < last && end > first)) continue;
    if (!identifiers) {
      if (!wordOnly.test(match[0])) continue;
      if (
        /[.-]/u.test(span.text[start - 1] ?? "") &&
        /[\p{L}\p{N}_]/u.test(span.text[start - 2] ?? "")
      )
        continue;
      if (
        /[.-]/u.test(span.text[end] ?? "") &&
        /[\p{L}\p{N}_]/u.test(span.text[end + 1] ?? "")
      )
        continue;
    }
    let offset = start;
    const pieces = identifiers
      ? match[0].split(/(?<=\p{Ll})(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})/u)
      : [match[0]];
    for (const word of pieces) {
      yield {
        word,
        start: span.mapping[offset].start,
        end: span.mapping[offset + word.length - 1].end,
      };
      offset += word.length;
    }
  }
}

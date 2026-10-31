import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KotoshuWasm } from "@kotoshu/wasm";

const bundled = fileURLToPath(new URL("../data/en/", import.meta.url));
const engines = new Map();
const wordOnly = /^\p{L}[\p{L}\p{M}]*(?:['\u2019]\p{L}[\p{L}\p{M}]*)*$/u;
const utf8 = (path) =>
  new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
const normalize = (word) => word.replaceAll("\u2019", "'");

function engine(aff, dic) {
  const signature = [aff, dic]
    .map((path) => {
      const stat = statSync(path, { bigint: true });
      return `${path}:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}`;
    })
    .join("|");
  if (!engines.has(signature)) {
    const dictionary = new KotoshuWasm(utf8(aff), utf8(dic));
    if (engines.size >= 32) engines.delete(engines.keys().next().value);
    engines.set(signature, dictionary);
  }
  return engines.get(signature);
}

export function getDictionary(entries, cwd) {
  const dictionaries = [];
  const words = new Set();
  const pairs = new Set();
  for (const entry of new Set(entries)) {
    if (entry.startsWith("builtin:") && entry !== "builtin:en") {
      throw new Error(`Unknown bundled dictionary: ${entry}.`);
    }
    const path = entry === "builtin:en" ? bundled : resolve(cwd, entry);
    if (path.endsWith(".txt")) {
      for (const [index, line] of utf8(path)
        .split(/\r\n|\r|\n/u)
        .entries()) {
        const word = line.trim();
        if (!word || word.startsWith("#")) continue;
        if (!wordOnly.test(word)) {
          throw new Error(
            `Invalid vocabulary word at ${path}:${index + 1}: ${word}`,
          );
        }
        words.add(word);
      }
      continue;
    }
    const stems = [
      ...new Set(
        readdirSync(path)
          .filter((name) => /\.(?:aff|dic)$/u.test(name))
          .map((name) => name.slice(0, -4)),
      ),
    ].sort();
    if (!stems.length)
      throw new Error(`No Hunspell dictionary pairs in ${path}.`);
    for (const stem of stems) {
      const aff = join(path, `${stem}.aff`);
      const dic = join(path, `${stem}.dic`);
      if (!pairs.has(aff)) {
        dictionaries.push(engine(aff, dic));
        pairs.add(aff);
      }
    }
  }
  const suggestions = new Map();
  const has = (word) =>
    words.has(word) ||
    dictionaries.some((dictionary) => dictionary.correct(normalize(word)));
  return {
    has,
    suggest(word) {
      if (!suggestions.has(word)) {
        const ranked = dictionaries
          .flatMap((dictionary) => dictionary.suggest(normalize(word), 3))
          .sort(
            (left, right) =>
              right.confidence - left.confidence ||
              left.distance - right.distance ||
              (left.word < right.word ? -1 : left.word > right.word ? 1 : 0),
          );
        if (suggestions.size >= 256)
          suggestions.delete(suggestions.keys().next().value);
        suggestions.set(
          word,
          [...new Set(ranked.map((result) => result.word))]
            .filter(has)
            .slice(0, 3),
        );
      }
      return suggestions.get(word);
    },
  };
}

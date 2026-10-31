import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join, dirname } from "node:path";
import { KotoshuWasm } from "@kotoshu/wasm";

const require = createRequire(import.meta.url);
const engines = new Map();
const wordOnly = /^\p{L}[\p{L}\p{M}]*(?:['\u2019]\p{L}[\p{L}\p{M}]*)*$/u;
const utf8 = (path) =>
  new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
const normalize = (word) => word.replaceAll("\u2019", "'");

function cached(operation, limit) {
  const values = new Map();
  const keys = [];
  let position = 0;
  return (word) => {
    if (!values.has(word)) {
      const value = operation(word);
      if (values.size >= limit) values.delete(keys[position]);
      keys[position] = word;
      position = (position + 1) % limit;
      values.set(word, value);
    }
    return values.get(word);
  };
}

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
    engines.set(signature, {
      dictionary,
      suggest: cached((word) => dictionary.suggest(word, 3), 256),
    });
  }
  return engines.get(signature);
}

export function getDictionary(entries, cwd) {
  const projectRequire = createRequire(resolve(cwd, "package.json"));
  const dictionaries = [];
  const words = new Set();
  const pairs = new Set();
  for (const entry of new Set(entries)) {
    if (!entry.startsWith("@")) {
      const path = resolve(cwd, entry);
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
    const name = entry.includes("/") ? entry : entry.slice(1);
    if (!/^(?:@[\w.-]+\/)?[\w-][\w.-]*$/u.test(name)) {
      throw new Error(
        `Invalid dictionary package: ${entry}. Use @name or @scope/name.`,
      );
    }
    const entrypoint = (
      name === "dictionary-en" ? require : projectRequire
    ).resolve(name);
    const path = dirname(entrypoint);
    const aff = join(path, "index.aff");
    const dic = join(path, "index.dic");
    if (!pairs.has(aff)) {
      dictionaries.push(engine(aff, dic));
      pairs.add(aff);
    }
  }
  const suggestions = new Map();
  const has = (word) =>
    words.has(word) ||
    dictionaries.some(({ dictionary }) => dictionary.correct(normalize(word)));
  return {
    has,
    suggest(word) {
      if (!suggestions.has(word)) {
        const ranked = dictionaries
          .flatMap((dictionary) => dictionary.suggest(normalize(word)))
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

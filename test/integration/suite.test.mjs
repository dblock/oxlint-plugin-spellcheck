import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDictionary } from "../../src/dictionaries.mjs";
import { project } from "./helpers.mjs";

test("packed Oxlint integration", async (t) => {
  const fixture = project(t);
  for (const [name, file, flags, command] of [
    [
      "repository-clean",
      "valid.tsx",
      ["--disable-nested-config", "test/fixtures"],
    ],
    [
      "repository-typo",
      "typo.js",
      ["--disable-nested-config", "test/fixtures"],
    ],
    ["clean", "valid.tsx"],
    ["typo", "typo.js"],
    ["fix", "typo.js", ["--fix"]],
    ["comments-disabled", "typo.js"],
    ["jsx", "prose.tsx"],
    ["jsx-strings", "prose.tsx"],
    ["strings-no-jsx", "prose.tsx"],
    ["entities", "entity.jsx"],
    ["strings", "strings.ts"],
    ["identifiers-disabled", "identifiers.js"],
    ["identifiers", "identifiers.js"],
    ["file-suppression", "suppressed.js"],
    ["inline-suppression", "inline-suppressed.js"],
    ["unicode", "unicode.js"],
    ["crlf", "crlf.js"],
    ["mapped-comments", "mapped-comments.js"],
    ["vocabulary", "vocabulary.js"],
    ["vocabulary-only", "replacement.js"],
    ["dictionary", "dictionary.js"],
    ["combined-dictionaries", "dictionary.js"],
    ["bare-vocabulary", "replacement.js"],
    ["missing", "typo.js"],
    ["missing-package", "typo.js"],
    ["incomplete-dictionary", "typo.js"],
    ["invalid-package", "typo.js"],
    ["double-prefix", "typo.js"],
    ["local-dictionary", "typo.js"],
    ["invalid", "typo.js"],
    ["collect-basic", "example.jsx", [], "collect"],
    ["collect-known", "example.js", [], "collect"],
    [
      "collect-alias",
      "example.js",
      ["--output", "@candidates.txt", "--update-config"],
      "collect",
    ],
    ["collect-output", "example.js", ["--output", "candidates.txt"], "collect"],
    [
      "collect-update",
      "example.js",
      ["--output", ".spellcheck.txt", "--update-config"],
      "collect",
    ],
    [
      "collect-inherited",
      "example.js",
      ["--output", "candidates.txt", "--update-config"],
      "collect",
    ],
    [
      "collect-existing",
      "example.js",
      ["--output", "candidates.txt", "--update-config"],
      "collect",
    ],
    ["collect-missing", "example.js", [], "collect"],
    ["collect-no-files", "example.js", [], "collect"],
    ["collect-other-error", "example.js", [], "collect"],
    ["collect-no-output", "example.js", ["--update-config"], "collect"],
    ["collect-fix", "example.js", ["--", "--fix"], "collect"],
    [
      "collect-override",
      "example.js",
      ["--output", "candidates.txt", "--update-config"],
      "collect",
    ],
  ]) {
    await t.test(name, () => fixture.check(name, file, flags, command));
  }
  fixture.unchanged();
});

test("cached dictionary results keep vocabulary acceptance scoped", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "spellcheck cache "));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const english = getDictionary(["@dictionary-en"], directory);
  assert.equal(english.has("helo"), false);
  const suggestions = english.suggest("helo");
  assert.deepEqual(
    getDictionary(["@dictionary-en"], directory).suggest("helo"),
    suggestions,
  );
  writeFileSync(join(directory, "words.txt"), "helo\n");
  const vocabulary = getDictionary(["@dictionary-en", "words.txt"], directory);
  assert.equal(vocabulary.has("helo"), true);
  assert.equal(english.has("helo"), false);
  assert.equal(getDictionary(["words.txt"], directory).has("hello"), false);
  writeFileSync(join(directory, "words.txt"), "hello\n");
  assert.equal(
    getDictionary(["@dictionary-en", "words.txt"], directory).has("helo"),
    false,
  );
});

test("changed dictionary resources invalidate cached suggestions", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "spellcheck resource cache "));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const packages = join(directory, "node_modules/@spellcheck");
  mkdirSync(packages, { recursive: true });
  const packagePath = join(packages, "dictionary-fixture");
  cpSync(
    new URL("../fixtures/packages/dictionary/", import.meta.url),
    packagePath,
    { recursive: true },
  );
  const original = getDictionary(["@spellcheck/dictionary-fixture"], directory);
  assert.equal(original.has("kotoshu"), true);
  assert.equal(original.has("hello"), false);
  assert.deepEqual(original.suggest("helllo"), []);
  writeFileSync(join(packagePath, "index.dic"), "1\nhello\n");
  const changed = getDictionary(["@spellcheck/dictionary-fixture"], directory);
  assert.equal(changed.has("kotoshu"), false);
  assert.equal(changed.has("hello"), true);
  assert.deepEqual(changed.suggest("helllo"), ["hello"]);
  assert.equal(original.has("kotoshu"), true);
});

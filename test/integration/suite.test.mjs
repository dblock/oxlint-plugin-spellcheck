import { test } from "node:test";
import { project } from "./helpers.mjs";

test("packed Oxlint integration", async (t) => {
  const fixture = project(t);
  for (const [name, file, flags] of [
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
  ]) {
    await t.test(name, () => fixture.check(name, file, flags));
  }
  fixture.unchanged();
});

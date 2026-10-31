import { test } from "node:test";
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

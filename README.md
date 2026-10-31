# oxlint-plugin-spellcheck

A spellcheck plugin for Oxlint, powered by the Rust [Kotoshu](https://github.com/kotoshu/kotoshu-rs) engine through its published WebAssembly package. Checks comments, JSX text, and human-facing attributes, with opt-in strings and identifiers.

Inspired by [dylint-spellcheck](https://github.com/dblock/dylint-spellcheck) and [prettier-plugin-spellcheck](https://github.com/dblock/prettier-plugin-spellcheck). The spelling engine and bundled English dictionary follow Dylint; comment selection and source mappings adapt the Prettier plugin without depending on either linting framework.

## Requirements

Node.js 22.19 or later in the 22.x series, or Node.js 24.5 or later, and Oxlint 1.90.0 or later. These Node versions support the published package's native WASM imports without custom loaders or experimental command-line flags. Node may still print an experimental WASM import warning.

No Rust compiler, native spelling binary, HTTP service, or model download is required. Restore npm dependencies before running checks; spelling execution is offline.

## Setup

In this checkout:

```sh
npm ci
npm run lint
npm test
```

To use the packed plugin in another project:

```sh
npm pack
cd /path/to/your/project
npm install --save-dev oxlint /path/to/oxlint-plugin-spellcheck-0.1.0.tgz
```

Add `.oxlintrc.json`:

```json
{
  "jsPlugins": [
    {
      "name": "spellcheck",
      "specifier": "oxlint-plugin-spellcheck"
    }
  ],
  "rules": {
    "spellcheck/check": "error"
  }
}
```

Then run the installed Oxlint executable, for example through an npm script or `npx --no-install oxlint .`.

```js
// Say helo to the world.
export const message = "Hello";
```

Oxlint reports the source range of `helo` and up to three suggestions. Spelling findings are ordinary native diagnostics, available through Oxlint's text and JSON formats. Change the configured severity to `"warn"` if preferred.

## Configuration

All options are optional. Rule options use the same interface as other Oxlint rules:

```json
{
  "jsPlugins": [
    {
      "name": "spellcheck",
      "specifier": "oxlint-plugin-spellcheck"
    }
  ],
  "rules": {
    "spellcheck/check": [
      "error",
      {
        "dictionaries": ["builtin:en", "./.spellcheck.txt"],
        "comments": true,
        "jsx": true,
        "strings": false,
        "identifiers": false
      }
    ]
  }
}
```

Omitting `dictionaries` uses bundled American English. An explicit nonempty array replaces that default. Entries can be `builtin:en`, local `.txt` vocabulary files, or directories containing UTF-8 Hunspell `.aff`/`.dic` pairs with matching stems. All pairs in a directory participate; a word accepted by any configured dictionary or vocabulary is accepted. Missing resources, invalid UTF-8, malformed vocabulary, and missing dictionary pairs fail explicitly.

Paths are relative to the working directory where Oxlint runs. Local vocabulary contains one case-sensitive word per line; blank lines and `#` comments are ignored. Files must already exist. For example:

```text
# Project vocabulary
Kotoshu
Oxlint
```

Vocabulary is read during linting and is never generated or updated automatically. CSpell package dictionaries are not compatible with this Kotoshu backend.

## Scope

Comments are interpreted as Markdown. Adjacent line comments are combined so code fences can span lines. Prose, headings, link labels, and image descriptions are checked; inline code, fenced and indented examples, link destinations, HTML, JSDoc metadata/types/parameter names, and `@example` bodies are excluded. Documentation descriptions remain checked. Tool directives, shebangs, URLs, email addresses, and identifier-like prose tokens are skipped.

`jsx: true` checks literal JSX text and literal or template `alt`, `title`, `placeholder`, `aria-label`, and `aria-description` values. Structural attributes such as `className` and `src` are not prose, even with `strings: true`.

`strings: true` checks ordinary string literals and untagged template text, including decoded escapes. Import/export paths, dynamic imports, `require` paths, `new URL` paths, object/property keys, directives, regular expressions, and tagged template text are excluded.

`identifiers: true` splits identifiers at underscores, numbers, and case/acronym boundaries. It checks occurrences rather than renaming bindings; imported API names and abbreviations may need project vocabulary.

The plugin uses Oxlint's AST and never evaluates checked source. Locations map back to original source, including Unicode, escaped strings, entities, and CRLF. Standalone Markdown, HTML, and plain-text files are not checked; this plugin runs only on inputs Oxlint parses.

## Suppression and Fixes

Use Oxlint's native suppression comments:

```js
// oxlint-disable-next-line spellcheck/check
// An intentional helo.
```

`oxlint-disable` and `oxlint-enable` work normally too. The plugin respects native severity and suppression instead of introducing a separate lint-policy system.

All spelling results are report-only, including with `oxlint --fix`. Suggestions are not automatic replacements: changing runtime strings or renaming a single identifier occurrence can break behavior. Spelling checks never write source, dictionaries, or configuration.

## Development

`npm run lint` uses Oxlint with this plugin and Oxfmt. `npm test` packs and installs the plugin, then invokes the actual installed Oxlint CLI with runtime network access blocked. Acceptance cases cover positive/negative results, scope exclusions, source locations, dictionary replacement, native suppression, and read-only behavior.

CI covers the minimum Node version on Linux and Node 24 on Linux, macOS, and Windows. The bundled dictionary's provenance and separate redistribution terms are preserved in [data/en](data/en/README.md).

## License

[MIT](LICENSE).

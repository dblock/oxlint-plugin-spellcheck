# oxlint-plugin-spellcheck

[![CI](https://github.com/dblock/oxlint-plugin-spellcheck/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/dblock/oxlint-plugin-spellcheck/actions/workflows/ci.yml)

A spellcheck plugin for [Oxlint](https://oxc.rs/docs/guide/usage/linter.html), powered by [Kotoshu](https://github.com/kotoshu/kotoshu-rs). Checks comments, JSX text, and human-facing attributes, with opt-in strings and identifiers.

## Usage

Install the plugin and Oxlint:

```sh
npm install --save-dev oxlint oxlint-plugin-spellcheck@0.1.0
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

Run Oxlint:

```sh
npx --no-install oxlint .
```

For example:

```js
// Say helo to the world.
export const message = "Hello";
```

Oxlint reports the source range of `helo` and up to three suggestions. Spelling findings are ordinary native diagnostics, available through Oxlint's text and JSON formats. Change the configured severity to `"warn"` if preferred.

Example output with `--format unix`, for the source above in `example.js`:

```text
example.js:1:8: Misspelled word "helo". Suggestions: hello, help, hell. [Error/spellcheck(check)]

1 problem
```

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
        "dictionaries": ["@dictionary-en", "./.spellcheck.txt"],
        "comments": true,
        "jsx": true,
        "strings": false,
        "identifiers": false
      }
    ]
  }
}
```

Omitting `dictionaries` uses `["@dictionary-en"]`, supplied by the plugin's npm dependency. An explicit nonempty array replaces that default. Prefix npm dictionary packages with `@`; all other entries are vocabulary file paths. A word accepted by any configured dictionary or vocabulary is accepted.

The prefix is a configuration marker, not part of an unscoped npm package name: `@dictionary-en` loads `dictionary-en`. Scoped npm package names already start with `@`; use them unchanged, for example `@scope/dictionary`.

Dictionary packages must use Hunspell format, as the [wooorm dictionaries](https://github.com/wooorm/dictionaries) do. CSpell dictionaries such as `@cspell/dict-en_us` are not supported.

To add another language, install its package before checking:

```sh
npm install --save-dev dictionary-es
```

Then configure `"dictionaries": ["@dictionary-en", "@dictionary-es"]` for both languages, or `["@dictionary-es"]` to replace English. No dictionary files need to be copied into your project, and no packages or dictionaries are downloaded during linting. Review each package's license before using or redistributing its resources.

Paths are relative to the working directory where Oxlint runs. Local vocabulary contains one case-sensitive word per line; blank lines and `#` comments are ignored. Files must already exist. For example:

```text
# Project vocabulary
Kotoshu
Oxlint
```

## Settings

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `dictionaries` | `string[]` | `["@dictionary-en"]` | Hunspell package names prefixed with `@`, or case-sensitive vocabulary file paths. An explicit list replaces the default; see [Configuration](#configuration). |
| `comments` | `boolean` | `true` | Check Markdown-aware comments and JSDoc descriptions. |
| `jsx` | `boolean` | `true` | Check JSX text and literal/template `alt`, `title`, `placeholder`, `aria-label`, and `aria-description` values. Structural attributes such as `className` and `src` are skipped, even with `strings: true`. |
| `strings` | `boolean` | `false` | Check ordinary string literals and untagged template text, including decoded escapes. |
| `identifiers` | `boolean` | `false` | Split identifiers at underscores, numbers, and case/acronym boundaries. Check occurrences without renaming bindings; imported API names and abbreviations may need project vocabulary. |

See [DESIGN.md](DESIGN.md#prose-selection) for detailed selection and exclusion rules.

## Suppression and Fixes

Use Oxlint's native suppression comments:

```js
// oxlint-disable-next-line spellcheck/check
// An intentional helo.
```

`oxlint-disable` and `oxlint-enable` work normally too.

All spelling results are report-only, including with `oxlint --fix`.

## Requirements

Node.js 22.19 or later in the 22.x series, or Node.js 24.5 or later, and Oxlint 1.90.0 or later. Node may print an experimental WASM import warning.

Install npm dependencies before running checks; spelling execution is offline.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and checks, and [DESIGN.md](DESIGN.md) for architecture and design decisions.

## License

[MIT](LICENSE).

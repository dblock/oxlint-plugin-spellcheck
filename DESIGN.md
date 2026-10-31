# Design

## Architecture

The plugin uses Oxlint's AST and never evaluates checked source. Locations map back to original source, including Unicode, escaped strings, entities, and CRLF. Standalone Markdown, HTML, and plain-text files are not checked; this plugin runs only on inputs Oxlint parses.

```text
Oxlint AST and source text
  -> JavaScript rule and prose selection
  -> decoded text with original-source mappings
  -> word scanning
  -> Kotoshu WASM and installed Hunspell dictionaries
  -> native Oxlint diagnostics
```

| Module | Responsibility |
| --- | --- |
| [src/index.mjs](src/index.mjs) | Plugin export, option schema, AST visitors, scope exclusions, and diagnostics. |
| [src/comments.mjs](src/comments.mjs) | Comment grouping, documentation metadata filtering, and Markdown prose selection. |
| [src/text.mjs](src/text.mjs) | Escape/entity decoding, source mappings, word boundaries, and identifier splitting. |
| [src/dictionaries.mjs](src/dictionaries.mjs) | Package and vocabulary loading, Kotoshu engines, acceptance, suggestions, and caching. |

Rule creation and dictionary loading are synchronous. Oxlint owns parsing, file selection, severity, and native suppression. The plugin does not introduce another parser for source files or a separate lint-policy system.

## Engine and Prior Art

Inspired by [dylint-spellcheck](https://github.com/dblock/dylint-spellcheck) and [prettier-plugin-spellcheck](https://github.com/dblock/prettier-plugin-spellcheck). The spelling engine follows Dylint; comment selection and source mappings adapt the Prettier plugin without depending on either linting framework.

Oxlint is implemented in Rust, but its external plugin interface is JavaScript. The rule therefore calls the Rust Kotoshu engine through the public `@kotoshu/wasm` package instead of a native Rust plugin or an HTTP spelling service. `KotoshuWasm` takes Hunspell affix and dictionary source strings and exposes correctness checks and suggestions.

The published WASM entry uses native ESM WASM imports. Node.js 22.19 in the 22.x series and Node.js 24.5 or later support those imports without custom loaders or experimental command-line flags. Node may still emit an experimental import warning. No Rust compiler, native spelling binary, HTTP service, or model download is required.

## Dictionary Resources

English comes from the pinned `dictionary-en` npm dependency rather than checked-in production dictionary assets. Other language dictionaries use the same packaged Hunspell format and the same Kotoshu engine. CSpell trie data is not a Hunspell pair; adding a CSpell reader or converting its dictionary semantics is deliberately outside this backend.

Configuration entries beginning with `@` identify npm packages. The loader removes the marker for unscoped packages, so `@dictionary-en` loads `dictionary-en`. Scoped npm names already begin with `@` and are resolved unchanged, for example `@scope/dictionary`; adding another `@` is invalid. Unprefixed entries are vocabulary file paths regardless of extension, even when a package with the same name is installed. This avoids inferring package-versus-file meaning from filenames.

Packages must provide UTF-8 `index.aff` and `index.dic` beside their resolved entry point, following the wooorm dictionary layout. Package resolution uses Node's `createRequire().resolve()`; the entry point is located but never imported or executed. Resources are read directly, which also permits packages whose JavaScript entry uses asynchronous initialization.

The default `dictionary-en` resolves from the plugin's dependencies, so consumers do not need to install English separately. Additional packages resolve from the project where Oxlint runs. Vocabulary paths resolve from that same working directory. An explicit dictionary array replaces the default; acceptance is cumulative across all listed dictionaries and vocabulary files.

Vocabulary is case-sensitive, with one accepted word per line. Blank lines and `#` comments are ignored, and accepted words must contain letters/combining marks with optional internal apostrophes. Files are read without generating candidates or updating accepted vocabulary. Missing packages or files, incomplete Hunspell pairs, invalid UTF-8, and malformed vocabulary fail explicitly rather than falling back to English.

Production dictionary assets and their licenses are installed as npm dependencies, not included in the plugin archive. Tiny synthetic Hunspell fixtures are checked in only for acceptance tests and are not packaged for consumers. Dictionary licenses must be reviewed independently of the plugin's MIT license.

## Prose Selection

Comments are interpreted as Markdown using `mdast-util-from-markdown`. Adjacent line comments of the same kind are combined so fences can span lines. Comment and JSDoc margins are removed while preserving original-source mappings.

Prose, headings, link labels, and image descriptions are checked. Inline code, fenced and indented examples, link destinations, and HTML nodes are excluded. JSDoc descriptions remain checked; metadata, types, parameter names, and `@example` bodies are skipped. Inline documentation links retain their display labels instead of checking their targets. Tool directives and shebangs are not prose.

JSX selection checks text and literal/template values for human-facing `alt`, `title`, `placeholder`, `aria-label`, and `aria-description` attributes. Structural attributes such as `className` and `src` are excluded even when ordinary string checking is enabled.

Ordinary strings and identifiers are opt-in because machine-facing names and runtime values commonly require different vocabulary policies. String checking excludes import/export paths, dynamic imports, `require` paths, `new URL` paths, object/property keys, directives, regular expressions, and tagged template text.

Word scanning is Unicode-aware. URLs and email addresses are excluded. Tokens containing numbers, connector punctuation, or `$` are not split into misleading prose fragments; dotted and hyphenated identifier-like sequences are skipped. Internal straight and curly apostrophes remain part of a word, and Hunspell lookup normalizes curly apostrophes to straight ones. Identifier mode instead splits underscores, numbers, and case/acronym boundaries.

## Source Locations

Decoded text carries a mapping from each UTF-16 unit back to its original source interval. JavaScript string and template escapes, Markdown punctuation escapes, and HTML entities can change text length without losing the source range of a finding. CRLF template normalization is used for comparison without normalizing the underlying source.

Comment transformations carry these mappings through margin removal, metadata filtering, and Markdown node selection. Masked metadata preserves UTF-16 length, including surrogate pairs; original indentation remains available to Markdown so code examples are not accidentally treated as prose.

The rule reports locations through Oxlint's source-code APIs. Native JSON diagnostics serialize byte offsets, so acceptance tests verify source slices using buffers, including Unicode before a finding and escaped spellings whose highlighted source is longer than the decoded word. String/template mappings that cannot be reconciled with the AST fail explicitly.

## Diagnostics and Caching

`spellcheck/check` reports ordinary native findings, with the decoded misspelled word and up to three suggestions. Oxlint's JSON diagnostic code is `spellcheck(check)`. Repeated visits to the same source interval are deduplicated within a rule instance.

Any configured Hunspell dictionary or exact vocabulary word can accept a token. Suggestions are merged across Hunspell engines, ranked by descending confidence, ascending distance, and ordinal spelling, then deduplicated and filtered to accepted words. Vocabulary files supply acceptance rather than their own suggestion engine.

The module caches up to 32 engines using dictionary paths and file device, inode, size, and nanosecond modification time. Each rule's dictionary collection caches suggestions for up to 256 unknown words. These bounded caches reduce repeated work while changed dictionary resources get new engine signatures.

## Read-Only Behavior and Fixes

Spelling checks never write source, dictionaries, or configuration. Dictionary package code and checked application source are never executed by the rule. Dependencies must be restored before checking; runtime spelling uses local resources and makes no downloads.

All results are report-only, including with `oxlint --fix`. Changing runtime strings can alter behavior, and renaming a single identifier occurrence can break references. Suggestions therefore remain diagnostic text rather than automatic replacements. Native severity and suppression remain Oxlint's responsibility.

Dependency installation is a separate preparation step and may contact the npm registry. Offline spelling does not require offline package installation or a prewarmed registry metadata cache.

## Self-Hosting and Validation

The repository's `.oxlintrc.json` loads the plugin through its public package export, just like a consumer. It uses the default spelling settings. Negative fixtures are excluded, and `npm run lint` disables nested configuration loading so fixture configurations cannot override that policy. Oxfmt handles formatting.

The acceptance suite packs the plugin, installs it in an owned temporary consumer with spaces and Unicode in its path, and invokes the actual installed Oxlint CLI. It exercises the repository configuration as well as scope-specific fixture configurations. Clean source must pass, typos must fail, and exactly the expected files must be processed; an invocation finding no files is not evidence that spelling worked.

During lint execution, a preload blocks socket connections, TLS connections, and `fetch`. Fixture and installed dictionary/package bytes are compared before and after checking, including a `--fix` invocation. Dictionary fixture entry points deliberately throw if executed, verifying that the loader reads their resources without evaluating their code. The archive is checked for absence of dictionary assets.

Cases cover prose selection, source locations, suppression, package markers, unprefixed vocabulary files, dictionary replacement and combination, malformed options, and missing resources. CI covers Node.js 22.19 on Linux and Node.js 24 on Linux, macOS, and Windows.

## Boundaries and Future Directions

Dylint is prior art, not a promise of feature parity. Rustdoc `include_str!` integration, compiler dependency tracking, and Cargo workspace ownership do not directly translate to this JavaScript plugin.

Standalone documents would require a companion CLI or another integration because Oxlint plugins cannot add those input formats. YAML front matter, Liquid exclusions, and Markdown `spellcheck:disable`/`enable`/`todo` directives are not implemented. Native Oxlint suppression remains available.

Vocabulary collection, if added, should be an explicit command rather than a side effect of a missing file during linting. Automatic source fixes remain deferred. Current hyphenated-token skipping also differs from Dylint, which checks the words in `helo-world`; that parity gap needs a separate focused change.

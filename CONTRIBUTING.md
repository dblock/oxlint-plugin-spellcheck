# Contributing

## Development

Use a Node.js version supported by the [requirements](README.md#requirements). Clone the repository and install dependencies:

```sh
git clone https://github.com/dblock/oxlint-plugin-spellcheck.git
cd oxlint-plugin-spellcheck
npm ci
```

Run the checks:

```sh
npm run lint
npm test
```

`npm run lint` runs Oxlint and Oxfmt. `npm test` runs the fixture-driven, packed-CLI integration suite. See [DESIGN.md](DESIGN.md#self-hosting-and-validation) for the test architecture and repository lint policy.

Give each scenario its own directory under `test/fixtures/`, containing source, `.oxlintrc.json`, expected output, and any local vocabulary resources. Add its directory name and source filename to `test/integration/suite.test.mjs`. For example, `jsx-strings/` contains `prose.tsx`, `.oxlintrc.json`, and `prose.expected.json`. Configurations and vocabulary paths resolve from the scenario directory; shared synthetic npm dictionaries live under `test/fixtures/packages/` and are installed once.

Expected diagnostics use `<source>.expected.json` with the source extension removed; use `[]` for clean results. Failure scenarios instead use `error.expected.json`, a JSON string holding the expected error regular expression. Both outcomes use the same case table and `fixture.check`; each scenario must have exactly one expectation file, which determines the assertions independently of the CLI exit status. Review expected messages, spans, and highlighted source when adding or changing a case; tests never rewrite expectations.

Collection scenarios use `"collect"` as the table's fourth field and collection options as the third. Their expected JSON object records `stdout`; an optional `output/` directory contains exact expected candidate/configuration bytes. Only those prescribed writes are allowed by the workspace snapshot, and configuration update scenarios must pass a follow-up lint run without findings.

## Testing in Another Project

Pack the working copy to test local changes in a consuming project:

```sh
npm pack
cd /path/to/your/project
npm install --save-dev oxlint /path/to/dblock-oxlint-plugin-spellcheck-0.1.0.tgz
```

Configure the plugin as shown in [Usage](README.md#usage).

## Benchmarks

Run `npm run bench` after installing dependencies. The benchmark checks real Oxlint and collection output before reporting end-to-end timings, with one worker, one warm-up, and five measured samples per workload. Set `BENCH_SAMPLES=3` for a shorter run or `BENCH_FILTER=unique` to select workload names containing `unique`. It covers 100,000 clean words, 10,000 repeated/varied typos or unique clean words across 100 files, and repeated/unique in-process dictionary lookups.

Corpora are generated in an owned temporary directory and removed afterward. Runtime network access is blocked. Results include Node/platform metadata, median/min/max milliseconds, and word throughput; compare identical workloads and sample counts on the same machine rather than treating timings as CI thresholds.

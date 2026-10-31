import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { arch, platform } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { getDictionary } from "../src/dictionaries.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const samples = Number(process.env.BENCH_SAMPLES ?? 5);
assert.ok(
  Number.isInteger(samples) && samples > 0,
  "BENCH_SAMPLES must be a positive integer.",
);
const dictionary = getDictionary(["@dictionary-en"], root);
const clean = [
  "hello",
  "world",
  "this",
  "is",
  "a",
  "simple",
  "example",
  "with",
  "clear",
  "words",
];
const typos = [
  "helo",
  "wrld",
  "mispelled",
  "recieve",
  "definately",
  "docummentation",
  "mesage",
  "functon",
  "paramter",
  "wrod",
];
assert.ok(clean.every((word) => dictionary.has(word)));
assert.ok(typos.every((word) => !dictionary.has(word)));
const require = createRequire(import.meta.url);
const english = join(dirname(require.resolve("dictionary-en")), "index.dic");
const unique = [
  ...new Set(
    readFileSync(english, "utf8")
      .split("\n")
      .slice(1)
      .map((line) => line.split("/")[0])
      .filter((word) => /^\p{L}+$/u.test(word)),
  ),
]
  .filter((word) => dictionary.has(word))
  .slice(0, 10000);
assert.equal(unique.length, 10000);
assert.ok(unique.every((word) => dictionary.has(word)));
const directory = mkdtempSync(join(root, ".spellcheck-bench-"));
const offline = new URL("../test/offline.mjs", import.meta.url).href;
const environment = {
  ...process.env,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${offline}`.trim(),
  npm_config_offline: "true",
};

function measure(name, operation, wordCount) {
  if (process.env.BENCH_FILTER && !name.includes(process.env.BENCH_FILTER))
    return;
  operation();
  const times = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    operation();
    times.push(performance.now() - start);
  }
  times.sort((left, right) => left - right);
  const median =
    (times[Math.floor((times.length - 1) / 2)] +
      times[Math.floor(times.length / 2)]) /
    2;
  return {
    workload: name,
    words: wordCount,
    median_ms: Number(median.toFixed(2)),
    min_ms: Number(times[0].toFixed(2)),
    max_ms: Number(times.at(-1).toFixed(2)),
    words_per_second: Math.round(wordCount / (median / 1000)),
  };
}

function invoke(executable, args) {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: directory,
    encoding: "utf8",
    env: environment,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return result;
}

try {
  const plain = { plugins: [], rules: {} };
  const spelling = {
    ...plain,
    jsPlugins: [{ name: "spellcheck", specifier: join(root, "src/index.mjs") }],
    rules: { "spellcheck/check": "error" },
  };
  writeFileSync(join(directory, "plain.json"), JSON.stringify(plain));
  writeFileSync(join(directory, ".oxlintrc.json"), JSON.stringify(spelling));
  const corpora = [
    { name: "clean", files: 100, perFile: 1000, words: clean, findings: 0 },
    {
      name: "unique-clean",
      files: 100,
      perFile: 100,
      words: unique,
      findings: 0,
    },
    {
      name: "repeated-typos",
      files: 100,
      perFile: 100,
      words: ["helo"],
      findings: 10000,
    },
    {
      name: "varied-typos",
      files: 100,
      perFile: 100,
      words: typos,
      findings: 10000,
    },
  ];
  for (const corpus of corpora) {
    mkdirSync(join(directory, corpus.name));
    for (let i = 0; i < corpus.files; i++) {
      const words = Array.from(
        { length: corpus.perFile },
        (_, index) =>
          corpus.words[(i * corpus.perFile + index) % corpus.words.length],
      );
      const source = `// ${words.join(" ")}\nexport const value = 1;\n`;
      writeFileSync(join(directory, corpus.name, `${i}.js`), source);
    }
  }
  const oxlint = join(root, "node_modules/oxlint/bin/oxlint");
  function lint(corpus, config = ".oxlintrc.json") {
    const result = invoke(oxlint, [
      "--config",
      config,
      "--threads",
      "1",
      "--format",
      "json",
      corpus.name,
    ]);
    const findings = config === "plain.json" ? 0 : corpus.findings;
    assert.equal(result.status, findings ? 1 : 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.number_of_files, corpus.files);
    assert.equal(report.diagnostics.length, findings);
    assert.ok(
      report.diagnostics.every(
        (finding) => finding.code === "spellcheck(check)",
      ),
    );
  }
  const results = [
    measure(
      "Oxlint without spellcheck",
      () => lint(corpora[0], "plain.json"),
      100000,
    ),
    ...corpora.map((corpus) =>
      measure(
        `Oxlint ${corpus.name}`,
        () => lint(corpus),
        corpus.files * corpus.perFile,
      ),
    ),
    ...corpora
      .filter((corpus) => corpus.findings > 0)
      .map((corpus) =>
        measure(
          `Collect ${corpus.name}`,
          () => {
            const result = invoke(join(root, "src/cli.mjs"), [
              "collect",
              "--",
              "--threads",
              "1",
              corpus.name,
            ]);
            assert.equal(result.status, 0, result.stderr);
            assert.equal(
              result.stdout,
              `${[...corpus.words].sort().join("\n")}\n`,
            );
          },
          corpus.files * corpus.perFile,
        ),
      ),
    measure(
      "Dictionary repeated lookup",
      () => {
        let accepted = 0;
        for (let i = 0; i < 100000; i++)
          accepted += dictionary.has(clean[i % clean.length]);
        assert.equal(accepted, 100000);
      },
      100000,
    ),
    measure(
      "Dictionary unique lookup",
      () => {
        let accepted = 0;
        for (let i = 0; i < 100000; i++)
          accepted += dictionary.has(unique[i % unique.length]);
        assert.equal(accepted, 100000);
      },
      100000,
    ),
  ].filter((result) => result !== undefined);
  assert.ok(results.length > 0, "BENCH_FILTER must match a workload.");
  console.log(
    JSON.stringify(
      {
        node: process.version,
        platform: `${platform()} ${arch()}`,
        samples,
        workers: 1,
        warmups: 1,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}

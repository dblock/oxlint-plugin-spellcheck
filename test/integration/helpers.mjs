import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtures = join(root, "test/fixtures");

function snapshot(path, exclude) {
  return Object.fromEntries(
    readdirSync(path, { withFileTypes: true })
      .filter((entry) => join(path, entry.name) !== exclude)
      .map((entry) => {
        const file = join(path, entry.name);
        return [
          entry.name,
          entry.isDirectory() ? snapshot(file, exclude) : readFileSync(file),
        ];
      }),
  );
}

export function project(t) {
  const directory = mkdtempSync(join(tmpdir(), "oxlint spellcheck \u03bb "));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.ok(process.env.npm_execpath, "Run integration tests with npm test.");
  const npm = (...args) =>
    execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  const [archive] = JSON.parse(
    npm("pack", "--ignore-scripts", "--json", "--pack-destination", directory),
  );
  assert.equal(
    archive.files.some(({ path }) => /\.(?:aff|dic)$/u.test(path)),
    false,
  );
  writeFileSync(
    join(directory, "package.json"),
    '{"private":true,"type":"module"}',
  );
  cpSync(fixtures, join(directory, "fixtures"), { recursive: true });
  const { devDependencies } = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  execFileSync(
    process.execPath,
    [
      process.env.npm_execpath,
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(directory, archive.filename),
      `oxlint@${devDependencies.oxlint}`,
      join(directory, "fixtures/packages/dictionary"),
      join(directory, "fixtures/packages/incomplete-dictionary"),
    ],
    { cwd: directory, stdio: ["ignore", "pipe", "pipe"] },
  );
  for (const name of ["repository-clean", "repository-typo"]) {
    const scenario = join(directory, "fixtures", name);
    cpSync(join(root, ".oxlintrc.json"), join(scenario, ".oxlintrc.json"));
    cpSync(fixtures, join(scenario, "test/fixtures"), { recursive: true });
  }
  const paths = [
    directory,
    join(directory, "node_modules/@dblock/oxlint-plugin-spellcheck"),
    join(directory, "node_modules/dictionary-en"),
  ];
  const capture = () =>
    paths.map((path) => snapshot(path, join(directory, "node_modules")));
  const before = capture();
  const offline = new URL("../offline.mjs", import.meta.url).href;

  function invoke(name, executable, args) {
    const result = spawnSync(
      process.execPath,
      [join(directory, executable), ...args],
      {
        cwd: join(directory, "fixtures", name),
        encoding: "utf8",
        env: {
          ...process.env,
          npm_config_offline: "true",
          NODE_OPTIONS:
            `${process.env.NODE_OPTIONS ?? ""} --import ${offline}`.trim(),
        },
      },
    );
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    return result;
  }
  function run(name, file, flags = []) {
    return invoke(name, "node_modules/oxlint/bin/oxlint", [
      "--config",
      ".oxlintrc.json",
      "--format",
      "json",
      ...flags,
      file,
    ]);
  }
  const plugin = join(
    directory,
    "node_modules/@dblock/oxlint-plugin-spellcheck",
  );
  const binary = JSON.parse(readFileSync(join(plugin, "package.json"), "utf8"))
    .bin["oxlint-spellcheck"];

  return {
    check(name, file, flags = [], command = "lint") {
      const expectations = readdirSync(join(fixtures, name)).filter((entry) =>
        entry.endsWith(".expected.json"),
      );
      assert.equal(
        expectations.length,
        1,
        `${name}: expected exactly one expectation file`,
      );
      const [expectation] = expectations;
      assert.ok(
        expectation === `${parse(file).name}.expected.json` ||
          expectation === "error.expected.json",
        `${name}: unexpected expectation filename ${expectation}`,
      );
      const expected = JSON.parse(
        readFileSync(join(fixtures, name, expectation), "utf8"),
      );
      const args = ["collect", ...flags];
      if (!flags.includes("--")) args.push("--");
      args.push("--config", ".oxlintrc.json", file);
      const result =
        command === "collect"
          ? invoke(
              name,
              join("node_modules/@dblock/oxlint-plugin-spellcheck", binary),
              args,
            )
          : run(name, file, flags);
      if (expectation === "error.expected.json") {
        assert.equal(typeof expected, "string");
        assert.notEqual(result.status, 0);
        assert.match(result.stderr + result.stdout, new RegExp(expected, "iu"));
        return;
      }
      if (command === "collect") {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, expected.stdout);
        const output = join(fixtures, name, "output");
        if (existsSync(output)) {
          for (const entry of readdirSync(output)) {
            const contents = readFileSync(join(output, entry));
            assert.deepEqual(
              readFileSync(join(directory, "fixtures", name, entry)),
              contents,
            );
            before[0].fixtures[name][entry] = contents;
          }
          if (existsSync(join(output, ".oxlintrc.json"))) {
            const clean = run(name, file);
            assert.equal(clean.status, 0, clean.stderr);
            const report = JSON.parse(clean.stdout);
            assert.equal(report.number_of_files, 1);
            assert.deepEqual(report.diagnostics, []);
          }
        }
        return;
      }
      assert.ok(Array.isArray(expected));
      assert.notEqual(result.stdout.trim(), "", result.stderr);
      const report = JSON.parse(result.stdout);
      assert.equal(report.number_of_files, 1, result.stderr);
      assert.equal(
        result.status,
        report.diagnostics.length ? 1 : 0,
        result.stderr,
      );
      const scenario = join(directory, "fixtures", name);
      const filename = join(scenario, file);
      const source = readFileSync(filename);
      const actual = report.diagnostics.map((finding) => {
        assert.equal(finding.code, "spellcheck(check)");
        assert.equal(resolve(scenario, finding.filename), filename);
        assert.equal(finding.labels.length, 1);
        const span = finding.labels[0].span;
        return {
          message: finding.message,
          span,
          source: source
            .subarray(span.offset, span.offset + span.length)
            .toString(),
        };
      });
      assert.deepEqual(actual, expected);
    },
    unchanged() {
      assert.deepEqual(capture(), before);
    },
  };
}

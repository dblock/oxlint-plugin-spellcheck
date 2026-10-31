import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));

async function snapshot(path) {
  const result = {};
  for (const entry of await readdir(path, { withFileTypes: true })) {
    result[entry.name] = entry.isDirectory()
      ? await snapshot(join(path, entry.name))
      : await readFile(join(path, entry.name));
  }
  return result;
}

test("the packed plugin checks spelling through the actual Oxlint CLI offline", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "oxlint spellcheck \u03bb "));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.ok(process.env.npm_execpath, "Run acceptance tests with npm test.");
  function npm(args, cwd) {
    return execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  const [archive] = JSON.parse(
    npm(
      ["pack", "--ignore-scripts", "--json", "--pack-destination", directory],
      root,
    ),
  );
  await writeFile(
    join(directory, "package.json"),
    '{"private":true,"type":"module"}',
  );
  npm(
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(directory, archive.filename),
      "oxlint@1.90.0",
    ],
    directory,
  );
  await cp(join(root, "test/fixtures"), join(directory, "fixtures"), {
    recursive: true,
  });
  const executable = join(directory, "node_modules/oxlint/bin/oxlint");
  const offline = new URL("./offline.mjs", import.meta.url).href;
  function invoke(file, config = ".oxlintrc.json", extra = []) {
    const result = spawnSync(
      process.execPath,
      [
        executable,
        "--config",
        join("fixtures", config),
        "--format",
        "json",
        ...extra,
        join("fixtures", file),
      ],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_OPTIONS:
            `${process.env.NODE_OPTIONS ?? ""} --import ${offline}`.trim(),
          npm_config_offline: "true",
        },
      },
    );
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    return result;
  }
  function findings(file, config, extra) {
    const result = invoke(file, config, extra);
    assert.notEqual(result.stdout.trim(), "", result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.number_of_files, 1, result.stderr);
    assert.equal(
      result.status,
      report.diagnostics.length ? 1 : 0,
      result.stderr,
    );
    assert.ok(
      report.diagnostics.every(
        (finding) => finding.code === "spellcheck(check)",
      ),
    );
    return report.diagnostics;
  }
  const before = await snapshot(join(directory, "fixtures"));
  const plugin = join(directory, "node_modules/oxlint-plugin-spellcheck");
  const pluginBefore = await snapshot(plugin);
  await t.test(
    "the repository configuration loads the package and excludes negative fixtures",
    async () => {
      await cp(join(root, ".oxlintrc.json"), join(directory, ".oxlintrc.json"));
      await cp(join(root, "test/fixtures"), join(directory, "test/fixtures"), {
        recursive: true,
      });
      const smoke = join(directory, "smoke.tsx");
      const extra = ["--disable-nested-config", "test/fixtures"];
      await cp(join(root, "test/fixtures/valid.tsx"), smoke);
      assert.deepEqual(
        findings("../smoke.tsx", "../.oxlintrc.json", extra),
        [],
      );
      await cp(join(root, "test/fixtures/typo.js"), smoke);
      const diagnostics = findings("../smoke.tsx", "../.oxlintrc.json", extra);
      assert.equal(diagnostics.length, 1);
      assert.match(diagnostics[0].message, /"helo"/u);
    },
  );
  await t.test("clean code and prose exclusions", () => {
    assert.deepEqual(findings("valid.tsx"), []);
  });
  await t.test("comment typo, suggestions, and --fix stays read-only", () => {
    const [finding] = findings("typo.js", undefined, ["--fix"]);
    assert.match(finding.message, /"helo". Suggestions: hello,/u);
    assert.deepEqual(finding.labels[0].span, {
      offset: 3,
      length: 4,
      line: 1,
      column: 4,
    });
    assert.deepEqual(findings("typo.js", "no-comments.json"), []);
  });
  await t.test(
    "JSX text and human-facing attributes, not structural strings",
    () => {
      assert.equal(findings("prose.tsx").length, 4);
      assert.equal(findings("prose.tsx", "strings.json").length, 5);
      assert.equal(findings("prose.tsx", "strings-no-jsx.json").length, 2);
      assert.equal(findings("entity.jsx").length, 2);
    },
  );
  await t.test(
    "opt-in strings preserve escapes and omit imports, keys, and tagged templates",
    async () => {
      const diagnostics = findings("strings.ts", "strings.json");
      assert.equal(diagnostics.length, 2);
      assert.ok(
        diagnostics.every((finding) => /"helo"/u.test(finding.message)),
      );
      const source = await readFile(join(directory, "fixtures", "strings.ts"));
      assert.ok(
        diagnostics.some(
          (finding) =>
            source
              .subarray(
                finding.labels[0].span.offset,
                finding.labels[0].span.offset + finding.labels[0].span.length,
              )
              .toString() === "he\\u006co",
        ),
      );
    },
  );
  await t.test("opt-in identifier splitting", () => {
    assert.deepEqual(findings("identifiers.js"), []);
    const [finding] = findings("identifiers.js", "identifiers.json");
    assert.match(finding.message, /"helo"/u);
    assert.equal(finding.labels[0].span.length, 4);
  });
  await t.test("native file and next-line suppression", () => {
    assert.deepEqual(findings("suppressed.js"), []);
    assert.deepEqual(findings("inline-suppressed.js"), []);
  });
  await t.test("Unicode and CRLF locations map to original bytes", async () => {
    for (const file of ["unicode.js", "crlf.js"]) {
      const [finding] = findings(file);
      const { offset, length } = finding.labels[0].span;
      assert.equal(
        (await readFile(join(directory, "fixtures", file)))
          .subarray(offset, offset + length)
          .toString(),
        "helo",
      );
    }
  });
  await t.test(
    "Markdown escapes, entities, and masked Unicode preserve source ranges",
    async () => {
      const source = await readFile(
        join(directory, "fixtures", "mapped-comments.js"),
      );
      const diagnostics = findings("mapped-comments.js");
      assert.equal(diagnostics.length, 3);
      assert.deepEqual(
        diagnostics.map((finding) => {
          const { offset, length } = finding.labels[0].span;
          return source.subarray(offset, offset + length).toString();
        }),
        ["helo", "helo", "he&#108;o"],
      );
    },
  );
  await t.test(
    "project vocabulary is case-sensitive and explicit dictionaries replace defaults",
    () => {
      assert.match(
        findings("vocabulary.js", "vocabulary.json")[0].message,
        /"Helo"/u,
      );
      assert.match(
        findings("replacement.js", "replacement.json")[0].message,
        /"hello"/u,
      );
      assert.match(
        findings("dictionary.js", "dictionary.json")[0].message,
        /"hello"/u,
      );
    },
  );
  await t.test(
    "missing dictionaries and malformed options fail explicitly",
    () => {
      const missing = invoke("typo.js", "missing.json");
      assert.notEqual(missing.status, 0);
      assert.match(missing.stderr + missing.stdout, /missing\.txt/u);
      const invalid = invoke("typo.js", "invalid.json");
      assert.notEqual(invalid.status, 0);
      assert.match(invalid.stderr + invalid.stdout, /boolean|schema|invalid/iu);
    },
  );
  assert.deepEqual(await snapshot(join(directory, "fixtures")), before);
  assert.deepEqual(await snapshot(plugin), pluginBefore);
});

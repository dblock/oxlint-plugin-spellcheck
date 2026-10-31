#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import jsonc from "jsonc-parser";

const help = `Usage: oxlint-spellcheck collect [--output FILE] [--update-config] -- [OXlint options and paths]

Collect sorted, unique unknown words using the current spelling configuration.
Without --output, print words to stdout. Output files must not already exist.
--update-config requires --output and adds the file to the selected JSON/JSONC
configuration. Review candidates: collected typos become accepted vocabulary.
`;

function argumentsFor(argv) {
  if (argv.length === 0 || ["--help", "-h"].includes(argv[0])) {
    process.stdout.write(help);
    return;
  }
  if (argv.shift() !== "collect")
    throw new Error("Expected the collect command.");
  let output;
  let updateConfig = false;
  let args = [];
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === "--") {
      args = argv.slice(i + 1);
      break;
    }
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(help);
      return;
    }
    if (argument === "--output" || argument.startsWith("--output=")) {
      if (output !== undefined)
        throw new Error("--output may only be specified once.");
      output = argument === "--output" ? argv[++i] : argument.slice(9);
      if (!output || output.startsWith("--"))
        throw new Error("--output requires a filename.");
    } else if (argument === "--update-config") {
      updateConfig = true;
    } else {
      throw new Error(
        `Unknown collection option ${argument}; pass Oxlint options and paths after --.`,
      );
    }
  }
  if (updateConfig && !output)
    throw new Error("--update-config requires --output.");
  let config;
  for (let i = 0; i < args.length && args[i] !== "--"; i++) {
    const option = args[i].split("=")[0];
    if (
      option.startsWith("--fix") ||
      option.startsWith("-f") ||
      [
        "--format",
        "--init",
        "--lsp",
        "--print-config",
        "--rules",
        "--debug",
        "--silent",
        "--quiet",
        "--help",
        "--version",
        "-h",
        "-V",
      ].includes(option)
    )
      throw new Error(`${option} is not allowed during collection.`);
    if (option === "--config" || option === "-c") {
      config = args[i].includes("=")
        ? args[i].slice(args[i].indexOf("=") + 1)
        : args[++i];
      if (!config) throw new Error(`${option} requires a filename.`);
    } else if (option.startsWith("-c")) {
      config = args[i].slice(2);
    }
  }
  return { output, updateConfig, args, config };
}

function configuration(path, seen = new Set()) {
  path = realpathSync(path);
  if (!/\.jsonc?$/iu.test(path))
    throw new Error(
      "Config updates require JSON/JSONC configurations, including extended configs.",
    );
  if (seen.has(path)) throw new Error(`Configuration cycle at ${path}.`);
  seen.add(path);
  const text = readFileSync(path, "utf8");
  const errors = [];
  const config = jsonc.parse(text, errors, { allowTrailingComma: true });
  if (errors.length)
    throw new Error(
      `Invalid configuration ${path} at offset ${errors[0].offset}.`,
    );
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error(`Expected a configuration object in ${path}.`);
  const rules = {};
  const overrides = [];
  const sources = [];
  for (const entry of config.extends ?? []) {
    const local = resolve(dirname(path), entry);
    const parent = configuration(
      existsSync(local) ? local : createRequire(path).resolve(entry),
      seen,
    );
    sources.push(parent.rules);
    overrides.push(...parent.overrides);
  }
  sources.push(config.rules ?? {});
  for (const source of sources) {
    for (const [name, rule] of Object.entries(source)) {
      const previous = rules[name];
      const value = Array.isArray(rule) ? rule : [rule];
      rules[name] =
        value.length === 1 && previous
          ? [value[0], ...previous.slice(1)]
          : value;
    }
  }
  overrides.push(...(config.overrides ?? []));
  seen.delete(path);
  return { path, text, rules, overrides };
}

function configEdit(path, output, names) {
  const config = configuration(path);
  const active = names.filter((name) => {
    const rule = config.rules[`${name}/check`];
    return rule && ![0, "off", "allow"].includes(rule[0]);
  });
  if (active.length !== 1)
    throw new Error(
      "Config updates require exactly one enabled spellcheck rule in the selected configuration.",
    );
  const key = `${active[0]}/check`;
  if (
    config.overrides.some((override) => override.rules?.[key] !== undefined)
  ) {
    throw new Error(
      "Config updates do not support spellcheck rule overrides; update those dictionary lists explicitly.",
    );
  }
  const [severity, options = {}] = config.rules[key];
  const dictionaries = [...(options.dictionaries ?? ["@dictionary-en"])];
  const pathFromCwd = relative(process.cwd(), output).split(sep).join("/");
  const vocabulary =
    isAbsolute(pathFromCwd) || pathFromCwd.startsWith("../")
      ? pathFromCwd
      : `./${pathFromCwd}`;
  if (!dictionaries.includes(vocabulary)) dictionaries.push(vocabulary);
  const indent = config.text.match(/^[ \t]+(?=")/mu)?.[0] ?? "  ";
  const edits = jsonc.modify(
    config.text,
    ["rules", key],
    [severity, { ...options, dictionaries }],
    {
      formattingOptions: {
        insertSpaces: !indent.includes("\t"),
        tabSize: indent.length,
        eol: config.text.includes("\r\n") ? "\r\n" : "\n",
      },
    },
  );
  return { ...config, updated: jsonc.applyEdits(config.text, edits) };
}

function writeOutput(path, text, config) {
  const descriptor = openSync(path, "wx");
  let temporary;
  try {
    try {
      writeFileSync(descriptor, text);
    } finally {
      closeSync(descriptor);
    }
    if (config) {
      temporary = `${config.path}.spellcheck-${randomUUID()}.tmp`;
      writeFileSync(temporary, config.updated, {
        flag: "wx",
        mode: statSync(config.path).mode,
      });
      if (readFileSync(config.path, "utf8") !== config.text)
        throw new Error(
          "Configuration changed during collection; refusing to replace it.",
        );
      renameSync(temporary, config.path);
      temporary = undefined;
    }
  } catch (error) {
    unlinkSync(path);
    throw error;
  } finally {
    if (temporary && existsSync(temporary)) unlinkSync(temporary);
  }
}

function collect(options) {
  const require = createRequire(resolve(process.cwd(), "package.json"));
  const packagePath = require.resolve("oxlint/package.json");
  const metadata = JSON.parse(readFileSync(packagePath, "utf8"));
  const executable = resolve(dirname(packagePath), metadata.bin.oxlint);
  function run(args) {
    const result = spawnSync(process.execPath, [executable, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.signal)
      throw new Error(`Oxlint terminated by ${result.signal}.`);
    if (![0, 1].includes(result.status))
      throw new Error(`Oxlint exited with status ${result.status}.`);
    if (!result.stdout.trim())
      throw new Error("Oxlint produced no JSON report.");
    if (result.stdout.startsWith("No files found"))
      throw new Error("Oxlint processed no files.");
    return { status: result.status, report: JSON.parse(result.stdout) };
  }
  const selected = options.config ? ["--config", options.config] : [];
  const settings = run(["--print-config", ...selected]);
  if (settings.status !== 0)
    throw new Error("Cannot load the Oxlint configuration.");
  const names = [
    "spellcheck",
    ...(settings.report.jsPlugins ?? [])
      .filter(
        (plugin) =>
          typeof plugin === "object" &&
          plugin.specifier === "@dblock/oxlint-plugin-spellcheck",
      )
      .map((plugin) => plugin.name),
  ];
  const codes = new Set(names.map((name) => `${name}(check)`));
  const output = options.output ? resolve(options.output) : undefined;
  const edit = options.updateConfig
    ? configEdit(options.config ?? ".oxlintrc.json", output, [
        ...new Set(names),
      ])
    : undefined;
  const { status, report } = run(["--format", "json", ...options.args]);
  if (!Number.isInteger(report.number_of_files) || report.number_of_files < 1)
    throw new Error("Oxlint processed no files.");
  if (!Array.isArray(report.diagnostics))
    throw new Error("Invalid Oxlint diagnostics report.");
  const words = new Set();
  const failures = [];
  for (const finding of report.diagnostics) {
    if (
      typeof finding.message !== "string" ||
      !["error", "warning", "advice"].includes(finding.severity)
    )
      throw new Error("Invalid Oxlint diagnostic.");
    if (!codes.has(finding.code)) {
      const message = `${finding.filename}: ${finding.message}`;
      if (finding.severity === "error") failures.push(message);
      else process.stderr.write(`${message}\n`);
      continue;
    }
    const match = /^Misspelled word "([^"]+)"\./u.exec(finding.message);
    if (!match)
      throw new Error(`Unexpected spellcheck diagnostic: ${finding.message}`);
    words.add(match[1]);
  }
  if (failures.length)
    throw new Error(
      `Other lint errors prevent collection:\n${failures.join("\n")}`,
    );
  if (status !== 0 && words.size === 0)
    throw new Error("Oxlint failed without collecting spelling findings.");
  const sorted = [...words].sort();
  const text = sorted.length ? `${sorted.join("\n")}\n` : "";
  if (output) {
    writeOutput(output, text, edit);
    process.stderr.write(
      `Created ${options.output}.${edit ? ` Updated ${options.config ?? ".oxlintrc.json"}.` : ""}\n`,
    );
  } else {
    process.stdout.write(text);
  }
}

try {
  const options = argumentsFor(process.argv.slice(2));
  if (options) collect(options);
} catch (error) {
  process.stderr.write(`oxlint-spellcheck: ${error.message}\n`);
  process.exitCode = 1;
}

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

`npm run lint` runs Oxlint and Oxfmt. `npm test` runs the packed-CLI acceptance suite. See [DESIGN.md](DESIGN.md#self-hosting-and-validation) for the test architecture and repository lint policy.

## Testing in Another Project

Pack the working copy to test local changes in a consuming project:

```sh
npm pack
cd /path/to/your/project
npm install --save-dev oxlint /path/to/oxlint-plugin-spellcheck-0.1.0.tgz
```

Configure the plugin as shown in [Usage](README.md#usage).

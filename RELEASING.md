# Releasing

Publishing packages, pushing release tags, and creating GitHub releases require explicit maintainer authorization. The npm package is `@dblock/oxlint-plugin-spellcheck`; the repository name and `oxlint-spellcheck` command are unchanged. Never overwrite a published version or an existing release tag.

## Prepare

1. Start from a clean `main` branch synchronized with GitHub. Confirm all intended changes are merged.
2. For a new version, run `npm version VERSION --no-git-tag-version` to update both package manifests without creating a tag. Date the matching changelog section and review the public documentation.
3. Confirm the package is publishable, with no `private: true` guard. Run `npm run lint`, `npm test`, and `npm pack --dry-run`. The integration suite installs the actual packed package and checks the plugin and collection CLI offline.
4. Review the archive contents: runtime modules, executable CLI, README, changelog, contributor/design/release documentation, and license must be present. Tests, fixtures, benchmark corpora, and dictionary assets must not be included. English and WASM are installed dependencies with separate licenses.
5. Commit the release preparation, including the Copilot coauthor trailer when applicable, and push. Wait for all four CI jobs to pass at the exact release commit before publishing.

## Publish

Confirm the intended npm account with `npm whoami` and check that `npm view @dblock/oxlint-plugin-spellcheck@VERSION version` does not report an existing release. For the first publication, an npm `E404` is expected; authentication or network errors are not evidence that a version is available. If authentication fails, run `npm login` and retry.

Publish from the clean, validated release commit:

```sh
npm publish --access public
```

Follow npm's authentication prompt. If npm requires a command-line one-time password, obtain a fresh code immediately before running `npm publish --access public --otp FRESH_CODE`; never retain, log, or commit the code.

Verify the exact public version and registry integrity:

```sh
npm view @dblock/oxlint-plugin-spellcheck@VERSION version dist.integrity
```

Install the published version and supported Oxlint in an owned temporary consumer:

```sh
npm install --save-dev oxlint @dblock/oxlint-plugin-spellcheck@VERSION
```

Follow the README configuration and check a source comment containing `helo`. Confirm native lint reports that word, the collection CLI prints it, collection with `--output .spellcheck.txt --update-config` registers it, and a follow-up lint run passes. Run these checks with the repository's `test/offline.mjs` preload after dependency installation to verify runtime network access is unnecessary. Remove only the temporary consumer created for this check.

## Tag and GitHub Release

Only after verifying npm publication and the installed consumer, create an annotated tag at the release preparation commit and push it:

```sh
git tag -a vVERSION RELEASE_COMMIT -m "Release VERSION"
git push origin vVERSION
gh release create vVERSION --repo dblock/oxlint-plugin-spellcheck --verify-tag --title VERSION --notes-file RELEASE_NOTES
```

Replace the placeholders with the exact published version, validated commit, and a temporary notes file containing the matching changelog entries. If a step fails after publication, resume the missing verification/tag/release steps; do not republish, move tags, or imply rollback of an immutable npm version.

## Continue Development

For the next release, update the version without creating a tag and add its changelog section. Keep release preparation changes separate from unrelated implementation work.

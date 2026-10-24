# Contributing

This guide explains the files, the development, the tests and the release of
the extension. The [README](README.md) describes the use,
[architecture.md](docs/architecture.md) how the extension works inside, and
[security.md](docs/security.md) its security model.

## Files

| File | Purpose |
| --- | --- |
| `src/extension.ts` | The entry point of the extension: starts the install hint, and returns the small API that the tests in VS Code use. |
| `src/installHint.ts`, `src/installCheck.ts` | The install hint: the check of the TypeScript of each folder of the workspace, the hint with **Run npm ci**, the wait for `node_modules/typescript/lib/tsserver.js`, and the hint with **Reload window**. `src/installCheck.ts` does not import `vscode`. |
| `src/plugin.ts` | The TypeScript server plugin `nimblescape-typescript-plugin`: wraps the language service of each project and filters its completions. |
| `src/autoImportFilter.ts` | The two rules of the filter of the auto-imports. It uses only the TypeScript module that the TypeScript server gives the plugin. |
| `plugin/package.json` | The package `nimblescape-typescript-plugin`, through which the TypeScript server loads `dist/plugin.js`. The section [Manifest](#manifest) explains it. |
| `test/unit/` | The unit tests with vitest. They need no VS Code. `test/unit/autoImportFilter.test.ts` tests the rules with a language service of TypeScript 6.0.3; `test/unit/manifest.test.ts` checks the manifest, the plugin package, the files of the package, the documents and the license headers. |
| `test/tsserver/` | The tests with the TypeScript server of `examples/`, and a small client of the protocol of the TypeScript server (`tsserver.ts`). |
| `test/vscode/`, `.vscode-test.mjs`, `scripts/build-vscode-tests.mjs` | The tests in a real VS Code, their settings, and their build into `out/`. |
| `examples/` | A small course project with `@types/node`, es-toolkit, `@majikmate/ts-utils` and TypeScript 6.0.3, its `package-lock.json`, and the course rules of `tsconfig.json`. The tests and the launch configuration "Run the extension" use it. |
| `docs/` | The architecture and the security model. |
| `dist/` | The bundles `dist/extension.js` and `dist/plugin.js`, built by `esbuild.mjs` and kept out of Git. |
| `resources/icon.png`, `resources/icon.svg` | The Marketplace icon (256 × 256 PNG, because the Marketplace takes no SVG icon) and its source: a list of completions whose middle entry is crossed out, on the tile of the nimblescape extensions. |
| `esbuild.mjs` | Bundles the extension and the plugin. Both bundles are readable: not minified. A production build (`--production`) has no source map. |
| `tsconfig.json` | The TypeScript settings of the type check: strict, and no output, because esbuild builds the bundles. |
| `vitest.config.mts`, `vitest.tsserver.config.mts` | The settings of the unit tests (`test/unit/**/*.test.ts` and `scripts/**/*.test.mjs`) and of the tests with the TypeScript server. |
| `package.json` | The extension manifest. The section [Manifest](#manifest) explains it. |
| `package-lock.json` | The locked development tools. npm writes this file, and nobody edits it by hand. |
| `.node-version` | The Node release of the development tools. `actions/setup-node` in the workflows and local Node version managers read it. |
| `.vscodeignore` | Lists the files of the package: the two bundles, `node_modules/nimblescape-typescript-plugin/package.json`, `resources/icon.png`, `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE` and `SUPPORT.md`. |
| `.github/workflows/ci.yml` | Checks the types, runs all tests and packages every push to `main`, every pull request and the commit of every release. The release publishes the VSIX of this workflow, so a change of it needs a dry run (rule 4 of the [release rules](#release-rules)). |
| `.github/workflows/vscode-versions.yml` | Runs the tests in VS Code once per week on VS Code Insiders and on the lowest supported version. |
| `.github/workflows/release.yml` | Releases a version on a manual start: commits the version to a temporary branch, tests and packages it with `ci.yml`, and only then moves `main` to it, creates its tag and GitHub release and publishes it to the Marketplace. A dry run tests without a change. The section [Release](#release) explains it. |
| `.github/workflows/release-dry-run.yml` | Fails on a pull request that changes the release process (`release.yml`, `ci.yml` or `scripts/release-checks.mjs`) until a dry run on its branch tested the change (rule 4 of the [release rules](#release-rules)). |
| `.github/workflows/marketplace-identity.yml` | Prints the Marketplace member ID of the publishing identity, to check the setup of the repository. |
| `.github/dependabot.yml` | Proposes weekly updates of the development tools and of the pinned actions. |
| `scripts/install-local.mjs`, `scripts/uninstall-local.mjs` | Install the built package into every profile of the VS Code of this computer, and remove it again. |
| `scripts/marketplace-setup.sh` | Sets up the Marketplace publishing of the repository. The section [Setup of a repository](#setup-of-a-repository) explains it. |
| `scripts/release-checks.mjs`, `scripts/release-checks.test.mjs` | The check of rule 4 of the [release rules](#release-rules), which the workflows run, and its test. |
| `.vscode/launch.json`, `.vscode/tasks.json` | Build the bundles and start a VS Code window that loads the extension from this folder and opens `examples/`. |

## Development

The extension uses VS Code APIs, and the plugin the language service of the
TypeScript server. The development tools are TypeScript, esbuild, vitest,
mocha with `@vscode/test-cli`, and
[`@vscode/vsce`](https://github.com/microsoft/vscode-vsce), the Microsoft tool
that packages and publishes extensions. Everything runs on Node.js 24: the
release in `.node-version` for the tools and CI, and the runtime of VS Code
(`engines.vscode`) for the extension and the TypeScript server.

| Command | Effect |
| --- | --- |
| `npm ci --ignore-scripts` | Installs the locked development tools and runs no install script of a dependency. It also links `node_modules/nimblescape-typescript-plugin` to `plugin/`. |
| `npm ci --ignore-scripts --prefix examples` | Installs the locked packages of the examples, which the tests with the TypeScript server and in VS Code need. |
| `npm run typecheck` | Checks the types with `tsc`. esbuild does not check them. |
| `npm test` | Runs the unit tests with vitest. They touch no installed editor. |
| `npm run test:tsserver` | Builds the bundles and runs the tests with the TypeScript server of the examples. |
| `npm run test:vscode` | Downloads VS Code to `.vscode-test/`, and runs the tests in VS Code. On Linux without a display, run it under `xvfb-run -a`. `VSCODE_TEST_VERSION` selects the VS Code version: `stable` (the default), `insiders` or a version such as `1.125.0`. `@vscode/test-electron` always starts VS Code with `--disable-workspace-trust`, so these tests cannot cover Restricted Mode. |
| `npm run build` | Bundles `dist/` with source maps; `npm run watch` bundles again after each change. |
| `npm run package` | Builds `nimblescape-typescript-<version>.vsix` with vsce, which first runs the production build (`vscode:prepublish`). vsce also validates the manifest and the README. |
| `npm run install-local` | Builds the package and installs it into every profile of the VS Code of this computer; `-- --profile <name>` installs into one profile. |
| `npm run uninstall-local` | Removes `nimblescape.nimblescape-typescript` from every profile of the VS Code of this computer. |

The launch configuration "Run the extension" builds the bundles and starts a
second VS Code window that loads the extension from this folder and opens
`examples/`, so that a change can be tried without a package. The TypeScript
server of that window loads the plugin from `dist/plugin.js` of this folder;
after a change of the plugin, run the command **TypeScript: Restart TS
Server** in that window. The setting `typescript.tsserver.log` (`normal`) and
the command **TypeScript: Open TS Server log** show the lines of the plugin.

The examples are part of the tests: the tests with the TypeScript server and
in VS Code complete names in a file next to `examples/dog.ts`, with the
packages of `examples/package.json`. After a change of the examples, adapt
the lists `HIDDEN` and `KEPT` in `test/tsserver/course.test.ts` and
`test/vscode/completions.test.ts`.

## Reviewing the package

The VSIX holds the two bundles of `dist/` as readable JavaScript: not
minified, with the names of the source. To compare a VSIX with the sources,
unpack it (a VSIX is a ZIP file), run `npm ci --ignore-scripts` and
`npm run vscode:prepublish` at the tag of its version, and compare
`extension/dist/` of the VSIX with `dist/`. With the same sources and the
locked versions of the tools, the build gives the same files.
`extension/node_modules/nimblescape-typescript-plugin/package.json` is a copy
of `plugin/package.json`.

## Manifest

`package.json` is the extension manifest. It has these parts:

- The name and the publisher define the extension ID `nimblescape.nimblescape-typescript`; the section [Naming](#naming) explains the name.
- The version is the only source of the package version, and the tag of a release names it.
- The engine range defines the compatible VS Code versions. `@types/vscode` stays at the lowest version of that range, and the workflow "VS Code versions" tests that version.
- `main` selects the bundle `dist/extension.js`. A test checks it.
- `.vscodeignore` lists the files of the package, not a `files` field: it ignores everything and keeps the two bundles, the plugin package, the icon, `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE` and `SUPPORT.md`. A test checks the list, the files that `vsce ls` packages, and that the bundle of the extension leaves out the editor API and the built-in modules of Node.js only, and the bundle of the plugin every package.
- `extensionKind` selects the workspace host, where the files and the TypeScript server are, also on a remote host.
- The activation event `workspaceContains:package.json` activates the extension for the install hint. The plugin needs no activation.
- `contributes.typescriptServerPlugins` names the plugin `nimblescape-typescript-plugin`, with `enableForWorkspaceTypeScriptVersions`, so that the TypeScript of the workspace also loads it.
- `capabilities` states that the extension supports untrusted workspaces in part, because it shows the install hint only in a trusted workspace, and no virtual workspaces.
- The icon, the description, the categories, the keywords and the banner color complete the Marketplace page.
- The only runtime dependency is `"nimblescape-typescript-plugin": "file:plugin"`, the package of the plugin in this repository. The TypeScript server loads a plugin from `node_modules/<name of the plugin>` of the folder of the extension, so the package needs that folder. npm links it to `plugin/`, and vsce packages it, because `npm run package` runs vsce without `--no-dependencies`. `plugin/package.json` names `../../dist/plugin.js` as its main file, which leads from `node_modules/nimblescape-typescript-plugin/` to `dist/plugin.js`, in the repository and in the installed extension. The package has no dependency, and its file is the only file of `node_modules` in the VSIX.
- The development dependencies are the build, test and packaging tools. `typescript` is the exact version 6.0.3, the TypeScript of VS Code 1.125 and later and of the courses: the plugin uses the language service of TypeScript 6, and TypeScript 7 has none for plugins, so Dependabot proposes no update of it. `overrides` pins newer versions of packages inside `@vscode/test-cli` (mocha's `diff`, `glob` and `serialize-javascript`), and `allowScripts` lists the install scripts of dependencies that npm 11.19 and later may run: those of esbuild and `@vscode/vsce-sign` in every version, because the build and the packaging (`npm run package`) run the code of both packages anyway and Dependabot updates them, and not the one of fsevents, an optional package for macOS that already contains its built binary.

`tsconfig.json` has no `erasableSyntaxOnly`: the plugin exports its factory
function with `export =`, the form that the TypeScript server loads with
`require()`.

`README.md` is the page of the Marketplace and `CHANGELOG.md` its tab
"Changelog". vsce does not rewrite relative links
(`--no-rewrite-relative-links`), so both use full `https://…` links outside
code. A test checks it.

## Naming

Every extension of the publisher `nimblescape` uses one name,
`nimblescape-<name>`, for the repository, the package and the extension:

| What | Form | This extension |
| --- | --- | --- |
| Repository | `nimblescape/nimblescape-<name>` | `nimblescape/nimblescape-typescript` |
| `name` in `package.json` | `nimblescape-<name>` | `nimblescape-typescript` |
| Extension ID | `nimblescape.nimblescape-<name>` | `nimblescape.nimblescape-typescript` |
| Package file | `nimblescape-<name>-<version>.vsix` | `nimblescape-typescript-<version>.vsix` |
| Display name | `nimblescape <Title>` | `nimblescape TypeScript` |

The prefix keeps the name apart from the names of other publishers, because
the Marketplace accepts a `name` only once. The Marketplace cannot rename an
extension ID: another `name` publishes a new extension, and the old one stays
with its installations. An extension that is no longer wanted is unpublished
(More Actions > Unpublish; this can be undone), never removed: the Marketplace
keeps the `name` of a removed extension reserved permanently, also for its own
publisher.

## Release

A released version is a tag `v<version>` whose `<version>` equals the version
in `package.json`. The workflow "Release" creates the version, its tag, its
GitHub release and its Marketplace version in one run. To release a version,
follow these steps:

1. Optional: add a section `## <version>` to `CHANGELOG.md` on `main`. The section describes the changes for the users (see [Release rules](#release-rules)).
2. In the tab "Actions", choose the workflow "Release", then "Run workflow" on the branch `main`. Enter the version, for example `0.1.7`. When `CHANGELOG.md` has no section for the version, enter its notes too: they become the section. The GitHub website starts a workflow also in the browser of a phone.

The run has four jobs:

1. "Version commit" checks that the run starts from `main`, that the version has the form `<major>.<minor>.<patch>`, that it is not lower than the version in `package.json` and that its tag does not exist, and, in a release, that a dry run tested the files of the release process with `scripts/release-checks.mjs dry-run` (rule 4 of the [release rules](#release-rules)). It sets the version in `package.json` and `package-lock.json`, adds the section of the notes to `CHANGELOG.md` when the file has none, commits the change as "Release `<version>`" and pushes it to the temporary branch `release/run-<run ID>`, not to `main`. When `main` holds the version and its section already, it commits nothing. It also deletes the temporary branches of earlier runs that failed.
2. "CI" runs the workflow `ci.yml` for the commit of the version, because a push with the token of a workflow starts no other workflow. The VSIX that this job tests and builds is the VSIX of the release, so the release repeats no test and no build.
3. "Main, tag and GitHub release" runs only when CI passed. It moves `main` to the commit of the version as a fast-forward and deletes the temporary branch. When `main` changed during the run, it stops before the tag. Then it creates the tag `v<version>` on the commit and the release of the tag with the GitHub CLI `gh`. The section of the version in `CHANGELOG.md` becomes the notes, and the VSIX becomes the file of the release. A release that exists keeps its notes and receives the VSIX only when it holds none.
4. "Publish to the Visual Studio Marketplace" downloads the VSIX of the GitHub release, signs in to Microsoft Entra ID with the official [`azure/login`](https://github.com/Azure/login) action and publishes the VSIX with `vsce publish --azure-credential`.

`main` receives the version commit only after CI passed. When CI fails,
`main`, the tags, the releases and the Marketplace stay unchanged, and the
version can still be released: fix the cause on `main` and start the release
of the same version again. The jobs move and push with the token of the
workflow, so a rule of `main` that blocks direct pushes stops the release.

A dry run tests a release without a change: choose "Dry run" when you start
the workflow. The run makes the version commit on its temporary branch, runs
CI for it and deletes the branch; it changes neither `main`, a tag, a release
nor the Marketplace. Its run name ends with "(dry run)". A dry run may start
from another branch than `main`, so it also tests a change of `release.yml` on
that branch before the change reaches `main`.

When a job fails, remove the cause and choose "Re-run failed jobs" on the
run. A re-run keeps the tag and the VSIX that the GitHub release already
holds, and the Marketplace skips a version that it already holds, so a re-run
never publishes a version twice. When the publish job fails, for example
because the Marketplace refuses the package, the tag and the GitHub release
stay, and the re-run publishes the VSIX of the GitHub release. GitHub allows a
re-run only within 30 days of the run; after that, only a new version can
reach the Marketplace. A new run deletes the temporary branch of a failed run,
so a failed run can no longer be re-run after a new run started.

The Marketplace refuses a package with more than 30 tags, with the error "You
exceeded the number of allowed tags of 30", which the Microsoft publishing
guide names. The tags are the keywords of `package.json` and the tags that
vsce adds, for example the language of each `onLanguage` event in
`activationEvents`; the element `<Tags>` of `extension.vsixmanifest` in the
VSIX lists them. No job counts them before the tag.

The workflows `release.yml`, `release-dry-run.yml` and
`marketplace-identity.yml`, the script `scripts/release-checks.mjs` with its
test `scripts/release-checks.test.mjs`, and this section are the same in every
extension repository of nimblescape. A change to them goes into every
repository.

### Release rules

Every extension of nimblescape follows these rules. Only rule 4 has a check
in the workflows, `scripts/release-checks.mjs dry-run`; everyone follows the
other rules without a check.

1. **The ID never changes.** An extension keeps its ID `nimblescape.nimblescape-<name>` (see [Naming](#naming)), and nimblescape never publishes an extension under a new ID.
2. **No deletion.** nimblescape never deletes an extension. No workflow, npm script or file of `scripts/` runs `vsce unpublish`, which deletes the extension on the Marketplace, or `vsce delete-publisher`, which deletes the publisher with all its extensions. On the publisher management page, nobody uses More Actions > Remove, which deletes the extension and keeps its name reserved permanently, or "Delete this version" (More Actions > Reports, tab Manage), after which the number of the version can never be used again. An extension that is no longer wanted is unpublished on the publisher management page, as [Naming](#naming) describes.
3. **Only changes for the users, at most one version in 7 days.** A version is published only when it changes something for the users, its section in `CHANGELOG.md` describes that change, and at least 7 days passed since the newest release; an urgent fix may come earlier. A change for the users changes the extension that VS Code runs: its code (`src/`, which the build bundles into `dist/`), another file of the package that is not a document, for example the icon of a view, or a field of `package.json` that changes how the extension works, for example `contributes`. A change only of the documents (for example the README), the Marketplace icon, the tests or the build tools (for example `esbuild.mjs`, `tsconfig.json` or a file of `scripts/`) does not count: it reaches the users with the next version that changes the extension. Images that only the README shows do not belong in the package: the README links them with full `https://github.com/…` links (see [Manifest](#manifest)). The section of the version in `CHANGELOG.md` does not say "maintenance release", "behaves as in" followed by a version, or a phrase of that kind.
4. **Dry run first.** A change of the release process is tested with a dry run before it reaches `main`. The files of the release process are `release.yml`, `ci.yml`, whose VSIX the release publishes, and `scripts/release-checks.mjs`. The workflow "Release dry run" runs on every pull request. When the pull request changes one of these files, also in an update by Dependabot, the check `dry-run` fails until a successful dry run, or the newest release, had these files as they are at the head of the pull request. Start the workflow "Release" on the branch of the pull request with "Dry run" and a version without a tag (with notes when `CHANGELOG.md` has no section for the version), then re-run the job "release dry run" of the pull request. A pull request from a fork cannot meet the rule, because the dry run needs a branch of this repository. The job "Version commit" of a release runs the check `dry-run` again, so a change that reached `main` without a dry run stops the release until a dry run tested it. Do not make "release dry run" a required check of `main`: the release moves `main` to its version commit, which has no result of the check.
5. **Only GitHub Actions with Microsoft Entra ID.** Only the job "Publish to the Visual Studio Marketplace" publishes, signed in with the app registration of [Marketplace setup](#marketplace-setup). No personal access token exists for the publisher. No other workflow, npm script or file of `scripts/` runs `vsce publish` or `vsce login`. Nobody uploads a VSIX on the publisher management page or runs `vsce publish`, `unpublish`, `delete-publisher` or `login` on a computer.

## Marketplace setup

The workflow publishes with a Microsoft Entra ID token, as the
[Microsoft publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace)
recommends. It uses no personal access token, because Azure DevOps retires
the global personal access tokens that the Marketplace needs on
1 December 2026. The publishing identity is an app registration with a
federated credential for each repository: GitHub Actions proves the identity
of the job with an OpenID Connect token, so no secret is stored. An app
registration needs no Azure subscription. One app registration publishes
every extension of the publisher `nimblescape`, because the Marketplace
grants the role of a member for the whole publisher.

### What exists

| Part | Where | Value |
| --- | --- | --- |
| Publisher | [Marketplace publisher management](https://marketplace.visualstudio.com/manage) | `nimblescape`, the `publisher` in `package.json` |
| App registration | [Microsoft Entra admin center](https://entra.microsoft.com), "App registrations" | `vscode-marketplace-publisher`, a member of the publisher `nimblescape` with the role "Contributor" |
| Organization variables | GitHub organization `nimblescape`, "Secrets and variables", "Actions", "Variables" | `AZURE_CLIENT_ID` (the application ID of the app) and `AZURE_TENANT_ID` (its directory ID); identifiers, not secrets |
| Federated credential | the app, "Certificates & secrets", "Federated credentials" | one for each repository, named after it |
| Environment | the settings of each repository, "Environments" | `marketplace`, reachable from the tags `v*` and the branch `main` only |

### Setup of a repository

A new extension repository needs its federated credential and its
environment. The script `scripts/marketplace-setup.sh` sets both up for the
GitHub repository of the remote `origin` of the clone, whose name must be the
`name` of `package.json`; it needs the Azure CLI, the GitHub CLI and Node.js,
the two CLIs signed in with an account that may change the app registration
and the settings of the repository. It shows what it sets up and
asks before it changes anything. It changes nothing that already exists, so it
can run again:

```sh
az login --allow-no-subscriptions
gh auth login
scripts/marketplace-setup.sh
```

Then run the workflow "Marketplace identity" in the tab "Actions" of the
repository: it signs in like the publish job and prints the member ID of the
app, which shows that the setup works.

The script gives the credential these values. For this repository:

| Field of the federated credential | Value |
| --- | --- |
| Issuer | `https://token.actions.githubusercontent.com` |
| Subject | `repo:nimblescape@156021698/nimblescape-typescript@1432397337:environment:marketplace` |
| Audience | `api://AzureADTokenExchange` |

GitHub puts the owner ID and the repository ID into the subject of every
repository created after 15 July 2026, so a new owner of a reused name gets no
token. The subject also holds the name of the repository: after a rename of
the repository, run the script again and delete the credential of the old
name. One app accepts at most 20 federated credentials.

### Setup from scratch

Only when the publisher, the app or the variables are lost:

1. Create the publisher `nimblescape` on the publisher management page, signed in with the Microsoft account of nimblescape e.U.
2. Register the app `vscode-marketplace-publisher` in the Entra admin center: "New registration", "Single tenant", no API permission, no secret.
3. Set the organization variables `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` to the application ID and the directory ID of the app. Organization variables reach private repositories only on a paid GitHub plan.
4. Set up a repository with the script, and run its workflow "Marketplace identity".
5. On the publisher management page, open the publisher `nimblescape`, then "Members", and add the member ID that the workflow printed with the role "Contributor".

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) · [MIT License](LICENSE).

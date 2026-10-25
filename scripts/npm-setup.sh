#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# © 2026 Hannes Stauss (scalarion@nimblescape.com)
# Licensed under the MIT License. See LICENSE in the repository root for details.

# The npmjs.com setup of the npm package @nimblescape/typescript of cli/ (CONTRIBUTING.md, "npmjs.com setup"):
# the GitHub environment `npm` with its deployment rules, the first version of the package, and the trusted publisher
# of the package, which lets the job publish-npm of the release workflow publish without a token. npmjs.com sets up a
# trusted publisher only for a package that exists, so the first version is published once by hand, from the GitHub
# release of that version. Run it in the clone, on a computer where the GitHub CLI (`gh`) and npm 11.15.0 or newer
# are signed in, with an npm account that may publish in the organization nimblescape and has two-factor
# authentication:
#
#   gh auth login
#   npm login
#   scripts/npm-setup.sh            before the first release: the environment only
#   scripts/npm-setup.sh 0.2.0      after the release 0.2.0: its npm package and the trusted publisher
#
# After the second call, re-run the failed job "Publish to npmjs.com" of the release run: it finds the version on
# npmjs.com and ends without a change. The script shows what it sets up and asks before it changes anything. It
# changes nothing that already exists, so it can run again; it shows the trusted publishers and asks whether to add
# the trusted publisher, because npm lists them only after the second factor, in the terminal.
set -euo pipefail

for tool in gh git node npm; do
  command -v "$tool" >/dev/null || { echo "$tool is not installed." >&2; exit 1; }
done

version="${1:-}"
version="${version#v}"
if [ -n "$version" ] && ! [[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "The version $1 does not have the form <major>.<minor>.<patch>." >&2
  exit 1
fi

# npm trust needs npm 11.15.0 or newer.
node -e '
  const [major, minor] = process.argv[1].split(".").map(Number);
  if (major < 11 || (major === 11 && minor < 15)) {
    console.error(`npm ${process.argv[1]} has no npm trust; install npm 11.15.0 or newer: npm install --global npm@11`);
    process.exit(1);
  }
' "$(npm --version)"

# owner/repository from the URL of `origin`: https://github.com/<owner>/<repository>(.git) or
# git@github.com:<owner>/<repository>(.git).
url=$(git -C "$(dirname "$0")" remote get-url origin)
repo="${url#*github.com[:/]}"
repo="${repo%/}"
repo="${repo%.git}"
[[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "The remote origin ($url) is no GitHub repository." >&2; exit 1; }
root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
package=$(node -p 'require(process.argv[1]).name' "$root/cli/package.json")
environment="npm"
workflow="release.yml"
account=$(npm whoami 2>/dev/null) || { echo "npm is not signed in: run npm login." >&2; exit 1; }

exists=no
npm view "$package" name >/dev/null 2>&1 && exists=yes
if [ "$exists" = no ] && [ -z "$version" ]; then
  first="none yet: run the script again with the version of the first release"
elif [ "$exists" = no ]; then
  first="$version, from the GitHub release v$version"
else
  first="none, npmjs.com holds the package"
fi

cat <<TEXT
Package:           $package
Repository:        $repo
npm account:       $account
Environment:       $environment (tags v*, branch main)
First version:     $first
Trusted publisher: GitHub Actions, $repo, workflow $workflow, environment $environment
TEXT
read -r -p "Set up the npm publishing of $package? [y/N] " answer || true
[[ "$answer" =~ ^[Yy]$ ]] || { echo "Nothing changed."; exit 1; }

# The environment, which only the tags v* and the branch main reach, as the environment marketplace.
gh api --method PUT "repos/$repo/environments/$environment" --input - >/dev/null <<JSON
{"deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
JSON
existing=$(gh api "repos/$repo/environments/$environment/deployment-branch-policies" --jq '[.branch_policies[] | "\(.type):\(.name)"] | join(" ")')
for rule in "tag:v*" "branch:main"; do
  case " $existing " in
    *" $rule "*) echo "Deployment rule exists: $rule" ;;
    *)
      gh api --method POST "repos/$repo/environments/$environment/deployment-branch-policies" \
        -f type="${rule%%:*}" -f name="${rule#*:}" >/dev/null
      echo "Deployment rule added: $rule" ;;
  esac
done

if [ "$exists" = no ]; then
  if [ -z "$version" ]; then
    echo "Done for now. After the first release, run: scripts/npm-setup.sh <version>"
    exit 0
  fi
  # The tarball that CI built and the release holds, as npm pack names it: @scope/name gives scope-name-<version>.tgz.
  tarball="$(echo "${package#@}" | tr / -)-$version.tgz"
  folder=$(mktemp -d)
  trap 'rm -rf "$folder"' EXIT
  gh release download "v$version" --repo "$repo" --pattern "$tarball" --dir "$folder"
  # npm asks for the second factor of the account.
  npm publish "$folder/$tarball" --access public
  echo "Published: $package $version"
fi

# npm asks for the second factor of a trust command only in a terminal: when the script read the list through a
# pipe, npm would end with the error EOTP instead. So the list goes to the terminal, and you decide.
echo "Trusted publishers of $package on npmjs.com:"
npm trust list "$package"
read -r -p "Add the trusted publisher GitHub Actions, $repo, workflow $workflow, environment $environment? Answer N when the list above shows it. [y/N] " answer || true
if [[ "$answer" =~ ^[Yy]$ ]]; then
  npm trust github "$package" --file "$workflow" --repository "$repo" --environment "$environment" --allow-publish --yes
  echo "Trusted publisher added: $repo, $workflow, $environment"
else
  echo "Trusted publisher unchanged."
fi

echo "Done. Re-run the failed job \"Publish to npmjs.com\" of the release run, if there is one."

#!/usr/bin/env bash
# Tag the deployed commit and push only that tag. The token stays in the
# environment: the credential helper reads it inside git, so it never appears
# in a URL, in .git/config, or on any command line.
set -euo pipefail

test -n "${RELEASE_TAG:-}"
test -n "${GITHUB_TOKEN:-}"
GITHUB_SERVER_URL="${GITHUB_SERVER_URL:-https://github.com}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
remote="$GITHUB_SERVER_URL/$GITHUB_REPOSITORY.git"

git -c user.name="Mark Nyon" -c user.email="mnyon-grandkru@users.noreply.github.com" \
  tag "$RELEASE_TAG"
# shellcheck disable=SC2016 # expanded by the helper's shell, not here
git -c credential.helper= \
  -c 'credential.helper=!f() { test "$1" = get || exit 0; echo username=x-access-token; echo "password=$GITHUB_TOKEN"; }; f' \
  push "$remote" "refs/tags/$RELEASE_TAG"
echo "Pushed release tag $RELEASE_TAG."

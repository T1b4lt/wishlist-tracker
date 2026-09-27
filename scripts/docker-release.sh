#!/usr/bin/env bash
# Build the Docker image and publish it to Docker Hub, tagged with a version
# and as `latest` (so `latest` always points to the most recent release).
#
# Usage (from the repository root):
#   just docker-release            # version = short git commit hash
#   just docker-release 1.2.0      # version = 1.2.0
#
# Environment variables:
#   DOCKERHUB_USERNAME  (required) Docker Hub account that owns the repository.
#   DOCKERHUB_TOKEN     (required) Docker Hub personal access token with
#                       Read & Write scope, used to log in before pushing.
#   DOCKERHUB_REPO      (optional) Repository name, defaults to
#                       "$DOCKERHUB_USERNAME/wishlist-tracker".
#   DOCKER_PLATFORMS    (optional) Target platforms, defaults to "linux/amd64"
#                       (e.g. "linux/amd64,linux/arm64" for a multi-arch image).
#   ALLOW_DIRTY=1       (optional) Release even with uncommitted changes.

set -euo pipefail

cd "$(dirname "$0")/.."

die() {
    echo "Error: $*" >&2
    exit 1
}

command -v docker >/dev/null || die "docker is not installed."
docker buildx version >/dev/null 2>&1 || die "docker buildx is not available."

# Fail fast, before building anything, if the credentials are not set.
missing=()
[[ -n "${DOCKERHUB_USERNAME:-}" ]] || missing+=("DOCKERHUB_USERNAME")
[[ -n "${DOCKERHUB_TOKEN:-}" ]] || missing+=("DOCKERHUB_TOKEN")
if ((${#missing[@]})); then
    die "missing required environment variable(s): ${missing[*]}."
fi

repo="${DOCKERHUB_REPO:-$DOCKERHUB_USERNAME/wishlist-tracker}"
platforms="${DOCKER_PLATFORMS:-linux/amd64}"

# The image must match a commit, so refuse to release uncommitted changes.
if [[ -n "$(git status --porcelain)" && "${ALLOW_DIRTY:-0}" != "1" ]]; then
    die "the working tree has uncommitted changes (commit them or set ALLOW_DIRTY=1)."
fi

revision="$(git rev-parse HEAD)"
version="${1:-$(git rev-parse --short HEAD)}"
[[ "$version" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || die "invalid tag '$version'."
[[ "$version" != "latest" ]] || die "pass a version, 'latest' is added automatically."

echo "Logging in to Docker Hub as $DOCKERHUB_USERNAME..."
printf '%s' "$DOCKERHUB_TOKEN" | docker login --username "$DOCKERHUB_USERNAME" --password-stdin

echo "Building and pushing $repo:$version and $repo:latest ($platforms)..."
docker buildx build \
    --platform "$platforms" \
    --tag "$repo:$version" \
    --tag "$repo:latest" \
    --label "org.opencontainers.image.version=$version" \
    --label "org.opencontainers.image.revision=$revision" \
    --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --push \
    .

echo "Published $repo:$version and $repo:latest"

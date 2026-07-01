#!/usr/bin/env bash
# Downloads the Linux scanner binaries into ./bin (they're gitignored, so they
# must be fetched at build time on the host). Idempotent.
set -euo pipefail

GITLEAKS_VERSION="${GITLEAKS_VERSION:-8.30.1}"
OSV_VERSION="${OSV_VERSION:-2.4.0}"

mkdir -p bin

if [ ! -x bin/gitleaks ]; then
  echo "Downloading gitleaks ${GITLEAKS_VERSION}…"
  curl -fsSL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
    | tar -xz -C bin gitleaks
  chmod +x bin/gitleaks
fi

if [ ! -x bin/osv-scanner ]; then
  echo "Downloading osv-scanner ${OSV_VERSION}…"
  curl -fsSL -o bin/osv-scanner \
    "https://github.com/google/osv-scanner/releases/download/v${OSV_VERSION}/osv-scanner_linux_amd64"
  chmod +x bin/osv-scanner
fi

echo "Scanners ready in ./bin"

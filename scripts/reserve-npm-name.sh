#!/usr/bin/env bash
# Publish a placeholder `passmint` package to NPM to reserve the name.
# The real package is still in development — this ships an empty stub at
# version 0.0.0-reserve.0 so no one else can claim the name.
set -euo pipefail

PKG_NAME="passmint"
PKG_VERSION="0.0.0-reserve.0"

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

cat > "$STAGE_DIR/package.json" <<EOF
{
  "name": "$PKG_NAME",
  "version": "$PKG_VERSION",
  "description": "Name reserved — real package coming soon.",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/passmint/passmint-pkg.git"
  },
  "publishConfig": {
    "access": "public"
  }
}
EOF

cat > "$STAGE_DIR/README.md" <<'EOF'
# passmint

Name reserved. The real package is in development and will ship soon.
EOF

cat > "$STAGE_DIR/index.js" <<'EOF'
throw new Error("passmint: this version is a name placeholder. The real package has not been published yet.");
EOF

echo "Staged placeholder at: $STAGE_DIR"
echo
echo "About to publish:"
echo "  $PKG_NAME@$PKG_VERSION"
echo
echo "Dry run:"
( cd "$STAGE_DIR" && npm publish --dry-run --access public --tag reserve )
echo
read -r -p "Publish for real? [y/N] " confirm
if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
  ( cd "$STAGE_DIR" && npm publish --access public --tag reserve )
  echo "Published $PKG_NAME@$PKG_VERSION"
else
  echo "Aborted."
fi

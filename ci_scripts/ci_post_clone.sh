#!/bin/sh
#
# Xcode Cloud post-clone hook.
#
# Runs right after Xcode Cloud clones the repo, before any xcodebuild
# step. Without this script, the iOS build fails because:
#
#   1. `node_modules/` is gitignored, so the Swift packages our local
#      `ios/App/CapApp-SPM/Package.swift` references aren't on disk.
#   2. The web bundle in `dist/` doesn't exist (cap sync needs it).
#   3. Our `fix-spm-conflict.mjs` symlinks + Package.swift patches need
#      to be applied AFTER cap sync regenerates the SPM manifest.
#
# Apple's CI runners give us $CI_PRIMARY_REPOSITORY_PATH (the repo root)
# and run this script from $CI_WORKSPACE/ci_scripts — `cd` to the repo
# root so every relative path matches a local dev environment.

set -e

cd "$CI_PRIMARY_REPOSITORY_PATH"

echo "--- Installing Node via Homebrew ---"
# Homebrew is preinstalled on Xcode Cloud images. `brew install node`
# pulls the current LTS, which our build tooling supports.
brew install node

echo "--- Installing JS dependencies (npm ci) ---"
# npm ci is faster + deterministic vs npm install. The package.json
# `postinstall` hook will run scripts/fix-spm-conflict.mjs after the
# install completes — that creates the capfb-* symlinks and patches
# the @capacitor-community/contacts SemVer range so the SPM graph
# resolves on Capacitor 8.
npm ci

echo "--- Building web bundle (vite) ---"
# Compiles src/ into dist/. Reads VITE_API_URL from the Xcode Cloud
# environment variables — set it to https://api.wud.app (or your
# Render URL) under the workflow's Environment tab. Falls back to
# localhost:4000 if unset, which won't work in production.
npm run build

echo "--- Syncing Capacitor (cap sync ios) ---"
# Copies dist/ into the iOS shell + regenerates
# ios/App/CapApp-SPM/Package.swift with the canonical plugin paths.
# This step strips our patch, so we re-apply it below.
npx cap sync ios

echo "--- Re-applying SPM identity-collision patch ---"
# Re-runs the fix because cap sync just overwrote Package.swift.
# Without this, the SPM graph fails to resolve due to the duplicate
# "app" identity between @capacitor/app and @capacitor-firebase/app.
node scripts/fix-spm-conflict.mjs

echo "--- ci_post_clone.sh complete ---"

#!/usr/bin/env node
/**
 * Works around a Swift Package Manager identity collision that breaks iOS
 * builds when @capacitor/app and @capacitor-firebase/app are both used:
 *
 *   "Conflicting identity for app: dependency '.../@capacitor/app' and
 *    dependency '.../@capacitor-firebase/app' both point to the same
 *    package identity 'app'."
 *
 * SPM derives a local package's identity from the last path segment, ignoring
 * the `name:` parameter we pass. Both directories end in `/app`, so SPM treats
 * them as the same package and refuses to resolve.
 *
 * The fix:
 *   1. Create symlinks node_modules/capfb-{app,messaging} → the real plugin
 *      dirs, giving them paths whose last segment is unique.
 *   2. Rewrite ios/App/CapApp-SPM/Package.swift to point at the symlinks
 *      instead of the canonical paths.
 *
 * Must run after every `cap sync` because Capacitor regenerates Package.swift.
 * Wired into the npm `cap:sync` script.
 */
import { existsSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeModules = resolve(repoRoot, 'node_modules');
const packageSwift = resolve(repoRoot, 'ios/App/CapApp-SPM/Package.swift');

const ALIASES = [
  { alias: 'capfb-app',       target: '@capacitor-firebase/app' },
  { alias: 'capfb-messaging', target: '@capacitor-firebase/messaging' },
];

/* --- symlinks --- */
for (const { alias, target } of ALIASES) {
  const link = resolve(nodeModules, alias);
  const sourceExists = existsSync(resolve(nodeModules, target));
  if (!sourceExists) continue; // plugin not installed yet, skip
  // Remove any stale link/file first so we can write the canonical symlink.
  if (existsSync(link)) unlinkSync(link);
  symlinkSync(target, link, 'dir');
  console.log(`[spm-fix] symlinked node_modules/${alias} → ${target}`);
}

/* --- patch Package.swift --- */
if (!existsSync(packageSwift)) {
  console.log('[spm-fix] Package.swift not found — skipping patch');
  process.exit(0);
}

let contents = readFileSync(packageSwift, 'utf8');
let changed = false;
for (const { alias, target } of ALIASES) {
  const before = `node_modules/${target}`;
  const after = `node_modules/${alias}`;
  if (contents.includes(before)) {
    contents = contents.replaceAll(before, after);
    changed = true;
    console.log(`[spm-fix] patched Package.swift: ${target} → ${alias}`);
  }
}
if (changed) writeFileSync(packageSwift, contents);
else        console.log('[spm-fix] Package.swift already patched');

#!/usr/bin/env node
/**
 * Two iOS / Swift Package Manager workarounds, both re-applied on every
 * `npm install` (via postinstall) and every `cap sync` (via the cap:sync
 * script). Idempotent — safe to run repeatedly.
 *
 * === 1. SPM identity collision ===
 *
 *   "Conflicting identity for app: dependency '.../@capacitor/app' and
 *    dependency '.../@capacitor-firebase/app' both point to the same
 *    package identity 'app'."
 *
 * SPM derives a local package's identity from the last path segment, ignoring
 * the `name:` parameter we pass. Both directories end in `/app`, so SPM treats
 * them as the same package and refuses to resolve. We create symlinks with
 * unique trailing segments and rewrite our local Package.swift to use them.
 *
 * === 2. @capacitor-community/contacts SemVer range ===
 *
 *   "Dependencies could not be resolved because 'contacts' depends on
 *    'capacitor-swift-pm' 7.0.0..<8.0.0 and 'status-bar' depends on
 *    'capacitor-swift-pm' 8.0.0..<9.0.0."
 *
 * The plugin's Package.swift pins capacitor-swift-pm to `from: "7.0.0"` (which
 * SPM reads as `>=7.0.0 <8.0.0`). The plugin's Swift code itself uses only
 * the stable CAPPlugin / CAPBridgedPlugin / CAPPluginCall surface, which is
 * binary-compatible across Capacitor 7 → 8 — so widening the constraint to
 * `7.0.0..<9.0.0` is safe and lets SPM pick the same 8.x version every other
 * plugin demands. Remove this patch once the plugin ships a Capacitor 8 build.
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

/* --- symlinks (identity collision fix) --- */
for (const { alias, target } of ALIASES) {
  const link = resolve(nodeModules, alias);
  const sourceExists = existsSync(resolve(nodeModules, target));
  if (!sourceExists) continue; // plugin not installed yet, skip
  // Remove any stale link/file first so we can write the canonical symlink.
  if (existsSync(link)) unlinkSync(link);
  symlinkSync(target, link, 'dir');
  console.log(`[spm-fix] symlinked node_modules/${alias} → ${target}`);
}

/* --- patch our local Package.swift to point at the symlinks --- */
if (existsSync(packageSwift)) {
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
} else {
  console.log('[spm-fix] Package.swift not found — skipping');
}

/* --- widen @capacitor-community/contacts Package.swift SemVer range --- */
const contactsPackageSwift = resolve(
  nodeModules, '@capacitor-community/contacts/Package.swift',
);
if (existsSync(contactsPackageSwift)) {
  const before = '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0")';
  const after  = '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", "7.0.0"..<"9.0.0")';
  let contents = readFileSync(contactsPackageSwift, 'utf8');
  if (contents.includes(before)) {
    contents = contents.replace(before, after);
    writeFileSync(contactsPackageSwift, contents);
    console.log('[spm-fix] widened contacts SemVer range to 7.0.0..<9.0.0');
  } else if (contents.includes('"7.0.0"..<"9.0.0"')) {
    console.log('[spm-fix] contacts Package.swift already patched');
  } else {
    // Plugin upgraded — log so we notice the patch is stale instead of
    // silently failing. The patch may need updating to match the new pin.
    console.warn('[spm-fix] contacts Package.swift pin did not match expected text — review the patch');
  }
} else {
  console.log('[spm-fix] @capacitor-community/contacts not installed — skipping');
}

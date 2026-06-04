#!/usr/bin/env node
/**
 * Inject local Capacitor plugin class names into the synced
 * `ios/App/App/capacitor.config.json` so Capacitor's bridge auto-discovers
 * them at runtime.
 *
 * Background: Capacitor's iOS bridge enumerates plugins from
 * `packageClassList` and resolves each by `NSClassFromString`. `cap sync`
 * populates that list from npm-installed plugin packages — but ignores
 * plugins defined directly in the App target. Subclassing
 * `CAPBridgeViewController` + calling `registerPluginInstance` works in
 * principle but depends on Interface Builder resolving the
 * `customClass` / `customModule` attributes correctly, which has been
 * flaky across Xcode versions and clean checkouts.
 *
 * Direct list injection is the most reliable path: the class is
 * registered with the Obj-C runtime by `@objc(ClassName)`, so once we
 * add the name to packageClassList Capacitor finds it the same way it
 * finds every npm plugin.
 *
 * Runs after `cap sync` (see package.json's `cap:sync` script). The
 * synced config is gitignored, so this runs on every machine.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, '..', 'ios', 'App', 'App', 'capacitor.config.json');

// One entry per local plugin we maintain in the App target.
const LOCAL_PLUGIN_CLASSES = ['SavePhotoPlugin', 'AddToCalendarPlugin'];

if (!existsSync(configPath)) {
  console.log('[register-local-plugins] no synced ios config found, skipping');
  process.exit(0);
}

const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
const list = Array.isArray(cfg.packageClassList) ? cfg.packageClassList : [];

let added = 0;
for (const name of LOCAL_PLUGIN_CLASSES) {
  if (!list.includes(name)) {
    list.push(name);
    added++;
  }
}

if (added === 0) {
  console.log('[register-local-plugins] all local plugins already in packageClassList');
  process.exit(0);
}

cfg.packageClassList = list;
writeFileSync(configPath, JSON.stringify(cfg, null, '\t') + '\n');
console.log(`[register-local-plugins] injected ${added} local plugin(s) into packageClassList`);

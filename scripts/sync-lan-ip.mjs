#!/usr/bin/env node
/**
 * Auto-syncs VITE_API_URL in .env.production with the Mac's current LAN IP
 * so the iOS Simulator + physical phones can reach the dev backend across
 * Wi-Fi changes (cafe, home, hotspot) without manual edits.
 *
 * Runs as the first step of `npm run cap:sync` (and therefore cap:ios /
 * cap:android too), before vite build — so the new URL gets baked into the
 * web bundle that ships to the device.
 *
 * Safe by design: only overwrites the URL if it already looks like a
 * LAN/localhost address. A real HTTPS prod URL is left alone — so the same
 * cap:sync flow works for release builds without trampling production.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = resolve(ROOT, '.env.production');
const PORT = 4000; // matches server/src/config.ts default

/** True if a URL points at a LAN / loopback host — safe to rewrite. */
const isLanUrl = (u) =>
  /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.|localhost)/i.test(u);

/** Try the usual Mac interface names in order, then fall back to scraping
 *  ifconfig for the first non-loopback IPv4 address. Returns null if nothing
 *  reasonable is found. */
function detectIp() {
  for (const iface of ['en0', 'en1', 'en2', 'en3']) {
    try {
      const ip = execSync(`ipconfig getifaddr ${iface}`, {
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString().trim();
      if (ip) return ip;
    } catch { /* iface inactive — try next */ }
  }
  try {
    const out = execSync('ifconfig', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const m = [...out.matchAll(/inet (\d+\.\d+\.\d+\.\d+)/g)]
      .map(x => x[1])
      .find(ip => !ip.startsWith('127.'));
    if (m) return m;
  } catch { /* fall through */ }
  return null;
}

if (!existsSync(ENV_FILE)) {
  console.log('[lan-ip] .env.production not found — skipping');
  process.exit(0);
}

const contents = readFileSync(ENV_FILE, 'utf8');
const match = contents.match(/^VITE_API_URL\s*=\s*(.+)$/m);
const current = match?.[1]?.trim() ?? '';

if (current && !isLanUrl(current)) {
  console.log(`[lan-ip] VITE_API_URL=${current} (non-LAN) — leaving as-is`);
  process.exit(0);
}

const ip = detectIp();
if (!ip) {
  console.warn('[lan-ip] Could not detect a LAN IP — leaving .env.production unchanged');
  process.exit(0);
}

const target = `http://${ip}:${PORT}`;
if (current === target) {
  console.log(`[lan-ip] already up to date (${target})`);
  process.exit(0);
}

const updated = match
  ? contents.replace(/^VITE_API_URL\s*=.*$/m, `VITE_API_URL=${target}`)
  : contents.trimEnd() + `\nVITE_API_URL=${target}\n`;

writeFileSync(ENV_FILE, updated);
console.log(`[lan-ip] VITE_API_URL → ${target}`);

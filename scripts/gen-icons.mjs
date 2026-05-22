/**
 * Rasterises the brand SVGs in assets/source/ into the PNG inputs that
 * `capacitor-assets generate` expects. Run via `npm run gen:icons`.
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'assets', 'source');
const outDir = join(root, 'assets');
mkdirSync(outDir, { recursive: true });

const jobs = [
  { svg: 'icon.svg',            png: 'icon-only.png',       size: 1024 },
  { svg: 'icon-foreground.svg', png: 'icon-foreground.png', size: 1024 },
  { svg: 'icon-background.svg', png: 'icon-background.png',  size: 1024 },
  { svg: 'splash.svg',          png: 'splash.png',          size: 2732 },
  { svg: 'splash.svg',          png: 'splash-dark.png',     size: 2732 },
];

for (const job of jobs) {
  const svg = readFileSync(join(srcDir, job.svg));
  // density 192 → 2× supersample, then downscale for crisp anti-aliasing.
  await sharp(svg, { density: 192 })
    .resize(job.size, job.size)
    .png()
    .toFile(join(outDir, job.png));
  console.log(`✓ assets/${job.png} (${job.size}×${job.size})`);
}

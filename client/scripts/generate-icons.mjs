// Generates the PWA icon set from a single brand SVG (baby bottle on BabyTrak pink).
// Run: node scripts/generate-icons.mjs  (writes PNGs into public/icons)
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

const PINK = '#d6457f';
const PINK_DARK = '#b6356a';

// Baby-bottle glyph drawn in a 512 box, centered. `scale` shrinks it toward the
// center so maskable icons keep the glyph inside the safe zone.
function svg({ bg = PINK, radius = 112, scale = 0.78 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="${bg}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <!-- cap / nipple -->
    <circle cx="256" cy="120" r="22" fill="#fff"/>
    <rect x="226" y="132" width="60" height="34" rx="10" fill="#fff"/>
    <!-- neck -->
    <polygon points="210,166 302,166 318,206 194,206" fill="#fff"/>
    <!-- body -->
    <rect x="186" y="206" width="140" height="226" rx="42" fill="#fff"/>
    <!-- measurement ticks (cut back to the background colour) -->
    <rect x="210" y="250" width="56" height="12" rx="6" fill="${bg}"/>
    <rect x="210" y="292" width="40" height="12" rx="6" fill="${bg}"/>
    <rect x="210" y="334" width="56" height="12" rx="6" fill="${bg}"/>
  </g>
</svg>`;
}

const targets = [
  { name: 'icon-192.png', size: 192, opts: { radius: 42, scale: 0.78 } },
  { name: 'icon-512.png', size: 512, opts: { radius: 112, scale: 0.78 } },
  { name: 'maskable-192.png', size: 192, opts: { radius: 0, scale: 0.62 } },
  { name: 'maskable-512.png', size: 512, opts: { radius: 0, scale: 0.62 } },
  // iOS rounds corners itself and dislikes transparency → full-bleed square.
  { name: 'apple-touch-icon.png', size: 180, opts: { radius: 0, scale: 0.72 } },
];

for (const t of targets) {
  await sharp(Buffer.from(svg(t.opts)))
    .resize(t.size, t.size)
    .png()
    .toFile(join(OUT, t.name));
  console.log('wrote', t.name);
}

// Favicon (small, rounded).
await sharp(Buffer.from(svg({ radius: 96, scale: 0.8 })))
  .resize(48, 48)
  .png()
  .toFile(join(__dirname, '..', 'public', 'favicon.png'));
console.log('wrote favicon.png');

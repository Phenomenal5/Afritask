// Renders the app icons in public/icons from the Afritask mark (same drawing as
// src/components/ui/Logo.tsx, with literal colours). Run after changing the mark:
//   node scripts/generate-icons.mjs
// The PNGs are committed, so builds don't depend on this script.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const FOREST = "#163C2F";
const LIME = "#E4EFB5";
const HARVEST = "#F3C863";

const iconsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// `padding` shrinks the mark inside a full-bleed forest square — "maskable" icons get cropped
// to a circle or squircle by the OS, so their artwork must stay inside the middle 80%.
const markSvg = ({ rounded, padding }) => {
  const inner = 32 - padding * 2;
  const scale = inner / 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${rounded ? 7 : 0}" fill="${FOREST}"/>
  <g transform="translate(${padding} ${padding}) scale(${scale})">
    <path d="M8 23c3.5 0 4.5-8 8.5-8S21 9 24 9" stroke="${LIME}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
    <circle cx="24" cy="9" r="3" fill="${HARVEST}"/>
    <circle cx="8" cy="23" r="1.8" fill="${LIME}"/>
  </g>
</svg>`;
};

const outputs = [
  { file: "icon-192.png", size: 192, svg: markSvg({ rounded: true, padding: 0 }) },
  { file: "icon-512.png", size: 512, svg: markSvg({ rounded: true, padding: 0 }) },
  { file: "maskable-512.png", size: 512, svg: markSvg({ rounded: false, padding: 5 }) },
  // iOS adds its own rounded corners and ignores transparency.
  { file: "apple-touch-icon.png", size: 180, svg: markSvg({ rounded: false, padding: 3 }) },
];

await mkdir(iconsDir, { recursive: true });
await writeFile(path.join(iconsDir, "icon.svg"), markSvg({ rounded: true, padding: 0 }));
for (const output of outputs) {
  await sharp(Buffer.from(output.svg)).resize(output.size, output.size).png().toFile(path.join(iconsDir, output.file));
  console.log(`wrote public/icons/${output.file}`);
}

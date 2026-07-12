// Rasterize the Beam mark (same design as src/app/icon.svg / logo.tsx)
// into the PWA icon set. Run: npm run icons
import sharp from "sharp";
import fs from "node:fs";

const MARK = fs.readFileSync(new URL("../src/app/icon.svg", import.meta.url));

// Maskable icons get cropped to a circle/squircle by the OS — keep the mark
// inside the 80% safe zone by padding it on a full-bleed lime background.
const MASKABLE = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#d8f878"/>
  <g transform="translate(76,76) scale(0.703)">
    <circle cx="150" cy="362" r="40" fill="#000000"/>
    <path d="M235 277 L369 143" stroke="#000000" stroke-width="46" stroke-linecap="round"/>
    <path d="M263 321 L385 277" stroke="#000000" stroke-width="46" stroke-linecap="round"/>
    <path d="M191 249 L236 127" stroke="#000000" stroke-width="46" stroke-linecap="round"/>
  </g>
</svg>`);

const jobs = [
  { src: MARK, size: 192, out: "public/icon-192.png" },
  { src: MARK, size: 512, out: "public/icon-512.png" },
  { src: MASKABLE, size: 512, out: "public/icon-maskable-512.png" },
  { src: MARK, size: 180, out: "public/apple-touch-icon.png" },
];

for (const { src, size, out } of jobs) {
  await sharp(src).resize(size, size).png().toFile(out);
  console.log(`✓ ${out} (${size}x${size})`);
}

// favicon.ico — an ICO container with PNG-encoded entries (valid since
// Vista; all modern browsers). Next serves src/app/favicon.ico as-is.
const FAVICON_SIZES = [16, 32, 48];
const pngs = await Promise.all(
  FAVICON_SIZES.map((s) => sharp(MARK).resize(s, s).png().toBuffer())
);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(pngs.length, 4);

const entries = [];
let offset = 6 + 16 * pngs.length;
pngs.forEach((png, i) => {
  const e = Buffer.alloc(16);
  const s = FAVICON_SIZES[i];
  e.writeUInt8(s === 256 ? 0 : s, 0); // width
  e.writeUInt8(s === 256 ? 0 : s, 1); // height
  e.writeUInt8(0, 2); // palette
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // planes
  e.writeUInt16LE(32, 6); // bpp
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  entries.push(e);
});

fs.writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...entries, ...pngs]));
console.log(`✓ src/app/favicon.ico (${FAVICON_SIZES.join("/")}px)`);

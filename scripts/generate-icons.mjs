// Renders the committed SVG sources into every raster the PWA needs.
// Run after changing the SVGs: node scripts/generate-icons.mjs
import sharp from "sharp";

const jobs = [
  ["public/icons/icon.svg", 192, "public/icons/icon-192.png"],
  ["public/icons/icon.svg", 512, "public/icons/icon-512.png"],
  ["public/icons/maskable.svg", 512, "public/icons/maskable-512.png"],
  ["public/icons/icon.svg", 512, "app/icon.png"],
  ["public/icons/icon.svg", 180, "app/apple-icon.png"],
];
for (const [src, size, dest] of jobs) {
  await sharp(src, { density: 300 }).resize(size, size).png().toFile(dest);
  console.log(dest);
}

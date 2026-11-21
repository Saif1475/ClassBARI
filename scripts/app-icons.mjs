// Makes the four Android app icons from the ClassBARI house logo: one colour and letter per app.
//   node scripts/app-icons.mjs   → public/apps/<app>-192.png, -512.png, -maskable.png
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const apps = { classbari: ["#006a60", ""], student: ["#006a60", "S"], teacher: ["#2f4fbf", "T"], institute: ["#6b2fb3", "I"], guardian: ["#b4470c", "G"] }; // same as src/lib/apps.ts
// full: square edge to edge (Android crops it), content kept inside the middle 80% "safe zone".
const svg = (color, letter, full) => {
  const k = full ? 0.8 : 1;
  const o = (64 - 64 * k) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" ${full ? "" : 'rx="18"'} fill="${color}"/>
  <g transform="translate(${o} ${o}) scale(${k})">
    <path d="M14 31l18-14 18 14M18 29v19h28V29" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="32" y="45" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="15" fill="#fff">${letter}</text>
  </g></svg>`;
};
mkdirSync("public/apps", { recursive: true });
for (const [name, [color, letter]] of Object.entries(apps)) {
  for (const size of [192, 512]) await sharp(Buffer.from(svg(color, letter, false))).resize(size, size).png().toFile(`public/apps/${name}-${size}.png`);
  await sharp(Buffer.from(svg(color, letter, true))).resize(512, 512).png().toFile(`public/apps/${name}-maskable.png`);
  // iPhone home screen: square, iOS rounds the corners itself.
  await sharp(Buffer.from(svg(color, letter, true))).resize(180, 180).flatten({ background: color }).png().toFile(`public/apps/${name}-ios.png`);
}
console.log("icons written to public/apps/");

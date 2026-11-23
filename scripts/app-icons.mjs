// Makes every app icon from the Instanton mark: a power-on ring ("instant on") with a particle jumping out of its
// gap (the quantum "instanton"). The main icon and Instanton Campus (teachers and institutes) have the power bar; the
// other apps have their letter in the ring instead.
//   node scripts/app-icons.mjs   → public/apps/<app>-192.png, -512.png, -maskable.png, -ios.png   (website and its installable apps)
//                                → public/icon-192.png, icon-512.png and src/app/icon.svg   (the website's own icon)
//                                → flutter/assets/icons/<app>.png, the Android launcher icons of the five Flutter apps
//                                  and the iPhone icon set
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const apps = { instanton: ["#006a60", ""], student: ["#006a60", "S"], teacher: ["#4d3fb9", ""], guardian: ["#b4470c", "G"] }; // same as src/lib/apps.ts
const mix = (a, b, t) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("");
// full: square edge to edge (Android and iOS crop it), content kept inside the middle 80% "safe zone".
// layer: the drawing alone on a clear background, small enough for Android to cut any shape around it (its "adaptive icon").
const svg = (color, letter, full, layer = false) => {
  const k = layer ? 0.66 : full ? 0.8 : 1; // 0.66: the drawing still fits the circle Android always keeps
  const o = (64 - 64 * k) / 2;
  const up = letter ? 3 * k : 0; // without the tall bar the drawing sits lower, so lift it to the middle
  const inner = letter
    ? `<text x="32" y="${letter.length > 1 ? 43 : 44}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="${letter.length > 1 ? 11 : 14}" fill="#fff">${letter}</text>`
    : `<path d="M32 21v16" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mix(color, "#ffffff", 0.12)}"/><stop offset="1" stop-color="${mix(color, "#0b1533", 0.45)}"/></linearGradient></defs>
  ${layer ? "" : `<rect width="64" height="64" ${full ? "" : 'rx="18"'} fill="url(#g)"/>`}
  <g transform="translate(${o} ${o - up}) scale(${k})">
    <path d="M41 28.3A14 14 0 1 1 23 28.3" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
    ${inner}
    <circle cx="32" cy="${letter ? 19 : 11.5}" r="3.4" fill="#fff"/>
  </g></svg>`;
};
const png = (s, size) => sharp(Buffer.from(s)).resize(size, size).png();

mkdirSync("public/apps", { recursive: true });
for (const [name, [color, letter]] of Object.entries(apps)) {
  for (const size of [192, 512]) await png(svg(color, letter, false), size).toFile(`public/apps/${name}-${size}.png`);
  await png(svg(color, letter, true), 512).toFile(`public/apps/${name}-maskable.png`);
  // iPhone home screen: square, iOS rounds the corners itself.
  await png(svg(color, letter, true), 180).flatten({ background: color }).toFile(`public/apps/${name}-ios.png`);
}
const [main] = apps.instanton;
for (const size of [192, 512]) await png(svg(main, "", false), size).toFile(`public/icon-${size}.png`);
writeFileSync("src/app/icon.svg", svg(main, "", false).replace(/\n\s*/g, ""));

// The Flutter apps: the three above and the AI chat app.
const flutterApps = { student: apps.student, guardian: apps.guardian, teacher: apps.teacher, chatbot: ["#0e7490", "AI"] };
mkdirSync("flutter/assets/icons", { recursive: true });
for (const [name, [color, letter]] of Object.entries(flutterApps)) {
  const res = `flutter/android/app/src/${name}/res`;
  mkdirSync(`${res}/mipmap-xxxhdpi`, { recursive: true });
  mkdirSync(`${res}/values`, { recursive: true });
  await png(svg(color, letter, false), 192).toFile(`flutter/assets/icons/${name}.png`);
  await png(svg(color, letter, false), 192).toFile(`${res}/mipmap-xxxhdpi/ic_launcher.png`);
  await png(svg(color, letter, true, true), 432).toFile(`${res}/mipmap-xxxhdpi/ic_launcher_foreground.png`);
  writeFileSync(`${res}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${color}</color>\n</resources>\n`);
}

// iPhone (one app for now): every size the icon set lists, square and without transparency (the App Store refuses it).
const ios = "flutter/ios/Runner/Assets.xcassets/AppIcon.appiconset";
for (const { size, scale, filename } of JSON.parse(readFileSync(`${ios}/Contents.json`, "utf8")).images) {
  const px = Math.round(parseFloat(size) * parseInt(scale));
  await png(svg(main, "", true), px).flatten({ background: main }).toFile(`${ios}/${filename}`);
}
console.log("icons written to public/, src/app/icon.svg and flutter/");

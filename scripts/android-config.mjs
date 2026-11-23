// Writes android/<app>/twa-manifest.json for the three Instanton Campus Android apps (Bubblewrap / Trusted Web Activity).
//   node --experimental-strip-types scripts/android-config.mjs classbari.app
// Then build each app as described in android/README.md.
import { mkdirSync, writeFileSync } from "node:fs";
import { APPS } from "../src/lib/apps.ts";

const domain = process.argv[2] || "classbari.app";
for (const app of Object.values(APPS)) {
  const host = `${app.sub}.${domain}`;
  const dir = `android/${app.sub}`;
  mkdirSync(dir, { recursive: true });
  const twa = {
    packageId: app.pkg,
    host,
    name: app.name,
    launcherName: app.short,
    display: "standalone",
    orientation: "portrait",
    themeColor: app.color,
    navigationColor: "#ffffff",
    backgroundColor: "#eef7f4",
    enableNotifications: true, // web push shows as this app's notifications
    startUrl: "/login",
    iconUrl: `https://${host}/apps/${app.sub}-512.png`,
    maskableIconUrl: `https://${host}/apps/${app.sub}-maskable.png`,
    webManifestUrl: `https://${host}/manifests/${app.sub}`,
    splashScreenFadeOutDuration: 300,
    signingKey: { path: "./upload.keystore", alias: "upload" },
    appVersionName: "1.0.0",
    appVersionCode: 1,
    shortcuts: [],
    generatorApp: "bubblewrap-cli",
    fallbackType: "customtabs",
    enableSiteSettingsShortcut: false,
    isChromeOSOnly: false,
    isMetaQuest: false,
    minSdkVersion: 24, // Android 7.0+: required by Google's TWA library
    fingerprints: [],
  };
  writeFileSync(`${dir}/twa-manifest.json`, JSON.stringify(twa, null, 2) + "\n");
  console.log(`✓ ${dir}  →  https://${host}`);
}

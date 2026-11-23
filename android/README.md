# Instanton Campus Android apps

Three Play Store apps, one website. Each app opens its own subdomain, so logins stay separate
(a student and a guardian sharing a phone each stay signed in to their own app). Teachers and institutes share
Instanton Campus and choose which on its login page.

| App | Package | Opens |
|---|---|---|
| Instanton Student | `app.classbari.student` | https://student.classbari.app |
| Instanton Campus (teachers and institutes) | `app.classbari.teacher` | https://teacher.classbari.app |
| Instanton Guardian | `app.classbari.guardian` | https://guardian.classbari.app |

`android/institute/` is left from the old separate Institution app. It is no longer built, but its upload key is still in it.

Built with Bubblewrap (Google's tool for Trusted Web Activities). The app is a full-screen Chrome
window on the site, so Google sign-in and push notifications work as on the web.

## Before building
1. The site is online on all three subdomains with HTTPS (the apps can't open localhost).
2. In Supabase → Authentication → URL Configuration, add each `https://<sub>.classbari.app/**` to Redirect URLs.
3. In Google Cloud → Clients → "Instanton Campus web", add each `https://<sub>.classbari.app` to Authorised JavaScript origins.

## Build
Tools live in `~/.bubblewrap` (Java 17, Android SDK, Bubblewrap) and the signing keys in `android/<app>/upload.keystore`,
with their passwords in `android/keys.local.txt`. Then:
```
bash scripts/android-build.sh              # all three (icons fetched from http://localhost:3000 — the site must be running)
ICON_BASE=live bash scripts/android-build.sh   # once the site is online
```
Each folder then has `app-release-signed.apk` (install on a phone to test) and `app-release-bundle.aab` (upload to Play).
Minimum Android version: 7.0 (required by Google's TWA library).

**The keystores are the keys to the apps. Back up `android/*/upload.keystore` together with `android/keys.local.txt` somewhere safe (not in git).**
If it is lost, updates need a key reset through Play support.

## After uploading to Play Console
Play Console → (the app) → Test and release → App integrity → App signing → copy the **SHA-256** of the
*App signing key certificate* (and of the upload key) into `.env.local`:
```
ANDROID_SHA256_STUDENT=AA:BB:…,CC:DD:…
ANDROID_SHA256_TEACHER=…
ANDROID_SHA256_GUARDIAN=…
```
Restart the site. https://classbari.app/.well-known/assetlinks.json then lists them, and the apps open
without a browser address bar.

## New version
Bump `appVersionCode` (+1) and `appVersionName` in twa-manifest.json, then `update` and `build` again.
Website changes need no new app version: the apps always show the live site.

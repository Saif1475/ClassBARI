# Instanton Campus phone apps (Flutter)

One codebase, four apps, for Android now and iPhone later:

| App | Build name | Android id | Who logs in |
|---|---|---|---|
| Instanton Student | `student` | `app.classbari.student` | students |
| Instanton Guardian | `guardian` | `app.classbari.guardian` | guardians |
| Instanton Campus | `teacher` | `app.classbari.teacher` | teachers, owners, managers: the login page asks "Instructor" or "Institute" |
| Instanton AI | `chatbot` | `app.classbari.chatbot` | students with an AI pack |

The apps hold no rules of their own. Every change (attendance, a payment, a quiz hand-in…) is sent to the Instanton Campus
server as the same action the website sends, and the server checks it and answers with the new data. So the website's
server must be running and reachable from the phone.

## Set up once

Flutter is in `~/development/flutter`. Add it to your terminal:

```sh
export PATH="$HOME/development/flutter/bin:$PATH"
```

Android builds use Java 21, which is in `~/development/jdk-21`; Flutter is already set to use it
(`flutter config --jdk-dir`). Store-style builds fail on an older Java.

## Tell the apps where the server is

From the project folder (one level up), give the address the **phone** can reach:

```sh
npm run flutter:config -- http://192.168.0.105:3000   # this computer's Wi-Fi address while testing
npm run flutter:config -- https://classbari.app       # the real site, for store builds
```

This writes `flutter/config.local.json` (not saved in Git) with that address and the two public Supabase values from
`.env.local`. No secret key ever goes into an app.

A phone can only reach `http://…` addresses in test builds; store builds need `https://`.

## Run on a phone

Turn on USB debugging on the phone, plug it in, then from this folder:

```sh
flutter run --flavor student --dart-define-from-file=config.local.json
```

Use `guardian`, `teacher` (Instanton Campus) or `chatbot` for the other apps.

## Build the install files

```sh
for app in student guardian teacher chatbot; do
  flutter build apk --flavor $app --dart-define-from-file=config.local.json
done
```

The files appear in `build/app/outputs/flutter-apk/` as `app-<name>-release.apk`.


Before uploading to Google Play, the release build must be signed with Instanton Campus's upload key. It is signed with
Flutter's test key for now (`android/app/build.gradle.kts`, `buildTypes.release`). The Student, Guardian and Campus
apps keep the ids of the earlier web-wrapper apps (Campus has the old Teacher app's), so to replace those as updates they
need the same key.

## After changing wording or shared rules on the website

The apps use the website's own English and Bangla text, and Dart copies of a few read-only helpers (dates, XP, marks,
quiz order). Bring them up to date and check them:

```sh
npm run flutter:gen     # from the project folder: copies the words, writes the answers the tests compare against
flutter test            # from this folder
```

`flutter test` also opens every screen of every app with sample data, in both languages.

## Check an app without a phone, and take pictures of every screen

With the website running on this computer (port 3000) and `npm run flutter:config -- http://localhost:3000` done:

```sh
npm run test:accounts   # once: the four test people (project folder)
npm run test:lessons    # once: sample lessons, a notice, a homework hand-in and a guardian chat for them
cd flutter && flutter build web --dart-define=APP=teacher --dart-define-from-file=config.local.json -o /tmp/web-teacher
cd ..      && node scripts/flutter-web-check.mjs teacher /tmp/web-teacher data/app-screens
              node scripts/flutter-web-check.mjs institute /tmp/web-teacher data/app-screens  # the same app, as the institute
              node scripts/flutter-web-check.mjs sheets data/app-screens    # one picture per app with all its screens
```

The check opens the app in a phone-sized browser window, logs in with the app's test account, walks its screens and
saves a picture of each. The Teacher run also marks the test student absent and present again, to prove changes reach
the server. `DARK=1` in front of the command takes the first screens in the dark theme.

This checks the screens and the talk with the server. It does not check the camera, files, notifications or anything
else that only a real phone has.

## Google sign-in

Students and guardians can use "Continue with Google". For that to return to the app, add these in Supabase →
Authentication → URL Configuration → Redirect URLs:

```
classbari-student://auth
classbari-guardian://auth
classbari-chatbot://auth
```

Email and password login (with the verification code) works without this.

## Where things are

- `lib/config.dart` — the four apps and who may open each
- `lib/theme.dart`, `lib/ui.dart` — the look (the website's phone look) and the parts every screen is built from
- `assets/fonts/` — Plus Jakarta Sans (English letters) and Hind Siliguri (Bangla, ৳), the website's fonts; from
  github.com/google/fonts, SIL Open Font Licence
- `lib/store.dart` — loading data, sending changes, working without internet
- `lib/views.dart` — the read-only helpers copied from the website (tested against it)
- `lib/screens/` — `login`, `student`, `lesson`, `pdf`, `guardian`, `teacher`, `institute`, `ai_chat`, `settings`
- `android/app/build.gradle.kts` — the four Android apps (names, ids)
- `../scripts/app-icons.mjs` — makes the icons

## Settings

Every app has one Settings page (`lib/screens/settings.dart`), opened from the side menu, or from the gear in the AI
app's chat list. Choices (colours, theme, text size on a slider from 90% to 130%, rows per page, AI model, answer language and length) are kept on
the phone. Anything Settings offers must also be on the website: `src/app/settings/page.tsx`, and "Chat settings" in
`src/components/student/AiChat.tsx`. The version shown comes from `kVersion` in `lib/config.dart`; a test keeps it
the same as `version:` in `pubspec.yaml`.

## Not done yet

- iPhone builds: the code is shared, but building needs a Mac with Xcode and an Apple developer account.
- AI chat: photos can be attached; PDF, Word and Excel files (as on the website) cannot yet.
- Highlighted PDFs are listed by page, not drawn on the page.
- Notifications (so Settings has no notification switches yet; the website's Settings has them).

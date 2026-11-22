# ClassBARI phone apps (Flutter)

One codebase, five apps, for Android now and iPhone later:

| App | Build name | Android id | Who logs in |
|---|---|---|---|
| ClassBARI Student | `student` | `app.classbari.student` | students |
| ClassBARI Guardian | `guardian` | `app.classbari.guardian` | guardians |
| ClassBARI Teacher | `teacher` | `app.classbari.teacher` | teachers, owners, managers |
| ClassBARI Institution | `institute` | `app.classbari.institute` | owners, managers |
| ClassBARI AI | `chatbot` | `app.classbari.chatbot` | students with an AI pack |

The apps hold no rules of their own. Every change (attendance, a payment, a quiz hand-in…) is sent to the ClassBARI
server as the same action the website sends, and the server checks it and answers with the new data. So the website's
server must be running and reachable from the phone.

## Set up once

Flutter is in `~/development/flutter`. Add it to your terminal:

```sh
export PATH="$HOME/development/flutter/bin:$PATH"
```

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

Use `guardian`, `teacher`, `institute` or `chatbot` for the other apps.

## Build the install files

```sh
for app in student guardian teacher institute chatbot; do
  flutter build apk --flavor $app --dart-define-from-file=config.local.json
done
```

The files appear in `build/app/outputs/flutter-apk/` as `app-<name>-release.apk`.

Before uploading to Google Play, the release build must be signed with ClassBARI's upload key. It is signed with
Flutter's test key for now (`android/app/build.gradle.kts`, `buildTypes.release`). The Student, Guardian, Teacher and
Institution apps keep the ids of the earlier web-wrapper apps, so to replace those as updates they need the same key.

## After changing wording or shared rules on the website

The apps use the website's own English and Bangla text, and Dart copies of a few read-only helpers (dates, XP, marks,
quiz order). Bring them up to date and check them:

```sh
npm run flutter:gen     # from the project folder: copies the words, writes the answers the tests compare against
flutter test            # from this folder
```

`flutter test` also opens every screen of every app with sample data, in both languages.

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

- `lib/config.dart` — the five apps and who may open each
- `lib/store.dart` — loading data, sending changes, working without internet
- `lib/views.dart` — the read-only helpers copied from the website (tested against it)
- `lib/screens/` — `login`, `student`, `lesson`, `pdf`, `guardian`, `teacher`, `institute`, `ai_chat`
- `android/app/build.gradle.kts` — the five Android apps (names, ids)
- `../scripts/app-icons.mjs` — makes the icons

## Not done yet

- iPhone builds: the code is shared, but building needs a Mac with Xcode and an Apple developer account.
- AI chat: photos can be attached; PDF, Word and Excel files (as on the website) cannot yet.
- Highlighted PDFs are listed by page, not drawn on the page.
- Notifications.

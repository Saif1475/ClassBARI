import 'package:flutter/services.dart' show appFlavor;

/// The four apps built from this one codebase: name, and the account kinds (as the server names them) each one opens.
/// 'teacher' is the app for teachers and institutes both: its login screen asks which (Store.panel).
const kApps = <String, ({String name, List<String> roles})>{
  'student': (name: 'Instanton Student', roles: ['student']),
  'guardian': (name: 'Instanton Guardian', roles: ['guardian']),
  'teacher': (name: 'Instanton Campus', roles: ['owner', 'manager', 'teacher']),
  'chatbot': (name: 'Instanton AI', roles: ['student']),
};

const _asked = String.fromEnvironment('APP');

/// Which app this build is: `--flavor student` on Android, `--dart-define=APP=student` elsewhere.
final String kApp = kApps.containsKey(_asked) ? _asked : (kApps.containsKey(appFlavor) ? appFlavor! : 'student');
String get kAppName => kApps[kApp]!.name;

/// Students and guardians (and the AI app, which is for students) log in step by step and may use Google.
bool get kFamilies => kApp == 'student' || kApp == 'guardian' || kApp == 'chatbot';

// From config.local.json (see flutter/README.md). The Supabase key here is the publishable one, never a secret key.
const kApiUrl = String.fromEnvironment('API_URL');
const kSupabaseUrl = String.fromEnvironment('SUPABASE_URL');
const kSupabaseKey = String.fromEnvironment('SUPABASE_KEY');

/// Shown in Settings. Kept the same as `version:` in pubspec.yaml (a test checks it).
const kVersion = '1.0.0';

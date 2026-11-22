import 'package:flutter/services.dart' show appFlavor;

/// The five apps built from this one codebase: name, and the account kinds (as the server names them) each one opens.
const kApps = <String, ({String name, List<String> roles})>{
  'student': (name: 'ClassBARI Student', roles: ['student']),
  'guardian': (name: 'ClassBARI Guardian', roles: ['guardian']),
  'teacher': (name: 'ClassBARI Teacher', roles: ['owner', 'manager', 'teacher']),
  'institute': (name: 'ClassBARI Institution', roles: ['owner', 'manager']),
  'chatbot': (name: 'ClassBARI AI', roles: ['student']),
};

const _asked = String.fromEnvironment('APP');

/// Which app this build is: `--flavor student` on Android, `--dart-define=APP=student` elsewhere.
final String kApp = kApps.containsKey(_asked) ? _asked : (kApps.containsKey(appFlavor) ? appFlavor! : 'student');
String get kAppName => kApps[kApp]!.name;

/// Students and guardians (and the AI app, which is for students) log in step by step and may use Google.
bool get kFamilies => kApp == 'student' || kApp == 'guardian' || kApp == 'chatbot';

/// Owners log straight in; everyone else first picks their institute.
bool get kPicksInstitute => kApp != 'institute';

// From config.local.json (see flutter/README.md). The Supabase key here is the publishable one, never a secret key.
const kApiUrl = String.fromEnvironment('API_URL');
const kSupabaseUrl = String.fromEnvironment('SUPABASE_URL');
const kSupabaseKey = String.fromEnvironment('SUPABASE_KEY');

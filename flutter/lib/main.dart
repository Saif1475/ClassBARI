import 'dart:convert';
import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/services.dart' show rootBundle;
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'screens/ai_chat.dart';
import 'screens/guardian.dart';
import 'screens/institute.dart';
import 'screens/login.dart';
import 'screens/student.dart';
import 'screens/teacher.dart';
import 'store.dart';
import 'strings.dart';
import 'theme.dart';
import 'ui.dart';
import 'views.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Future.wait([lang.load(), initializeDateFormatting('bn'), initializeDateFormatting('en_GB')]);
  if (kApiUrl.isEmpty || kSupabaseUrl.isEmpty || kSupabaseKey.isEmpty) {
    return runApp(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: Padding(padding: EdgeInsets.all(24), child: Text('This build has no server address. Build it with --dart-define-from-file=config.local.json (see flutter/README.md).')),
          ),
        ),
      ),
    );
  }
  final shared = jsonDecode(await rootBundle.loadString('assets/gen/shared.json')) as Json;
  topics = Topics(shared['topics'] as Json, shared['weights'] as Json);
  await Supabase.initialize(url: kSupabaseUrl, publishableKey: kSupabaseKey);
  await store.open(await SharedPreferences.getInstance(), deviceLang: PlatformDispatcher.instance.locale.languageCode);
  store.follow();
  runApp(const ClassbariApp());
}

class ClassbariApp extends StatefulWidget {
  const ClassbariApp({super.key});
  @override
  State<ClassbariApp> createState() => _ClassbariAppState();
}

class _ClassbariAppState extends State<ClassbariApp> {
  final nav = GlobalKey<NavigatorState>();
  late final AppLifecycleListener life;
  var wasIn = store.signedIn;

  @override
  void initState() {
    super.initState();
    // Ask for fresh data when the app comes back to the front; ask nothing while it is in the background.
    life = AppLifecycleListener(
      onStateChange: (s) {
        store.active = s == AppLifecycleState.resumed;
        if (store.active) store.refresh();
      },
    );
    store.addListener(leftScreens);
  }

  /// Logged out (or the login ended) while a lesson or chat was open on top: back to the first screen.
  void leftScreens() {
    if (wasIn && !store.signedIn) nav.currentState?.popUntil((r) => r.isFirst);
    wasIn = store.signedIn;
  }

  @override
  void dispose() {
    store.removeListener(leftScreens);
    life.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final sky = (store.me ?? (kApp == 'guardian' ? store.child : null))?['gender'] == 'female'; // the website's theme for girls
    return MaterialApp(
      title: kAppName,
      navigatorKey: nav,
      debugShowCheckedModeBanner: false,
      theme: classbariTheme(Brightness.light, sky: sky),
      darkTheme: classbariTheme(Brightness.dark, sky: sky),
      home: const Root(),
    );
  });
}

/// The login screen, why this account can't open this app, or the app itself.
class Root extends StatelessWidget {
  const Root({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    if (!store.signedIn) return const LoginScreen();
    final inst = kPicksInstitute ? store.institute : null;
    final problem = store.status == Status.noAccess
        ? (inst != null ? t('auth.notAtInstitute', [inst['name']]) : t('auth.notEnrolled'))
        : (store.role != null && !kApps[kApp]!.roles.contains(store.role) ? t('auth.wrongApp', [kAppName]) : null);
    if (problem != null) {
      return Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 16,
              children: [
                Strong(problem),
                Doing(label: t('auth.tryOther'), onPressed: store.signOut),
              ],
            ),
          ),
        ),
      );
    }
    if (store.state == null || store.role == null) {
      // No data yet: loading, or no internet on the very first opening.
      return store.status == Status.offline
          ? Scaffold(
              body: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  spacing: 12,
                  children: [
                    Text(t('aichat.error')),
                    Doing(label: t('app.tryAgain'), soft: true, onPressed: store.refresh),
                  ],
                ),
              ),
            )
          : const Loading();
    }
    return switch (kApp) {
      'guardian' => const GuardianApp(),
      'teacher' => const TeacherApp(),
      'institute' => const InstituteApp(),
      'chatbot' => const AiChatApp(),
      _ => const StudentApp(),
    };
  });
}

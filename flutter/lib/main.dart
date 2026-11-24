import 'dart:convert';
import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/services.dart' show rootBundle;
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'push.dart';
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
  await startPush();
  store.beforeSignOut = forgetPush;
  runApp(const ClassbariApp());
}

class ClassbariApp extends StatefulWidget {
  const ClassbariApp({super.key});
  @override
  State<ClassbariApp> createState() => _ClassbariAppState();
}

class _ClassbariAppState extends State<ClassbariApp> {
  final nav = GlobalKey<NavigatorState>();
  final messenger = GlobalKey<ScaffoldMessengerState>();
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
    if (store.signedIn && store.role != null) registerPush(); // opened already logged in: nothing may change to call it
    // A notification while the app is open: shown at the bottom, with a button to go to it.
    onForeground = (title, body, screen) => messenger.currentState?.showSnackBar(
      SnackBar(
        content: Text(body.isEmpty ? title : '$title — $body'),
        action: SnackBarAction(label: t('notify.open'), onPressed: () => openScreen.value = screen),
      ),
    );
  }

  /// Logged out (or the login ended) while a lesson or chat was open on top: back to the first screen.
  /// Logged in with the data loaded: this phone can get notifications now.
  void leftScreens() {
    if (wasIn && !store.signedIn) {
      forgetPush(); // a login ended elsewhere skips signOut: the next person on this phone must not get this one's notifications
      nav.currentState?.popUntil((r) => r.isFirst);
    }
    wasIn = store.signedIn;
    if (store.signedIn && store.role != null) registerPush();
  }

  @override
  void dispose() {
    store.removeListener(leftScreens);
    life.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final sky = store.sky;
    return MaterialApp(
      title: kAppName,
      navigatorKey: nav,
      scaffoldMessengerKey: messenger,
      debugShowCheckedModeBanner: false,
      theme: classbariTheme(Brightness.light, sky: sky, glass: store.glass / 3),
      darkTheme: classbariTheme(Brightness.dark, sky: sky, glass: store.glass / 3),
      themeMode: switch (store.themeMode) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      },
      // Text size from Settings, on top of the phone's own text size.
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(MediaQuery.textScalerOf(context).scale(1) * store.textSize)),
        child: child!,
      ),
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
    final inst = store.picksInstitute ? store.institute : null;
    final problem = store.status == Status.noAccess
        ? (inst != null ? t('auth.notAtInstitute', [inst['name']]) : t('auth.notEnrolled'))
        : (store.role != null && !kApps[kApp]!.roles.contains(store.role) ? t('auth.wrongApp', [kAppName]) : null);
    // A short message in the middle of the page, with one button under it.
    Widget notice(String text, Widget button) => Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Box(children: [Strong(text), button]),
          ),
        ),
      ),
    );
    if (problem != null) return notice(problem, Doing(label: t('auth.tryOther'), onPressed: store.signOut));
    if (store.state == null || store.role == null) {
      // No data yet: loading, or no internet on the very first opening.
      return store.status == Status.offline ? notice(t('aichat.error'), Doing(label: t('app.tryAgain'), soft: true, onPressed: store.refresh)) : const Loading();
    }
    return switch (kApp) {
      'guardian' => const GuardianApp(),
      'teacher' => store.runsInstitute ? const InstituteApp() : const TeacherApp(),
      'chatbot' => const AiChatApp(),
      _ => const StudentApp(),
    };
  });
}

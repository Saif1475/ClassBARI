// A quiz handed in when time is up but refused by the server (say, a suspended institute): it is not sent again every
// second; the Submit button is there to try again. Its own file: it starts Supabase with a pretend server.
import 'dart:convert';
import 'dart:io';

import 'package:classbari/screens/lesson.dart';
import 'package:classbari/store.dart';
import 'package:classbari/strings.dart';
import 'package:classbari/theme.dart';
import 'package:classbari/ui.dart';
import 'package:classbari/views.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

Json read(String path) => jsonDecode(File(path).readAsStringSync()) as Json;

void main() {
  setUpAll(() async {
    lang.use(read('assets/gen/en.json'), read('assets/gen/bn.json'));
    await initializeDateFormatting('en_GB');
    SharedPreferences.setMockInitialValues({});
    store.prefs = await SharedPreferences.getInstance();
    await Supabase.initialize(url: 'http://localhost', publishableKey: 'x', authOptions: const FlutterAuthClientOptions(localStorage: EmptyLocalStorage(), detectSessionInUri: false));
  });

  testWidgets('time up and refused: handed in once, not every second', (tester) async {
    store.fake({
      'meId': 5,
      'students': [{'id': 5, 'name': 'Rahim', 'batch': 'A'}],
      'modules': [
        {'id': 1, 'title': 'Ch', 'batch': 'A', 'published': true, 'items': [
          {'id': 3, 'kind': 'quiz', 'title': 'Quiz', 'timeLimitMin': 1, 'questions': [{'q': 'Q?', 'options': ['a', 'b'], 'answer': 0}]},
        ]},
      ],
    }, 'student');
    store.prefs.setInt('instanton-quiz-1-3-5', DateTime.now().millisecondsSinceEpoch - 5 * 60 * 1000); // time already up
    var submits = 0;
    final server = MockClient((r) async {
      if (r.method == 'GET') return http.Response('', 204);
      if ((jsonDecode(r.body) as Map)['name'] == 'submitQuiz') submits++;
      return http.Response('{"error":"suspended"}', 403);
    });
    await http.runWithClient(() async {
      await tester.pumpWidget(Live((context) => MaterialApp(theme: classbariTheme(Brightness.light), home: const LessonScreen(moduleId: 1, itemId: 3))));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.text(t('quiz.start')));
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(seconds: 1));
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
      }
      await tester.pump();
    }, () => server);
    expect(submits, 1);
    expect(find.text(t('app.submitQuiz')), findsWidgets); // the button to try again
    await tester.pumpWidget(const SizedBox());
  });
}

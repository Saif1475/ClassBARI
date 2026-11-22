// The teacher's batch tools: the gradebook shows marks and averages, and a new MCQ quiz is sent as the website sends it.
import 'dart:convert';
import 'dart:io';

import 'package:classbari/screens/teacher_more.dart';
import 'package:classbari/store.dart';
import 'package:classbari/strings.dart';
import 'package:classbari/theme.dart';
import 'package:classbari/ui.dart';
import 'package:classbari/views.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

Json read(String path) => jsonDecode(File(path).readAsStringSync()) as Json;
List<Json> sent(String name) => store.waiting.where((e) => e['name'] == name).toList();

void main() {
  setUpAll(() async {
    lang.use(read('assets/gen/en.json'), read('assets/gen/bn.json'));
    await initializeDateFormatting('en_GB');
  });

  testWidgets('teacher tools: gradebook averages; a new quiz goes out with the website\'s addModuleItem arguments', (tester) async {
    SharedPreferences.setMockInitialValues({});
    store.prefs = await SharedPreferences.getInstance();
    tester.view.physicalSize = const Size(360, 720);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    store.fake({
      'teacherLogin': 'Mina Miss',
      'batches': [
        {'name': 'Batch A', 'teacher': 'Mina Miss'},
      ],
      'students': [
        {'id': 1, 'name': 'Rahim', 'batch': 'Batch A'},
        {'id': 2, 'name': 'Karim', 'batch': 'Batch A'},
      ],
      'modules': [
        {
          'id': 7,
          'batch': 'Batch A',
          'title': 'Chapter 1',
          'published': true,
          'items': [
            {
              'id': 70,
              'kind': 'quiz',
              'title': 'Quiz 1',
              'points': 10,
              'scores': {'1': 8, '2': 5},
            },
            {
              'id': 71,
              'kind': 'task',
              'title': 'Homework 1',
              'submissions': {
                '1': {'grade': 20},
                '2': {'file': 'x'},
              },
            },
          ],
        },
      ],
    }, 'teacher');

    await tester.pumpWidget(
      Live(
        (context) => MaterialApp(
          theme: classbariTheme(Brightness.light),
          home: const GradebookScreen(batch: 'Batch A'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Average 90%'), findsOneWidget); // Rahim: 8/10 and 20/20
    expect(find.text('Average 50%'), findsOneWidget); // Karim: only the quiz is marked
    expect(find.text('Quiz 1 (10): 5\nHomework 1 (20): —'), findsOneWidget);

    await tester.pumpWidget(
      Live(
        (context) => MaterialApp(
          theme: classbariTheme(Brightness.light),
          home: const StudioScreen(batch: 'Batch A'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add item'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('New quiz'));
    await tester.pump();
    await tester.enterText(find.byType(TextField).at(0), 'Waves quiz');
    await tester.enterText(find.byType(TextField).at(1), '50');
    await tester.enterText(find.byType(TextField).at(2), 'Unit of frequency?\n*Hertz\nNewton\nJoule\nWatt\n\n[Speed] v = ?\nf/λ\n*fλ\nλ/f\nf+λ');
    await tester.pump();
    await tester.scrollUntilVisible(find.text('Publish item'), 150, scrollable: find.byType(Scrollable).hitTestable().first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Publish item'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('addModuleItem').single['args'], [
      7,
      {
        'kind': 'quiz',
        'title': 'Waves quiz',
        'meta': '',
        'points': 50,
        'dueDate': dayKey(DateTime.now().add(const Duration(days: 7))),
        'questions': [
          {
            'q': 'Unit of frequency?',
            'options': ['Hertz', 'Newton', 'Joule', 'Watt'],
            'answer': 0,
          },
          {
            'q': 'v = ?',
            'topic': 'Speed',
            'options': ['f/λ', 'fλ', 'λ/f', 'f+λ'],
            'answer': 1,
          },
        ],
        'publishToExplore': false,
        'free': true,
      },
    ]);

    // The other batch pages draw on a small phone without errors.
    for (final page in const [LiveClassScreen(batch: 'Batch A'), BatchCalendarScreen(batch: 'Batch A'), WatchTimeScreen(batch: 'Batch A'), MeritScreen(batch: 'Batch A')]) {
      await tester.pumpWidget(Live((context) => MaterialApp(theme: classbariTheme(Brightness.light), home: page)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }
    expect(find.text('8 / 10'), findsOneWidget); // the merit list: Rahim first
  });
}

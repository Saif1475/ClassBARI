// The student and guardian extras: what they send matches what the website sends (notes, portfolio, the live class).
import 'dart:convert';
import 'dart:io';

import 'package:classbari/screens/guardian_more.dart';
import 'package:classbari/screens/student_more.dart';
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

  test('live class: the video room link and the bodies are the website\'s', () {
    // Made by the website's VideoRoom code (LiveClassroom.tsx) with node, for the same values.
    expect(jitsiUrl(room: 'cb-abc123', batch: 'HSC Physics', topic: 'Waves & Sound', name: 'Rahim Uddin'),
        'https://meet.jit.si/cb-abc123#userInfo.displayName=%22Rahim%20Uddin%22&config.subject=%22HSC%20Physics%20%C2%B7%20Waves%20%26%20Sound%22');
    expect(jitsiUrl(room: 'r', batch: 'B', topic: 'T', name: 'N', audioOnly: true), endsWith('&config.startAudioOnly=true&config.startWithVideoMuted=true'));
    expect(joinBody('B', 'v1234567', 'N', 5), {'action': 'join', 'batch': 'B', 'voter': 'v1234567', 'name': 'N', 'studentId': 5});
    expect(handBody('B', 'v1234567', 'N', true), {'action': 'hand', 'batch': 'B', 'voter': 'v1234567', 'name': 'N', 'up': true});
    expect(voteBody('B', 'p1', 'v1234567', 2), {'action': 'vote', 'batch': 'B', 'pollId': 'p1', 'voter': 'v1234567', 'option': 2});
  });

  test('topic mastery: per topic, with the website\'s levels', () {
    final modules = [
      {
        'items': [
          {
            'questions': [{'topic': 'Waves'}, {'topic': 'Waves'}, {'topic': 'Light'}, {'q': 'untagged'}],
            'answers': {'5': [true, false, true, true]},
          },
        ],
      },
    ];
    expect(topicMastery(modules, 5).map((r) => (r.topic, r.pct, r.level)), [('Waves', 50, 'familiar'), ('Light', 100, 'mastered')]);
  });

  testWidgets('notes: add and delete are sent as the website sends them', (tester) async {
    SharedPreferences.setMockInitialValues({});
    store.prefs = await SharedPreferences.getInstance();
    store.fake({
      'meId': 5,
      'students': [{'id': 5, 'name': 'Rahim', 'batch': 'A'}],
      'notes': [{'id': 9, 'title': 'Old', 'text': 'Kept', 'at': DateTime.now().toUtc().toIso8601String()}],
    }, 'student');
    await tester.pumpWidget(Live((context) => MaterialApp(theme: classbariTheme(Brightness.light), home: const NotesScreen())));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'Waves');
    await tester.enterText(find.byType(TextField).at(1), 'f = 1/T');
    await tester.pump();
    await tester.tap(find.text('Save to My notes'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('addNote').single['args'], ['Waves', 'f = 1/T']); // the server adds who wrote it
    await tester.tap(find.byTooltip('Remove Old'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('deleteNote').single['args'], [9]);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('guardian: the child\'s points and portfolio draw', (tester) async {
    SharedPreferences.setMockInitialValues({});
    store.prefs = await SharedPreferences.getInstance();
    final now = DateTime.now().toUtc().toIso8601String();
    store.fake({
      'parentChildren': [5],
      'students': [{'id': 5, 'name': 'Rahim', 'batch': 'A'}],
      'points': [
        {'id': 1, 'studentId': 5, 'kind': 'helping', 'at': now},
        {'id': 2, 'studentId': 5, 'kind': 'helping', 'at': now},
        {'id': 3, 'studentId': 5, 'kind': 'offTask', 'at': now},
      ],
      'portfolio': [],
    }, 'guardian');
    await tester.pumpWidget(Live((context) => MaterialApp(theme: classbariTheme(Brightness.light), home: const ChildPointsScreen())));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('1'), findsOneWidget); // 2 − 1
    expect(find.text('+2 / −1 this week'), findsOneWidget);
    expect(find.text('Rahim\'s portfolio'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}

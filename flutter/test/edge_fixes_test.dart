// Edge cases found in review: each test draws or sends what used to break.
import 'dart:convert';
import 'dart:io';

import 'package:classbari/screens/guardian_more.dart';
import 'package:classbari/screens/institute.dart';
import 'package:classbari/screens/lesson.dart';
import 'package:classbari/screens/student_more.dart';
import 'package:classbari/screens/teacher_more.dart' show StudioScreen;
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

Future<void> show(WidgetTester tester, Widget page) async {
  await tester.pumpWidget(Live((context) => MaterialApp(theme: classbariTheme(Brightness.light), home: page)));
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  setUpAll(() async {
    lang.use(read('assets/gen/en.json'), read('assets/gen/bn.json'));
    await initializeDateFormatting('en_GB');
  });
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    store.prefs = await SharedPreferences.getInstance();
  });

  test('the saved outbox keeps the small changes when a big photo joins', () async {
    store.fake({'meId': 1}, 'teacher');
    await store.act('toggleAttendance', [5, '2026-11-23']);
    await store.act('submitAssignment', [1, 2, 5, {'file': 'x' * 1100000}]);
    await store.act('toggleAttendance', [6, '2026-11-23']);
    expect(store.waiting.length, 3); // all still sent from memory
    final saved = [for (final e in jsonDecode(store.prefs.getString('classbari-outbox')!) as List) (e as Map)['name']];
    expect(saved, ['toggleAttendance', 'toggleAttendance']);
  });

  testWidgets('student live class: a spinner inside the page, and "not live" for a student with no batch', (tester) async {
    store.fake({'meId': 5, 'students': [{'id': 5, 'name': 'Rahim', 'batch': 'A'}]}, 'student');
    await tester.pumpWidget(MaterialApp(theme: classbariTheme(Brightness.light), home: const LiveClassScreen()));
    expect(tester.takeException(), isNull); // the first draw, before any answer
    await tester.pumpWidget(const SizedBox());
    store.fake({'meId': 5, 'students': [{'id': 5, 'name': 'Rahim'}]}, 'student');
    await show(tester, const LiveClassScreen());
    expect(find.text(t('liveRoom.notLive')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a receipt line wraps long values instead of overflowing', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(1.3)),
        child: Scaffold(body: SizedBox(width: 300, child: Line('Chapter 4 homework: waves and sound', 'Muhammad Abdur Rahman Chowdhury (Roll 1234)'))),
      ),
    ));
    expect(tester.takeException(), isNull);
  });

  testWidgets('report card: only the child\'s batch\'s published chapters', (tester) async {
    store.fake({
      'parentChildren': [5],
      'students': [{'id': 5, 'name': 'Rahim', 'batch': 'A'}],
      'modules': [
        {'id': 1, 'batch': 'A', 'published': true, 'items': [{'id': 1, 'kind': 'task', 'title': 'Shown'}]},
        {'id': 2, 'batch': 'B', 'published': true, 'items': [{'id': 2, 'kind': 'task', 'title': 'Other batch'}]},
        {'id': 3, 'batch': 'A', 'published': false, 'items': [{'id': 3, 'kind': 'exam', 'title': 'Hidden'}]},
      ],
    }, 'guardian');
    await show(tester, const ReportCardScreen());
    expect(find.text('Shown'), findsOneWidget);
    expect(find.text('Other batch'), findsNothing);
    expect(find.text('Hidden'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('guardian pages without a child say so; payments without a method do not show a raw key', (tester) async {
    store.fake({'parentChildren': <int>[], 'students': <Json>[]}, 'guardian');
    for (final page in const [PaymentsScreen(), InvoiceScreen(), ReportCardScreen(), ChildPointsScreen()]) {
      await show(tester, page);
      expect(find.text(t('auth.notEnrolled')), findsOneWidget);
    }
    store.fake({
      'parentChildren': [5],
      'students': [{'id': 5, 'name': 'Rahim', 'batch': 'A', 'feeDue': '500'}],
      'payments': [
        {'id': 1, 'studentId': 5, 'amount': 100, 'at': '2026-01-05T10:00:00Z'},
        {'id': 2, 'studentId': 5, 'amount': 200, 'at': '2026-03-05T10:00:00Z', 'method': 'cash'},
      ],
    }, 'guardian');
    await show(tester, const PaymentsScreen());
    expect(find.textContaining('parent.methods'), findsNothing);
    expect(tester.getTopLeft(find.text(taka(200))).dy, lessThan(tester.getTopLeft(find.text(taka(100))).dy)); // newest first
    expect(find.text(taka(500)), findsOneWidget); // a fee sent as text still counts
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('institute fees: a fee due sent as text does not crash', (tester) async {
    store.fake({'students': [{'id': 5, 'name': 'Rahim', 'batch': 'A', 'feeDue': '500'}, {'id': 6, 'name': 'Karim', 'batch': 'A', 'feeDue': 300}]}, 'owner');
    await show(tester, const Fees());
    expect(tester.takeException(), isNull);
    expect(find.text('Rahim'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a broken picture draws nothing instead of throwing', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: DataPicture('data:image/png;base64,@@not base64@@'))));
    expect(tester.takeException(), isNull);
  });

  testWidgets('offline: "Mark done" shows as done at once, and a quiz is started only once', (tester) async {
    store.fake({
      'meId': 5,
      'students': [{'id': 5, 'name': 'Rahim', 'batch': 'A'}],
      'modules': [
        {'id': 1, 'title': 'Ch', 'batch': 'A', 'published': true, 'items': [
          {'id': 2, 'kind': 'pdf', 'title': 'Notes'},
          {'id': 3, 'kind': 'quiz', 'title': 'Quiz', 'questions': [{'q': 'Q?', 'options': ['a', 'b'], 'answer': 0}]},
        ]},
      ],
    }, 'student');
    await show(tester, const LessonScreen(moduleId: 1, itemId: 2));
    await tester.tap(find.text(t('app.markDone')));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text(t('app.markNotDone')), findsOneWidget); // still waiting to be sent, but shown flipped
    for (var i = 0; i < 2; i++) {
      await show(tester, const LessonScreen(moduleId: 1, itemId: 3));
      await tester.pumpWidget(const SizedBox());
    }
    expect(sent('startQuiz').length, 1);
  });

  testWidgets('offline: publishing a chapter and a free preview show at once', (tester) async {
    store.fake({
      'meId': 1,
      'batches': [{'name': 'A'}],
      'modules': [
        {'id': 1, 'title': 'Ch', 'batch': 'A', 'published': false, 'items': [{'id': 2, 'kind': 'video', 'title': 'V'}]},
      ],
    }, 'teacher');
    await show(tester, const StudioScreen(batch: 'A'));
    await tester.tap(find.text(t('teacher.unpublished')));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text(t('teacher.published')), findsOneWidget);
    await tester.tap(find.text(t('courses.previewToggle')));
    await tester.pump(const Duration(milliseconds: 300));
    expect(tester.widget<FilterChip>(find.byType(FilterChip)).selected, isTrue);
    await tester.pumpWidget(const SizedBox());
  });
}

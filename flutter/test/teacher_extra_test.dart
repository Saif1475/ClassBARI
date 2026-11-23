// The teacher's extra website tools send the website's actions with the website's arguments.
import 'dart:convert';
import 'dart:io';

import 'package:classbari/screens/teacher_tools.dart';
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

Future<void> open(WidgetTester tester, Widget page) async {
  await tester.pumpWidget(Live((context) => MaterialApp(key: UniqueKey(), theme: classbariTheme(Brightness.light), home: page)));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() async {
    lang.use(read('assets/gen/en.json'), read('assets/gen/bn.json'));
    await initializeDateFormatting('en_GB');
  });

  test('student QR codes and the video room link are read and built as on the website', () {
    expect(qrStudent('edunest:student:12'), 12);
    expect(qrStudent('edunest:student:x'), -1); // a Instanton Campus code, but no student: "not in this batch"
    expect(qrStudent('https://example.com'), isNull);
    expect(
      jitsiUrl('ClassBARI-abc', 'Batch A', 'Waves', 'Mina Miss'),
      'https://meet.jit.si/ClassBARI-abc#userInfo.displayName=%22Mina%20Miss%22&config.subject=%22Batch%20A%20%C2%B7%20Waves%22',
    );
    expect(pointTotal([
      {'studentId': 1, 'kind': 'helping'},
      {'studentId': 1, 'kind': 'offTask'},
      {'studentId': 1, 'kind': 'teamwork'},
      {'studentId': 2, 'kind': 'helping'},
    ], 1), 1);
  });

  testWidgets('meeting slots, points, the question bank and report comments go out as the website sends them', (tester) async {
    SharedPreferences.setMockInitialValues({});
    store.prefs = await SharedPreferences.getInstance();
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    store.fake({
      'teacherLogin': 'Mina Miss',
      'batches': [
        {'name': 'Batch A', 'teacher': 'Mina Miss'},
      ],
      'students': [
        {'id': 1, 'name': 'Rahim', 'batch': 'Batch A', 'guardianName': 'Karim'},
      ],
      'modules': <Json>[],
      'meetings': <Json>[],
      'points': <Json>[],
      'reportComments': {'1': 'Works hard'},
    }, 'teacher');

    // MeetingsTool: four 15-minute slots from 18:00 three days from now.
    await open(tester, const MeetingsScreen());
    await tester.tap(find.text('Open slots'));
    await tester.pump(const Duration(milliseconds: 300));
    final d = DateTime.now().add(const Duration(days: 3)), first = DateTime(d.year, d.month, d.day, 18);
    expect(sent('addMeetingSlots').single['args'], [
      [
        for (var i = 0; i < 4; i++) {'start': first.add(Duration(minutes: i * 15)).toUtc().toIso8601String(), 'minutes': 15, 'teacher': 'Mina Miss', 'batch': 'Batch A'},
      ],
    ]);

    // PointsPanel: addPoint(studentId, kind).
    await open(tester, const DojoScreen(batch: 'Batch A'));
    await tester.tap(find.text('+ Helping others'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('addPoint').single['args'], [1, 'helping']);

    // BankTool: the parsed questions with the chosen subject and difficulty.
    await open(tester, const BankScreen());
    await tester.enterText(find.byType(TextField).first, '[Waves] Unit of frequency?\n*Hertz\nNewton');
    await tester.pump();
    await tester.scrollUntilVisible(find.text('Add to bank'), 150, scrollable: find.byType(Scrollable).hitTestable().first);
    await tester.tap(find.text('Add to bank'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('addBankQuestions').single['args'], [
      [
        {
          'q': 'Unit of frequency?',
          'topic': 'Waves',
          'options': ['Hertz', 'Newton'],
          'answer': 0,
          'subject': 'Physics',
          'difficulty': 'medium',
        },
      ],
    ]);

    // ReportCard (editable): setReportComment(studentId, comment).
    await open(tester, const TeacherReportScreen(studentId: 1));
    expect(find.text('Works hard'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '  Works hard; practise maths  ');
    await tester.scrollUntilVisible(find.text('Save'), 150, scrollable: find.byType(Scrollable).hitTestable().first);
    await tester.tap(find.text('Save'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('setReportComment').single['args'], [1, 'Works hard; practise maths']);

    // The other new pages draw without errors.
    for (final page in const [ModerateScreen(), ExploreVideoScreen(batch: 'Batch A')]) {
      await open(tester, page);
      expect(tester.takeException(), isNull);
    }
  });
}

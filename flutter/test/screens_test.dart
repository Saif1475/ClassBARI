// Every app's screens are opened with sample data, in both languages, light and dark, on a small phone: nothing may
// overflow or crash, long lists get page controls, and each button sends the same action the website sends.
// (No server here: a change stays in the queue, where the test reads it.)
import 'dart:convert';
import 'dart:io';

import 'package:classbari/screens/ai_chat.dart';
import 'package:classbari/screens/guardian.dart';
import 'package:classbari/screens/institute.dart';
import 'package:classbari/screens/login.dart';
import 'package:classbari/screens/student.dart';
import 'package:classbari/screens/teacher.dart';
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
final today = dayKey();
String inDays(int n) => DateTime.now().add(Duration(days: n)).toUtc().toIso8601String();

Json sample() => {
  'meId': 5,
  'parentChildren': [5, 6],
  'teacherName': 'Owner Sir',
  'teacherLogin': 'Mina Miss',
  'instituteName': "Tanvir's Physics Care",
  'students': [
    for (var i = 1; i <= 45; i++)
      {
        'id': i,
        'name': i == 5 ? 'Sadia Akter Chowdhury' : 'Student $i',
        'email': 's$i@gmail.com',
        'guardianName': 'Guardian $i',
        'guardianEmail': 'g$i@gmail.com',
        'phone': '01711000001',
        'batch': i <= 40 ? 'Batch A' : 'Batch B',
        'feeDue': i.isEven ? 1500 : 0,
        if (i == 5) 'gender': 'female',
      },
  ],
  'batches': [
    {
      'id': 'a',
      'name': 'Batch A',
      'teacher': 'Mina Miss',
      'days': 'Sat, Mon, Wed',
      'classDays': [6, 1, 3],
      'fee': 1500,
    },
    {
      'id': 'b',
      'name': 'Batch B',
      'teacher': 'Someone Else',
      'days': 'Sun',
      'classDays': [0],
      'fee': 1000,
    },
  ],
  'modules': [
    {
      'id': 1,
      'batch': 'Batch A',
      'title': 'Chapter 1: Motion and a rather long chapter name that must wrap',
      'items': [
        {'id': 11, 'kind': 'video', 'title': 'Watch: velocity', 'meta': '12 min', 'done': true, 'url': 'https://youtu.be/x'},
        {'id': 12, 'kind': 'pdf', 'title': 'Notes', 'done': false, 'url': '/api/files/a/b'},
        {
          'id': 13,
          'kind': 'quiz',
          'title': 'Quiz 1',
          'done': false,
          'dueDate': today,
          'shuffle': true,
          'points': 3,
          'questions': [
            for (var q = 0; q < 3; q++)
              {
                'q': 'Question $q?',
                'options': ['a$q', 'b$q', 'c$q', 'd$q'],
                'answer': 0,
              },
          ],
        },
        {
          'id': 14,
          'kind': 'task',
          'title': 'Homework 1',
          'done': false,
          'dueDate': today,
          'points': 20,
          'submissions': {
            '6': {'fileName': 'hw.jpg', 'file': '/api/files/a/c', 'at': inDays(-1)},
            '7': {'fileName': 'hw.pdf', 'file': '/api/files/a/d', 'at': inDays(-1), 'grade': 15},
          },
        },
        {
          'id': 15,
          'kind': 'quiz',
          'title': 'Old quiz',
          'done': true,
          'dueDate': '2026-11-01',
          'points': 10,
          'scores': {'5': 7, '6': 4},
          'answers': {
            '5': [true, false, true],
          },
        },
      ],
    },
  ],
  'attendance': {
    today: [6, 9],
  },
  'xp': {
    '5': {today: 20},
  },
  'announcements': [
    {'id': 1, 'title': 'Exam on Sunday', 'body': 'Bring your admit card.', 'batch': 'Batch A', 'at': inDays(-1)},
  ],
  'liveClass': {'batch': 'Batch A', 'start': inDays(1), 'topic': 'Projectile motion'},
  'meetings': [
    {'id': 31, 'batch': 'Batch A', 'start': inDays(2), 'teacher': 'Mina Miss', 'minutes': 15},
    {'id': 32, 'batch': 'Batch A', 'start': inDays(3), 'teacher': 'Mina Miss', 'minutes': 15, 'bookedBy': 5},
  ],
  'chats': [
    {
      'id': 'parent-5',
      'name': 'Guardian of Sadia',
      'role': 'Batch A',
      'unread': 2,
      'messages': [
        {'id': 1, 'text': 'Is there class tomorrow?', 'at': inDays(-1), 'mine': true, 'sender': 'Guardian 5'},
        {'id': 2, 'text': 'Yes, at 5 pm.', 'at': inDays(0), 'mine': false, 'sender': 'Mina Miss'},
      ],
    },
  ],
  'payments': [
    {'id': 41, 'studentId': 3, 'batch': 'Batch A', 'amount': 1500, 'at': inDays(0), 'method': 'cash'},
  ],
  'staff': [
    {'name': 'Mina Miss'},
    {'name': 'Owner Sir'},
  ],
  'reportComments': {'5': 'Works hard. Needs more practice in vectors.'},
};

/// One app on a small phone (320 wide), in a language and brightness.
Future<void> open(WidgetTester tester, Widget app, {String code = 'en', bool dark = false, String role = 'student'}) async {
  tester.view.physicalSize = const Size(320, 640);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  lang.set(code);
  store.fake(sample(), role);
  await tester.pumpWidget(
    Live(
      (context) => MaterialApp(
        theme: classbariTheme(dark ? Brightness.dark : Brightness.light, sky: dark),
        home: app,
      ),
    ),
  );
  await tester.pump();
}

/// Scroll down the page until this is on screen (pages build their lower parts only when reached), then press it.
Future<void> press(WidgetTester tester, Finder what) async {
  await tester.scrollUntilVisible(what, 150, scrollable: find.byType(Scrollable).hitTestable().first); // the page on top
  await tester.pumpAndSettle();
  await tester.tap(what);
}

/// What went wrong while drawing, with the widget it happened in.
String? drawingError(WidgetTester tester) {
  final e = tester.takeException();
  if (e == null) return null;
  final text = e is FlutterError ? e.toStringDeep() : '$e';
  return '${text.split('\n').first} ${RegExp(r'creator: [^\n]+\n[^\n]+').firstMatch(text)?[0] ?? ''}';
}

List<Json> sent(String name) => store.waiting.where((e) => e['name'] == name).toList();

void main() {
  setUpAll(() async {
    lang.use(read('assets/gen/en.json'), read('assets/gen/bn.json'));
    final shared = read('assets/gen/shared.json');
    topics = Topics(shared['topics'] as Json, shared['weights'] as Json);
    await initializeDateFormatting('bn');
    await initializeDateFormatting('en_GB');
  });
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    store.prefs = await SharedPreferences.getInstance();
  });

  for (final (code, dark) in [('en', false), ('bn', true)]) {
    testWidgets('every tab of the four institute apps opens without a layout error ($code${dark ? ', dark' : ''})', (tester) async {
      for (final (app, role, tabs) in [(const StudentApp(), 'student', 4), (const GuardianApp(), 'guardian', 4), (const TeacherApp(), 'teacher', 5), (const InstituteApp(), 'owner', 5)]) {
        await open(tester, app, code: code, dark: dark, role: role);
        for (var i = 0; i < tabs; i++) {
          await tester.tap(find.byType(TabItem).at(i));
          await tester.pumpAndSettle();
          expect(drawingError(tester), isNull, reason: '$role tab $i');
        }
      }
    });
  }

  testWidgets('screens are usable: big enough tap targets, every button has a name, readable contrast', (tester) async {
    final handle = tester.ensureSemantics();
    for (final (app, role) in [(const StudentApp(), 'student'), (const TeacherApp(), 'teacher'), (const InstituteApp(), 'owner')]) {
      await open(tester, app, role: role);
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
    }
    handle.dispose();
  });

  testWidgets('student: a quiz is shown in the website\'s order and handed in with the picks as the server expects them', (tester) async {
    await open(tester, const StudentApp());
    expect(find.text('Hi Sadia! 👋'), findsOneWidget);
    await tester.tap(find.text('Quiz 1'));
    await tester.pumpAndSettle();
    expect(sent('startQuiz').single['args'], [1, 13, 5]); // opening it starts the clock
    final item = rows(rows(sample()['modules'])[0]['items'])[2];
    final order = quizOrder(item, 5);
    final first = order.questions.first;
    expect(tester.getTopLeft(find.text('Question $first?')).dy, lessThan(tester.getTopLeft(find.text('Question ${order.questions[1]}?')).dy));
    await tester.tap(find.text('c$first')); // option index 2 of that question, wherever it is drawn
    await tester.pump();
    await press(tester, find.text('Submit answers'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400)); // the button keeps spinning while the question is open, so "settled" never comes
    expect(find.text('2 question(s) not answered. Submit anyway?'), findsOneWidget);
    await tester.tap(find.text('Submit'));
    await tester.pump(const Duration(milliseconds: 300));
    final picks = (sent('submitQuiz').single['args'] as List)[6] as List;
    expect(picks, [for (var q = 0; q < 3; q++) q == first ? 2 : null]);
    expect(find.textContaining('Answers handed in'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('teacher: only their own batch; a long register has page controls; a tap shows at once and is sent', (tester) async {
    final handle = tester.ensureSemantics();
    await open(tester, const TeacherApp(), role: 'teacher');
    expect(find.text('Batch A'), findsWidgets);
    expect(find.text('Batch B'), findsNothing); // another teacher's
    expect(find.text('1 answers to mark'), findsOneWidget); // Student 7's is already marked
    await tester.tap(find.byType(TabItem).at(1));
    await tester.pumpAndSettle();
    expect(find.text('1–20 of 40'), findsOneWidget);
    expect(find.text('Student 21'), findsNothing);
    expect(find.text('Absent'), findsNWidgets(2)); // 6 and 9
    await tester.tap(find.text('Student 1'));
    await tester.pump();
    expect(find.text('Absent'), findsNWidgets(3)); // flipped before any answer from the server
    expect(sent('toggleAttendance').single['args'], [1, today]);
    await press(tester, find.bySemanticsLabel('Page 2'));
    await tester.pumpAndSettle();
    expect(find.text('21–40 of 40'), findsOneWidget);
    expect(find.text('Student 21'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    handle.dispose();
  });

  testWidgets('institution: who owes is paged; a payment and a new student are sent as the website sends them', (tester) async {
    await open(tester, const InstituteApp(), role: 'owner');
    expect(find.text("Tanvir's Physics Care"), findsOneWidget);
    expect(find.text('৳33,000'), findsOneWidget); // 22 students × ৳1,500 due
    await tester.tap(find.byType(TabItem).at(1));
    await tester.pumpAndSettle();
    expect(find.text('1–20 of 22'), findsOneWidget);
    await tester.tap(find.text('Student 2'));
    await tester.pumpAndSettle();
    expect(find.text('Record ৳1,500 paid by Student 2?'), findsOneWidget);
    await tester.tap(find.text('bKash'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('payFee').single['args'], [2, 'bkash']);
    await tester.pump(const Duration(seconds: 1)); // the "will be sent later" note at the bottom slides in…
    await tester.pump(const Duration(seconds: 5)); // …and goes away again
    await tester.pumpAndSettle();

    await tester.tap(find.byType(TabItem).at(2));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'student 4');
    await tester.pumpAndSettle();
    expect(find.text('7 students'), findsOneWidget); // Student 4 and 40–45
    await tester.tap(find.text('Add student'));
    await tester.pumpAndSettle();
    await press(tester, find.text('Enrol student'));
    await tester.pumpAndSettle();
    expect(find.text("Enter the student's name."), findsOneWidget);
    expect(find.text('Choose male or female.'), findsOneWidget);
    expect(sent('addStudent'), isEmpty);
    final boxes = find.byType(TextField);
    for (final (i, v) in ['Nadia Islam', 'nadia@gmail.com', 'Mr Islam', 's3@gmail.com', '01712345678'].indexed) {
      await tester.enterText(boxes.at(i), v);
    }
    await press(tester, find.text('Female'));
    await press(tester, find.text('Enrol student'));
    await tester.pumpAndSettle();
    expect(find.text('This Gmail belongs to a student, not a guardian.'), findsOneWidget); // the same rule as the website
    await tester.enterText(boxes.at(3), 'islam@gmail.com');
    await press(tester, find.text('Enrol student'));
    await tester.pump(const Duration(milliseconds: 300));
    final input = (sent('addStudent').single['args'] as List).single as Map;
    expect([input['name'], input['guardianEmail'], input['gender'], input['batch'], input['mode'], input['feePaid']], ['Nadia Islam', 'islam@gmail.com', 'female', 'Batch A', 'offline', false]);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('guardian: picks a child, books a free meeting slot, writes to the teacher', (tester) async {
    await open(tester, const GuardianApp(), role: 'guardian');
    expect(find.text('Sadia Akter Chowdhury'), findsOneWidget);
    await press(tester, find.text('Book'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('bookMeeting').single['args'], [31, 5]);
    await tester.tap(find.byType(TabItem).at(2));
    await tester.pumpAndSettle();
    expect(find.text('Yes, at 5 pm.'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '  Thank you  ');
    await tester.pump();
    await press(tester, find.text('Send'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('sendParentMessage').single['args'], [5, 'Thank you']);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('long lists: hidden controls for a short list; changing the page size keeps the first row on screen', (tester) async {
    final handle = tester.ensureSemantics();
    await open(
      tester,
      Scaffold(
        body: SingleChildScrollView(
          child: Paged(items: List.generate(9, (i) => i), row: (i) => Text('row $i')),
        ),
      ),
    );
    expect(find.text('row 8'), findsOneWidget);
    expect(find.byType(DropdownButton<int>), findsNothing);
    tester.view.physicalSize = const Size(600, 4000);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: Paged(items: List.generate(237, (i) => i), row: (i) => Text('row $i')),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('1–20 of 237'), findsOneWidget);
    expect(find.bySemanticsLabel('Page 3'), findsNothing); // 12 pages: only the first, the last and the neighbours are offered
    await tester.tap(find.bySemanticsLabel('Page 2'));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Page 3'));
    await tester.pumpAndSettle();
    expect(find.text('41–60 of 237'), findsOneWidget);
    await tester.tap(find.byType(DropdownButton<int>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('50').last);
    await tester.pumpAndSettle();
    expect(find.text('1–50 of 237'), findsOneWidget); // row 40 is on this page
    expect(find.text('row 40'), findsOneWidget);
    expect(store.pageSize, 50); // remembered for every list
    handle.dispose();
  });

  testWidgets('login: find the institute first; then Gmail, password rule and code, one step at a time', (tester) async {
    lang.set('en');
    store.fake(null, null);
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(theme: classbariTheme(Brightness.light), home: const LoginScreen()));
    await tester.pumpAndSettle(const Duration(milliseconds: 400));
    expect(find.text('Find your institute'), findsWidgets);
    expect(find.text('No institute found. Check the spelling, or ask your institute for its code.'), findsOneWidget); // no server in tests
    store.setInstitute({'id': '00000000-0000-4000-8000-000000000000', 'name': 'Physics Care', 'code': 'K7QM2P'});
    await tester.pumpAndSettle();
    expect(find.text('Physics Care'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'sadia@gmail.com');
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('sadia@gmail.com'), findsOneWidget);
    await tester.tap(find.text('First time here? Create your password'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).at(0), 'weakpass');
    await tester.enterText(find.byType(TextField).at(1), 'weakpass');
    await press(tester, find.text('Send verification code'));
    await tester.pumpAndSettle();
    expect(find.text('Use at least 8 characters, with a capital letter, a small letter, a number and a symbol (like ! or @).'), findsNWidgets(2)); // the hint and the error
    expect(tester.takeException(), isNull);
  });

  testWidgets('AI chat: saved chats sit in topic folders and can be searched; answers keep their formatting', (tester) async {
    SharedPreferences.setMockInitialValues({
      'classbari-ai-chats-5': jsonEncode([
        {
          'id': 1,
          'title': "Newton's second law",
          'topic': 'physics',
          'msgs': [
            {'role': 'user', 'content': 'Explain it'},
            {'role': 'assistant', 'content': '## Law\n**Force** is `F = ma`.\n- mass\n- acceleration\n```\nF = m * a\n```'},
          ],
        },
        {
          'id': 2,
          'title': 'সমাস কাকে বলে',
          'topic': 'bangla',
          'msgs': [
            {'role': 'user', 'content': 'সমাস কাকে বলে'},
          ],
        },
      ]),
    });
    store.prefs = await SharedPreferences.getInstance();
    await open(tester, const AiChatApp());
    await tester.pumpAndSettle();
    expect(find.text('Hi Sadia, what are we learning today?'), findsOneWidget);
    await tester.tap(find.byTooltip('Chats'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Physics'), findsOneWidget);
    expect(find.textContaining('Bangla'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Search chats'), 'সমাস');
    await tester.pumpAndSettle();
    expect(find.text("Newton's second law"), findsNothing);
    await tester.enterText(find.widgetWithText(TextField, 'Search chats'), 'force');
    await tester.pumpAndSettle();
    await tester.tap(find.text("Newton's second law"));
    await tester.pumpAndSettle();
    expect(find.text('F = m * a'), findsOneWidget); // the code block
    expect(find.text('Copy'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

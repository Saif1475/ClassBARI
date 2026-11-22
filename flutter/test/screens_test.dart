// Every app's screens are opened with sample data, in both languages, light and dark, on a small phone: nothing may
// overflow or crash, long lists get page controls, and each button sends the same action the website sends.
// (No server here: a change stays in the queue, where the test reads it.)
import 'dart:convert';
import 'dart:io';

import 'package:classbari/screens/ai_chat.dart';
import 'package:classbari/screens/guardian.dart';
import 'package:classbari/screens/institute.dart';
import 'package:classbari/config.dart';
import 'package:classbari/screens/login.dart';
import 'package:classbari/screens/settings.dart';
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
Future<void> open(WidgetTester tester, Widget app, {String code = 'en', bool dark = false, String role = 'student', double letters = 1}) async {
  tester.view.physicalSize = const Size(320, 640);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  tester.platformDispatcher.textScaleFactorTestValue = letters; // Settings → Text size
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
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
      for (final (app, role, tabs) in [(const StudentApp(), 'student', 4), (const GuardianApp(), 'guardian', 4), (const TeacherApp(), 'teacher', 4), (const InstituteApp(), 'owner', 4)]) {
        await open(tester, app, code: code, dark: dark, role: role, letters: dark ? 1.3 : 1); // the dark run also with the biggest letters (130%)
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
    expect(find.textContaining('Chapter 1: Motion'), findsWidgets); // its coloured card on the dashboard
    await tester.tap(find.byType(TabItem).at(1)); // To Do: what is due, soonest first
    await tester.pumpAndSettle();
    expect(find.text('DUE SOON'), findsOneWidget);
    await tester.tap(find.text('Quiz 1'));
    await tester.pumpAndSettle();
    expect(find.text('Not submitted'), findsOneWidget);
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
    await tester.tap(find.text('Batch A').last); // the batch's card (the first is the line under the tab's name)
    await tester.pumpAndSettle();
    await tester.tap(find.text('Take attendance'));
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
    expect(find.text('7 STUDENTS'), findsOneWidget); // Student 4 and 40–45
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
    expect(find.text('Sadia Akter Chowdhury'), findsWidgets); // the page's heading, and under the tab's name
    await press(tester, find.text('Book'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('bookMeeting').single['args'], [31, 5]);
    await tester.tap(find.byType(TabItem).at(3));
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
    // The drop box: closed at first; the arrow drops the list down, a press elsewhere closes it again.
    expect(find.textContaining('No institute found'), findsNothing);
    await tester.tap(find.byTooltip('Find your institute'));
    await tester.pumpAndSettle();
    expect(find.text('No institute found. Check the spelling, or ask your institute for its code.'), findsOneWidget); // no server in tests
    await tester.tapAt(const Offset(160, 880));
    await tester.pumpAndSettle();
    expect(find.textContaining('No institute found'), findsNothing);
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

  testWidgets('find your institute: the box drops the list down, typing narrows it, a press picks the institute', (tester) async {
    final handle = tester.ensureSemantics();
    lang.set('en');
    store.fake(null, null);
    store.setInstitute(null);
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final all = [
      for (final (name, code) in [('Physics Care', 'K7QM2P'), ('Tanvir Academy of Science and Mathematics, Mirpur Branch', 'ABC234'), ('গণিত ঘর', 'XYZ789')]) {'id': code, 'name': name, 'code': code},
    ];
    final asked = <String>[];
    Future<List<Json>> find_(String term) async {
      asked.add(term);
      return all.where((i) => '${i['name']}${i['code']}'.toLowerCase().contains(term.toLowerCase())).toList();
    }

    await tester.pumpWidget(
      MaterialApp(
        theme: classbariTheme(Brightness.light),
        home: Scaffold(
          body: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: InstitutePicker(find: find_),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Physics Care'), findsNothing); // closed until the box is pressed
    await tester.tap(find.byType(TextField));
    await tester.pumpAndSettle();
    expect(find.text('Physics Care'), findsOneWidget);
    // A long list scrolls inside the box (here the long name takes most of it).
    await tester.scrollUntilVisible(
      find.text('গণিত ঘর'),
      100,
      scrollable: find.descendant(of: find.byType(ListView), matching: find.byType(Scrollable)),
    );
    expect(find.text('গণিত ঘর'), findsOneWidget);
    expect(drawingError(tester), isNull); // the long name wraps beside its code
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await tester.enterText(find.byType(TextField), 'abc234');
    await tester.pumpAndSettle(const Duration(milliseconds: 400));
    expect(asked.last, 'abc234');
    expect(find.text('Physics Care'), findsNothing);
    await tester.tap(find.textContaining('Tanvir Academy'));
    await tester.pumpAndSettle();
    expect(store.institute?['code'], 'ABC234');
    store.setInstitute(null);
    await tester.pumpWidget(const SizedBox());
    handle.dispose();
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
    expect(find.textContaining('Physics'), findsWidgets); // its folder in the side panel (and its chip on the page behind)
    expect(find.textContaining('Bangla'), findsWidgets);
    expect(find.text("Newton's second law"), findsOneWidget); // under "Recent chats"
    await tester.tap(find.text('Physics').last); // open the folder: the chat is listed inside it too
    await tester.pumpAndSettle();
    expect(find.text("Newton's second law"), findsNWidgets(2));
    await tester.enterText(find.widgetWithText(TextField, 'Search chats'), 'সমাস');
    await tester.pumpAndSettle();
    expect(find.text("Newton's second law"), findsNothing);
    await tester.enterText(find.widgetWithText(TextField, 'Search chats'), 'force');
    await tester.pumpAndSettle();
    await tester.tap(find.text("Newton's second law"));
    await tester.pumpAndSettle();
    expect(find.text('F = m * a'), findsOneWidget); // the code block
    expect(find.byTooltip('Copy'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  // ---- Settings ----------------------------------------------------------------------------------------------------
  AiSettings ai({VoidCallback? onDeleteAll, int Function()? chats}) => AiSettings(
    models: [
      {'id': 'a', 'label': 'Model A', 'pack': 150},
      {'id': 'b', 'label': 'Model B', 'pack': 400},
      {'id': 'c', 'label': 'Model C', 'pack': 800, 'locked': true},
    ],
    pack: 400,
    left: 62,
    resetsAt: inDays(0),
    chats: chats ?? () => 3,
    onDeleteAll: onDeleteAll ?? () {},
  );

  test('the version shown in Settings is the one in pubspec.yaml', () {
    expect(File('pubspec.yaml').readAsStringSync(), contains('\nversion: $kVersion+'));
  });

  for (final (code, dark) in [('en', false), ('bn', true)]) {
    testWidgets('settings: the whole page, with the AI part, fits a small phone ($code${dark ? ', dark' : ''})', (tester) async {
      final handle = tester.ensureSemantics();
      await open(
        tester,
        SettingsScreen(details: const [('Name', 'Sadia Akter Chowdhury'), ('Batch', 'Batch A')], note: 'To change these, ask your institute.', ai: ai()),
        code: code,
        dark: dark,
        letters: dark ? 1.3 : 1, // the dark run also with the biggest letters (130%)
      );
      await tester.pumpAndSettle();
      final page = find.byType(Scrollable).hitTestable().first;
      for (var i = 0; i < 12; i++) {
        expect(drawingError(tester), isNull, reason: 'after $i scrolls');
        await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
        await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
        await expectLater(tester, meetsGuideline(textContrastGuideline));
        await tester.drag(page, const Offset(0, -400));
        await tester.pumpAndSettle();
      }
      expect(find.text(t('app.logOut')), findsOneWidget); // the end of the page was reached
      await tester.pumpWidget(const SizedBox());
      handle.dispose();
    });
  }

  testWidgets('settings: each choice is kept on the phone; clearing the chats asks first', (tester) async {
    var cleared = 0;
    await open(
      tester,
      SettingsScreen(
        ai: ai(onDeleteAll: () => cleared++, chats: () => cleared > 0 ? 0 : 3),
      ),
    );
    expect(find.text('Model C'), findsNothing); // a bigger pack's model can't be picked
    await press(tester, find.text('Model B'));
    expect(store.aiModel, 'b');
    await press(tester, find.text('Always Bangla'));
    await press(tester, find.text('Short'));
    expect(store.aiPrefs, {'lang': 'bn', 'length': 'short'});
    await press(tester, find.text('Same as my question'));
    expect(store.aiPrefs, {'length': 'short'});
    await press(tester, find.text('Normal'));
    expect(store.aiPrefs, isEmpty);

    await press(tester, find.text('Delete all chats'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(cleared, 0);
    await press(tester, find.text('Delete all chats'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete all chats').last); // the button of the "are you sure?" box
    await tester.pumpAndSettle();
    expect(cleared, 1);
    await tester.drag(find.byType(Scrollable).hitTestable().first, const Offset(0, 200)); // the count sits just above the row that went away
    await tester.pumpAndSettle();
    expect(find.text('0 chats on this device'), findsOneWidget);

    expect(store.sky, isTrue); // nothing chosen yet: by profile (the sample student is a girl)
    await press(tester, find.text('Green'));
    expect(store.sky, isFalse);
    expect(store.themeMode, 'system');
    await press(tester, find.text('Dark'));
    expect(store.themeMode, 'dark');
    await press(tester, find.text('Same as phone'));
    expect(store.themeMode, 'system');
    await tester.scrollUntilVisible(find.byType(Slider), 150, scrollable: find.byType(Scrollable).hitTestable().first);
    await tester.pumpAndSettle();
    await tester.drag(find.byType(Slider), const Offset(400, 0)); // the text-size slider, pulled to its big end
    expect(store.textSize, 1.3);
    await tester.drag(find.byType(Slider), const Offset(-400, 0));
    await tester.pumpAndSettle();
    expect(store.textSize, 0.9);
    await press(tester, find.text('বাংলা'));
    await tester.pumpAndSettle();
    expect(lang.code, 'bn');
    expect(find.text('সেটিংস'), findsOneWidget); // the page itself changed language
    expect(tester.takeException(), isNull);
  });

  testWidgets('settings: a weak or mistyped new password is refused before anything is sent', (tester) async {
    await open(tester, const Scaffold(body: SingleChildScrollView(child: ChangePassword())));
    final boxes = find.descendant(of: find.byType(PasswordField), matching: find.byType(TextField));
    await tester.enterText(boxes.at(0), 'weak');
    await tester.tap(find.text('Change password'));
    await tester.pump();
    expect(find.text(t('auth.passwordRule')), findsOneWidget);
    await tester.enterText(boxes.at(0), 'Strong#Pass1');
    await tester.enterText(boxes.at(1), 'Strong#Pass2');
    await tester.tap(find.text('Change password'));
    await tester.pump();
    expect(find.text("The two passwords don't match."), findsOneWidget);
  });

  testWidgets('settings, staff: a wrong mobile number is refused; a right one is sent as the website sends it', (tester) async {
    await open(
      tester,
      const Scaffold(body: SingleChildScrollView(child: StaffProfile())),
      role: 'teacher',
    );
    expect(find.widgetWithText(TextField, 'Mina Miss'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Mobile number'), '12345');
    await tester.tap(find.text('Save'));
    await tester.pump();
    expect(find.text(t('teacher.phoneInvalid')), findsOneWidget);
    expect(sent('updateStaffProfile'), isEmpty);
    await tester.enterText(find.widgetWithText(TextField, 'Name'), ' Mina Akter ');
    await tester.enterText(find.widgetWithText(TextField, 'Mobile number'), '01711000002');
    await tester.tap(find.text('Save'));
    await tester.pump();
    expect(sent('updateStaffProfile').single['args'], ['Mina Miss', 'Mina Akter', '01711000002']);
  });

  testWidgets('the side menu and the AI app\'s gear both open Settings', (tester) async {
    final handle = tester.ensureSemantics();
    await open(tester, const StudentApp());
    await tester.tap(find.byType(Avatar).first); // the person's initial in the top bar opens the menu
    await tester.pumpAndSettle();
    await tester.tap(find.text('Settings'));
    await tester.pumpAndSettle();
    expect(find.text('Sadia Akter Chowdhury'), findsWidgets); // their details, read-only
    expect(find.text('Look'), findsOneWidget);
    expect(find.text('Rows per page'), findsNothing); // only the staff apps have long lists

    await tester.pumpWidget(const SizedBox()); // a fresh start: the Settings page above is closed with its app
    await open(tester, const AiChatApp());
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Chats'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Settings'));
    await tester.pumpAndSettle();
    expect(find.text('How the AI answers'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    handle.dispose();
  });
}

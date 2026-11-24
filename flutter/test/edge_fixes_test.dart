// Edge cases found in review: each test draws or sends what used to break.
import 'dart:convert';
import 'dart:io';

import 'package:classbari/main.dart' show Root;
import 'package:classbari/push.dart';
import 'package:classbari/screens/guardian.dart';
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

  testWidgets('guardian child chips show full names, so two "Md." children differ; greetings skip "Md."', (tester) async {
    store.fake({'parentChildren': [5, 6], 'students': [{'id': 5, 'name': 'Md. Rahim Uddin'}, {'id': 6, 'name': 'Md. Karim Uddin'}]}, 'guardian');
    await show(tester, const Scaffold(body: ChildChips()));
    expect(find.text('Md. Rahim Uddin'), findsOneWidget);
    expect(find.text('Md. Karim Uddin'), findsOneWidget);
    expect([firstName('Md. Rahim Uddin'), firstName('Mst Ayesha'), firstName('Rahim Uddin'), firstName('')], ['Rahim', 'Ayesha', 'Rahim', '']);
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
      await tester.tap(find.text(t('quiz.start')));
      await tester.pump();
      await tester.pumpWidget(const SizedBox());
    }
    expect(sent('startQuiz').length, 1);
  });

  testWidgets('quiz: opening it does not start the clock; Start counts down and hands it in with the phone\'s own seconds', (tester) async {
    store.fake({
      'meId': 5,
      'students': [{'id': 5, 'name': 'Rahim', 'batch': 'A'}],
      'modules': [
        {'id': 1, 'title': 'Ch', 'batch': 'A', 'published': true, 'items': [
          {'id': 3, 'kind': 'quiz', 'title': 'Quiz', 'timeLimitMin': 1, 'questions': [{'q': 'Q?', 'options': ['a', 'b'], 'answer': 0}]},
        ]},
      ],
    }, 'student');
    await show(tester, const LessonScreen(moduleId: 1, itemId: 3));
    await tester.pump(const Duration(seconds: 5));
    expect(sent('startQuiz'), isEmpty); // looking at it on Monday doesn't count against Tuesday's attempt
    await tester.tap(find.text(t('quiz.start')));
    await tester.pump();
    expect(sent('startQuiz').length, 1);
    expect(find.textContaining(t('quiz.timeLeft')), findsOneWidget);
    for (var i = 0; i < 61; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    final args = sent('submitQuiz').single['args'] as List; // handed in by itself when time ran out, no question asked
    expect(args[7], greaterThanOrEqualTo(60));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('quiz: coming back after leaving carries on the first countdown, so the server sees the real time, not "offline"', (tester) async {
    store.fake({
      'meId': 5,
      'students': [{'id': 5, 'name': 'Rahim', 'batch': 'A'}],
      'modules': [
        {'id': 1, 'title': 'Ch', 'batch': 'A', 'published': true, 'items': [
          {'id': 3, 'kind': 'quiz', 'title': 'Quiz', 'timeLimitMin': 10, 'questions': [{'q': 'Q?', 'options': ['a', 'b'], 'answer': 0}]},
        ]},
      ],
    }, 'student');
    await show(tester, const LessonScreen(moduleId: 1, itemId: 3));
    await tester.tap(find.text(t('quiz.start')));
    await tester.pump();
    await tester.pumpWidget(const SizedBox()); // backs out of the lesson
    // 30 minutes pass (the test clock doesn't move DateTime.now, so the saved first Start is moved back instead)
    store.prefs.setInt('instanton-quiz-1-3-5', DateTime.now().millisecondsSinceEpoch - 30 * 60 * 1000);
    await show(tester, const LessonScreen(moduleId: 1, itemId: 3));
    await tester.tap(find.text(t('quiz.start')));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    final args = sent('submitQuiz').single['args'] as List; // no fresh 10:00: time was already up, handed in at once
    expect(args[7], greaterThanOrEqualTo(30 * 60));
    await tester.pumpWidget(const SizedBox());
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

  test('an older download arriving after a newer save does not undo it', () {
    store.adoptForTest({'version': 1000001, 'state': {'present': true}});
    store.adoptForTest({'version': 1000000, 'state': {'present': false}}); // the 20-second refresh that started first
    expect(store.state, {'present': true});
    store.adoptForTest({'version': 1000002, 'state': {'present': false}});
    expect(store.state, {'present': false});
  });

  test('an answer that arrives after a sign-out is not kept for the next person', () async {
    store.fake({'meId': 1}, 'teacher');
    final since = store.signOuts; // a download starts
    try {
      await store.signOut();
    } catch (_) {
      // no Supabase in tests: the forgetting before it is what counts
    }
    store.adoptForTest({'version': 1000003, 'role': 'teacher', 'state': {'meId': 1}}, since); // its answer arrives
    expect(store.state, isNull);
    expect(store.role, isNull);
    expect(store.prefs.getString('classbari-data'), isNull);
  });

  test('logging out with changes still not sent asks first, and "no" keeps them', () async {
    store.fake({'meId': 1}, 'teacher');
    await store.act('toggleAttendance', [5, '2026-11-23']); // no internet (no server in tests): it waits
    int? asked;
    await store.signOut(ask: (n) async {
      asked = n;
      return false;
    });
    expect(asked, 1);
    expect(store.waiting.length, 1);
    expect(store.prefs.getString('classbari-outbox'), contains('toggleAttendance'));
    try {
      await store.signOut(ask: (_) async => true);
    } catch (_) {
      // no Supabase in tests: the forgetting before it is what counts
    }
    expect(store.waiting, isEmpty);
  });

  testWidgets('"Use another account" also asks before throwing away changes still not sent', (tester) async {
    store.fake({'meId': 1}, 'teacher');
    await store.act('toggleAttendance', [5, '2026-11-23']); // marked offline; then the institute removed this teacher
    store.status = Status.noAccess;
    await show(tester, const Root());
    await tester.tap(find.text(t('auth.tryOther')));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text(t('app.logOutWaiting', [1])), findsOneWidget);
    await tester.tap(find.text(t('app.cancel')).last);
    await tester.pump(const Duration(milliseconds: 300));
    expect(store.waiting.length, 1);
    await tester.pumpWidget(const SizedBox());
  });

  test('a refused change drops only itself; not sent yet stays queued', () {
    expect([200, 400, 403, 413, 401, 429, 500, 503].map(afterAnswer), ['sent', 'drop', 'drop', 'drop', 'login', 'wait', 'wait', 'wait']);
  });

  test('the invoice shows the discount the month was charged with, and earlier dues, so its lines add up', () {
    final batch = <String, dynamic>{'fee': 1200, 'lateFine': 0};
    final dec = invoiceOf({'id': 1, 'feeDue': 1200, 'discount': 200, 'chargedDiscount': 0}, batch, const [], '2026-12'); // scholarship set after the charge
    expect([dec.carried, dec.fee, dec.discount, dec.balance], [0, 1200, 0, 1200]);
    final jan = invoiceOf({'id': 1, 'feeDue': 2200, 'discount': 200, 'chargedDiscount': 200}, batch, const [], '2027-01'); // December still unpaid
    expect([jan.carried, jan.fee, jan.discount, jan.balance], [1200, 1200, 200, 2200]);
  });

  testWidgets('logging out offline still makes Google forget the token, and tries again until it works', (tester) async {
    var calls = 0, online = false;
    deleteFcmToken = () async {
      calls++;
      if (!online) throw Exception('SERVICE_NOT_AVAILABLE');
    };
    pushReadyForTest = true;
    pushTokenForTest = 'fcm-token-of-the-last-guardian';
    await forgetPush(); // the server DELETE fails here too (no login in tests), as it does offline
    expect(calls, 1); // used to be skipped whenever the DELETE failed
    expect(store.prefs.getBool('instanton-push-forget'), isTrue); // kept for the next app start
    online = true;
    await tester.pump(const Duration(minutes: 1));
    expect(calls, 2);
    expect(store.prefs.getBool('instanton-push-forget'), isNull);
    pushReadyForTest = false;
  });

  testWidgets('offline from app start to logout: Google still forgets the token, and a stale retry does nothing', (tester) async {
    var calls = 0;
    deleteFcmToken = () async {
      calls++;
      throw Exception('SERVICE_NOT_AVAILABLE');
    };
    pushReadyForTest = true;
    await registerPush(); // registered on an earlier day; this run's register fails (no Firebase here, as offline), so no token is known
    await forgetPush();
    expect(calls, 1); // used to stop at "no token" and never ask Google
    expect(store.prefs.getBool('instanton-push-forget'), isTrue);
    await store.prefs.remove('instanton-push-forget'); // another try worked meanwhile and the next person registered
    await tester.pump(const Duration(minutes: 1));
    expect(calls, 1); // the stale retry must not delete the next person's token
    await forgetPush(); // the second call after a logout (leftScreens) has nothing left to forget
    expect(calls, 1);
    pushReadyForTest = false;
  });
  test('the same settings give an equal theme, so a store change does not restart the app-wide theme animation', () {
    expect(classbariTheme(Brightness.light, sky: true, glass: 0.5) == classbariTheme(Brightness.light, sky: true, glass: 0.5), isTrue);
    expect(classbariTheme(Brightness.dark) == classbariTheme(Brightness.light), isFalse);
  });
}

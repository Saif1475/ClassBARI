// The owner's extra pages: each draws on a small phone, an expense is sent as the website sends it, and payroll adds up
// as on the website.
import 'dart:convert';
import 'dart:io';

import 'package:classbari/screens/institute_more.dart';
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

Json sample() {
  final now = DateTime.now().toUtc().toIso8601String(), month = dayKey().substring(0, 7);
  return {
    'teacherName': 'Owner Sir',
    'students': [
      {'id': 1, 'name': 'Rafi', 'email': 'r@gmail.com', 'guardianName': 'G', 'guardianEmail': 'g@gmail.com', 'phone': '01711000001', 'batch': 'Batch A', 'feeDue': 0, 'gender': 'male'},
    ],
    'batches': [
      {'id': 'a', 'name': 'Batch A', 'teacher': 'Mina Miss', 'days': 'Sat', 'classDays': [6], 'fee': 1500},
    ],
    'payments': [
      {'id': 1, 'studentId': 1, 'batch': 'Batch A', 'amount': 2000, 'at': now, 'method': 'cash'},
    ],
    'staff': [
      {'name': 'Mina Miss', 'phone': '01711000002', 'salary': 1000, 'share': 10},
      {'name': 'Owner Sir', 'phone': '01711000003'},
    ],
    'staffPayments': [
      {'id': 1, 'name': 'Mina Miss', 'month': month, 'amount': 300, 'at': now},
    ],
    'staffLeave': [
      {'id': 7, 'name': 'Mina Miss', 'from': dayKey(), 'to': dayKey(), 'reason': 'Ill', 'status': 'pending'},
    ],
    'expenses': [
      {'id': 3, 'date': dayKey(), 'category': 'rent', 'amount': 500, 'note': ''},
    ],
    'admissions': [
      {'id': 9, 'name': 'Nila', 'guardian': 'Mr N', 'phone': '01711000004', 'wants': 'Batch A', 'stage': 'enquiry', 'at': now},
    ],
  };
}

void main() {
  setUpAll(() async {
    lang.use(read('assets/gen/en.json'), read('assets/gen/bn.json'));
    await initializeDateFormatting('en_GB');
  });

  test('payroll and profit add up as on the website', () {
    final mina = payroll(sample(), dayKey().substring(0, 7)).first;
    expect([mina.collected, mina.payable, mina.paid, mina.balance], [2000, 1200, 300, 900]); // ৳1,000 + 10% of ৳2,000
    final pl = profitAndLoss(dayKey().substring(0, 7), sample());
    expect([pl.income, pl.salaries, pl.other, pl.profit], [2000, 300, 500, 1200]);
  });

  test('payroll: a payment stays with the teacher saved on it after the batch moves to another teacher', () {
    final at = DateTime.now().toUtc().toIso8601String();
    final Json s = {
      'staff': [{'name': 'A', 'salary': 0, 'share': 40}, {'name': 'B', 'salary': 0, 'share': 40}],
      'batches': [{'name': 'Physics', 'teacher': 'B'}],
      'payments': [{'batch': 'Physics', 'teacher': 'A', 'amount': 10000, 'at': at}, {'batch': 'Physics', 'amount': 500, 'at': at}], // the second is an older payment with no teacher saved
    };
    final r = payroll(s, dayKey().substring(0, 7));
    expect([r[0].collected, r[0].payable, r[1].collected], [10000, 4000, 500]);
  });

  test('profit and loss counts a payment in its local month, as payroll does', () {
    // Local times either side of midnight on 1 December: saved as UTC, one of them lands in the other month (on any machine not on UTC itself).
    final Json s = {
      'payments': [
        {'batch': 'Batch A', 'amount': 1000, 'at': DateTime(2026, 12, 1, 0, 30).toUtc().toIso8601String()},
        {'batch': 'Batch A', 'amount': 10, 'at': DateTime(2026, 11, 30, 23, 30).toUtc().toIso8601String()},
      ],
    };
    expect([profitAndLoss('2026-12', s).income, profitAndLoss('2026-11', s).income], [1000, 10]);
  });

  testWidgets('owner pages draw; an expense is sent as the website sends it', (tester) async {
    SharedPreferences.setMockInitialValues({});
    store.prefs = await SharedPreferences.getInstance();
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    store.fake(sample(), 'owner');
    for (final page in [const BatchesScreen(), const BatchForm(), const StudentScreen(id: 1), const StaffScreen(), const AdmissionsScreen(), const MoneyScreen()]) {
      await tester.pumpWidget(Live((context) => MaterialApp(theme: classbariTheme(Brightness.light), home: page)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: '$page');
    }

    final scroll = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(find.text('Electricity'), 150, scrollable: scroll);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Electricity'));
    await tester.pump();
    await tester.scrollUntilVisible(find.widgetWithText(TextField, 'Note'), 150, scrollable: scroll);
    await tester.enterText(find.widgetWithText(TextField, 'Amount (৳)'), '750');
    await tester.enterText(find.widgetWithText(TextField, 'Note'), 'Bulbs');
    await tester.scrollUntilVisible(find.text('Add expense'), 150, scrollable: scroll);
    await tester.tap(find.text('Add expense'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('addExpense').single['args'], [
      {'date': dayKey(), 'category': 'electricity', 'amount': 750, 'note': 'Bulbs'},
    ]);
    await tester.pump(const Duration(seconds: 6)); // the "will be sent later" note goes away
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('payroll: the Pay button goes away while a salary payment waits to send, so it is never paid twice', (tester) async {
    SharedPreferences.setMockInitialValues({});
    store.prefs = await SharedPreferences.getInstance();
    tester.view.physicalSize = const Size(400, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    store.fake(sample(), 'owner');
    await tester.pumpWidget(Live((context) => MaterialApp(theme: classbariTheme(Brightness.light), home: const StaffScreen())));
    await tester.pumpAndSettle();
    final pay = find.text('Mark paid ৳900');
    await tester.scrollUntilVisible(pay, 150, scrollable: find.byType(Scrollable).first);
    await tester.tap(pay);
    await tester.pump(const Duration(milliseconds: 500)); // the dialog opens (the busy spinner never settles)
    await tester.tap(find.descendant(of: find.byType(AlertDialog), matching: find.byType(FilledButton)));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('payStaff').single['args'], ['Mina Miss', 900]);
    expect(pay, findsNothing); // offline: store.state still says ৳900 owed, but the payment is already queued
    await tester.pump(const Duration(seconds: 6));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('a teacher who has left can be removed, but only once their batches have another teacher', (tester) async {
    SharedPreferences.setMockInitialValues({});
    store.prefs = await SharedPreferences.getInstance();
    tester.view.physicalSize = const Size(400, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    store.fake(sample(), 'owner');
    await tester.pumpWidget(Live((context) => MaterialApp(theme: classbariTheme(Brightness.light), home: const StaffScreen())));
    await tester.pumpAndSettle();
    Future<void> removeFrom(String salaryLine) async {
      await tester.tap(find.textContaining(salaryLine).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text(t('centre.remove')));
      await tester.pumpAndSettle();
    }
    await removeFrom('৳1,000'); // Mina Miss still teaches Batch A
    expect(find.text(t('centre.stillTeaches', ['Mina Miss'])), findsOneWidget);
    expect(sent('removeStaff'), isEmpty);
    tester.state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger)).clearSnackBars();
    await tester.pumpAndSettle();
    await removeFrom('${t('payroll.salary')}: ৳0'); // Owner Sir has no batch
    await tester.tap(find.descendant(of: find.byType(AlertDialog), matching: find.byType(FilledButton)));
    await tester.pumpAndSettle();
    expect(sent('removeStaff').single['args'], ['Owner Sir']);
    await tester.pump(const Duration(seconds: 6));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('adding a teacher whose name is taken says so (another letter case or spaces too)', (tester) async {
    SharedPreferences.setMockInitialValues({});
    store.prefs = await SharedPreferences.getInstance();
    tester.view.physicalSize = const Size(400, 2600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    store.fake(sample(), 'owner');
    await tester.pumpWidget(Live((context) => MaterialApp(theme: classbariTheme(Brightness.light), home: const StaffScreen())));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, t('centre.name')), ' mina miss ');
    await tester.enterText(find.widgetWithText(TextField, t('centre.phone')), '01711000009');
    await tester.enterText(find.widgetWithText(TextField, t('auth.email')), 'mina2@gmail.com');
    await tester.ensureVisible(find.text(t('centre.addTeacher')));
    await tester.tap(find.text(t('centre.addTeacher')));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text(t('centre.taken')), findsOneWidget);
    expect(sent('addStaff'), isEmpty);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('students from a file: say which column is which, and only the good rows are added', (tester) async {
    SharedPreferences.setMockInitialValues({});
    store.prefs = await SharedPreferences.getInstance();
    tester.view.physicalSize = const Size(400, 2600); // everything on one screen, so the menus open where they are
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    store.fake(sample(), 'owner');
    Future<void> open(Future<Json> Function(StudentFile f, String b, {List<String>? fields, bool? heads}) send) async {
      await tester.pumpWidget(
        Live(
          (context) => MaterialApp(
            theme: classbariTheme(Brightness.light),
            home: ImportStudentsScreen(pick: () async => (bytes: utf8.encode('a list'), type: 'text/csv'), send: send),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose file'));
      await tester.pumpAndSettle();
    }

    await open((f, b, {fields, heads}) async => {'error': 'scan'});
    expect(find.text("This PDF is a scan or a photo, so the app can't read it. Import it on the website: it reads scans and photos on your computer."), findsOneWidget);

    // A stand-in for the server: it guessed the two names the wrong way round and left the phone column out.
    const data = [
      ['Rafi', 'rafi@gmail.com', 'Karim', 'karim@gmail.com', '01711000001'],
      ['Sadia', 'sadia@yahoo.com', 'Rahima', 'rahima@gmail.com', '01711000002'],
    ];
    final asked = <List<String>?>[];
    await open((f, b, {fields, heads}) async {
      asked.add(fields);
      final now = fields ?? ['guardianName', 'email', 'name', 'guardianEmail', ''];
      final missing = ['name', 'email', 'guardianName', 'guardianEmail', 'phone'].where((k) => !now.contains(k)).toList();
      return {
        'columns': [
          for (final (i, h) in ['Naam', 'Mail', 'Abba', 'Abba mail', 'Phone no'].indexed)
            {
              'heading': h,
              'samples': [data[0][i], data[1][i]],
            },
        ],
        'heads': true,
        'fields': now,
        'missing': missing,
        'rows': missing.isNotEmpty
            ? []
            : [
                for (final (n, r) in data.indexed)
                  {
                    'line': n + 2,
                    'input': {
                      for (final (i, k) in now.indexed)
                        if (k.isNotEmpty) k: r[i],
                      'batch': b,
                    },
                    'problems': r[1].endsWith('@gmail.com') ? [] : ['gmailInvalid'],
                  },
              ],
      };
    });
    expect(find.text('Choose which column is: Guardian phone.'), findsOneWidget);
    expect(find.textContaining(RegExp(r'^Import \d')), findsNothing); // no Import button until every kind has its column
    expect(find.text('Rafi · Sadia'), findsOneWidget); // each column shows what it holds
    Future<void> choose(String now, String kind) async {
      await tester.tap(find.text(now));
      await tester.pumpAndSettle();
      await tester.tap(find.text(kind).last);
      await tester.pumpAndSettle();
    }

    await choose('Not used', 'Guardian phone');
    expect(find.text('Row 2: Karim'), findsOneWidget); // all there, but the names the wrong way round
    await choose('Guardian name', 'Student name'); // "Naam" is the student: "Abba" loses "Student name"
    expect(find.text('Choose which column is: Guardian name.'), findsOneWidget);
    await choose('Not used', 'Guardian name');
    expect(find.text('Row 2: Rafi'), findsOneWidget);
    expect(find.text('Enter a Gmail address (name@gmail.com).'), findsOneWidget); // Sadia's yahoo address
    expect(asked, [
      null,
      ['guardianName', 'email', 'name', 'guardianEmail', 'phone'],
      ['name', 'email', '', 'guardianEmail', 'phone'],
      ['name', 'email', 'guardianName', 'guardianEmail', 'phone'],
    ]);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Import 1 student'));
    await tester.pumpAndSettle();
    final args = [for (final e in sent('addStudent')) (e['args'] as List).first as Map];
    expect([for (final a in args) [a['name'], a['guardianName'], a['batch'], a['mode'], a['feePaid']]], [
      ['Rafi', 'Karim', 'Batch A', 'offline', false],
    ]);
    await tester.pump(const Duration(seconds: 6)); // the note at the bottom goes away
    await tester.pumpWidget(const SizedBox());
  });
}

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
}

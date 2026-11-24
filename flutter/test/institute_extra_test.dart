// The owner's routine, course shop, public page, plan and backup, and the AI chat's file reading: each sends what the
// website sends (src/components/teacher/tools/*.tsx, src/app/settings/page.tsx, src/components/student/AiChat.tsx).
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:classbari/screens/ai_chat.dart';
import 'package:classbari/screens/institute_more.dart';
import 'package:classbari/screens/settings.dart';
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

Json sample() => {
  'teacherName': 'Owner Sir',
  'students': [
    {'id': 1, 'name': 'Rafi', 'batch': 'Batch A', 'feeDue': 0, 'email': 'rafi@gmail.com'},
  ],
  'batches': [
    {'id': 'a', 'name': 'Batch A', 'teacher': 'Mina Miss', 'fee': 1500, 'public': true},
  ],
  'staff': [
    {'name': 'Mina Miss'},
  ],
  'routine': [
    {'id': 1, 'day': 6, 'start': '16:00', 'end': '17:30', 'batch': 'Batch A', 'teacher': 'Mina Miss', 'room': 'Room 1'},
    {'id': 2, 'day': 6, 'start': '17:00', 'end': '18:00', 'batch': 'Batch A', 'teacher': 'Other', 'room': 'room 1 '},
  ],
  'orders': [
    {
      'id': 5,
      'batchId': 'a',
      'price': 1200,
      'trxId': '9A1B2C',
      'status': 'pending',
      'at': DateTime.now().toUtc().toIso8601String(),
      'student': {'name': 'Nila', 'phone': '01711000004'},
    },
    // Rafi, already a student here, buys a second course with the same Gmail (written another way).
    {'id': 6, 'batchId': 'a', 'price': 1500, 'trxId': '9A1B2D', 'status': 'pending', 'at': DateTime.now().toUtc().toIso8601String(), 'student': {'name': 'Rafi', 'email': 'Ra.fi+2@gmail.com', 'phone': '01711000005'}},
  ],
  'coupons': [
    {'code': 'EID20', 'percent': 20, 'maxUses': 50, 'used': 3},
  ],
  'site': {'slug': 'owner', 'bio': '', 'bkash': '01711000009', 'published': true},
};

/// A zip with stored (not deflated) files, enough for unzip().
Uint8List zip(Map<String, String> files) {
  final body = BytesBuilder(), central = BytesBuilder();
  void u16(BytesBuilder b, List<int> ns) => b.add([
    for (final n in ns) ...[n & 255, n >> 8],
  ]);
  void u32(BytesBuilder b, List<int> ns) => b.add([
    for (final n in ns) ...[n & 255, (n >> 8) & 255, (n >> 16) & 255, n >> 24],
  ]);
  for (final e in files.entries) {
    final name = utf8.encode(e.key), data = utf8.encode(e.value), at = body.length;
    u32(body, [0x04034b50]);
    u16(body, [20, 0, 0, 0, 0]);
    u32(body, [0, data.length, data.length]);
    u16(body, [name.length, 0]);
    body
      ..add(name)
      ..add(data);
    u32(central, [0x02014b50]);
    u16(central, [20, 20, 0, 0, 0, 0]);
    u32(central, [0, data.length, data.length]);
    u16(central, [name.length, 0, 0, 0, 0]);
    u32(central, [0, at]);
    central.add(name);
  }
  final start = body.length, size = central.length;
  body.add(central.takeBytes());
  u32(body, [0x06054b50]);
  u16(body, [0, 0, files.length, files.length]);
  u32(body, [size, start]);
  u16(body, [0]);
  return body.takeBytes();
}

void main() {
  setUpAll(() async {
    lang.use(read('assets/gen/en.json'), read('assets/gen/bn.json'));
    await initializeDateFormatting('en_GB');
  });

  test('a double booking is found as on the website (same day, overlapping, same room)', () {
    final c = clashes(rows(sample()['routine']));
    expect(
      [c.single.a['id'], c.single.b['id'], c.single.why],
      [
        1,
        2,
        ['room', 'batch'],
      ],
    );
  });

  test('a teacher\'s clash check counts a colleague\'s slot in the same room, but not clashes among colleagues only', () {
    Json slot(int id, String start, String end, String teacher, String room, String batch) => {'id': id, 'day': 6, 'start': start, 'end': end, 'teacher': teacher, 'room': room, 'batch': batch};
    final s = [slot(1, '16:00', '17:30', 'Rahim', 'Room 1', 'HSC Physics'), slot(2, '16:30', '18:00', 'Karim', 'Room 1', 'SSC Chem'), slot(3, '16:00', '17:00', 'Rahim', 'Room 2', 'HSC Bio')];
    expect([for (final p in clashes(s, ['SSC Chem'])) [p.a['id'], p.b['id'], p.why]], [
      [1, 2, ['room']],
    ]);
  });

  test('a backup has the website\'s wrapper, and only such a file is restored', () {
    final text = backupText(sample(), DateTime.utc(2026, 1, 2));
    final b = jsonDecode(text) as Json;
    expect([b['app'], b['version'], b['savedAt'], (b['data'] as Map)['teacherName']], ['Instanton Campus', 1, '2026-01-02T00:00:00.000Z', 'Owner Sir']);
    const old = '{"app":"ClassBARI","data":{"students":[],"batches":[]}}'; // saved before the rename: still restores
    expect([isBackup(text), isBackup(old), isBackup('{"app":"Instanton Campus","data":{}}'), isBackup('nope')], [true, true, false, false]);
  });

  test('Word, Excel and text files are read into text as the website reads them', () {
    final docx = zip({'word/document.xml': '<w:p><w:r><w:t>Newton &amp; force</w:t></w:r></w:p><w:p><w:t xml:space="preserve">F = ma</w:t><w:tab/><w:t>x</w:t></w:p>'});
    expect(fileText('notes.docx', docx), 'Newton & force\nF = ma\tx');
    final xlsx = zip({
      'xl/sharedStrings.xml': '<sst><si><t>Name</t></si><si><t>Rafi</t></si></sst>',
      'xl/worksheets/sheet1.xml': '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>90</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row></sheetData>',
    });
    expect(fileText('marks.xlsx', xlsx), 'Name\t\t90\nRafi');
    expect(fileText('a.md', Uint8List.fromList(utf8.encode('  # Hi\u0000 '))), '# Hi');
    expect(fileText('book.pdf', Uint8List(0)), isNull);
  });

  testWidgets('owner pages draw; a slot, a coupon and an order are sent as the website sends them', (tester) async {
    SharedPreferences.setMockInitialValues({});
    store.prefs = await SharedPreferences.getInstance();
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    store.fake(sample(), 'owner');
    Future<void> show(Widget page) async {
      await tester.pumpWidget(Live((context) => MaterialApp(theme: classbariTheme(Brightness.light), home: page)));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: '$page');
    }

    for (final page in [
      const WebsiteScreen(),
      Screen(children: const [SeatBilling(), Backup()]),
    ]) {
      await show(page);
    }

    await show(const RoutineScreen());
    expect(find.textContaining('Clash on Sat:'), findsOneWidget);
    final scroll = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(find.text('Add to routine'), 150, scrollable: scroll);
    await tester.ensureVisible(find.text('Add to routine'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add to routine'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('addSlot').single['args'], [
      {'day': 6, 'start': '16:00', 'end': '17:30', 'batch': 'Batch A', 'teacher': 'Mina Miss', 'room': 'Room 1'},
    ]);

    await show(const ShopScreen());
    expect(find.textContaining("This Gmail is already Rafi's, a student in Batch A."), findsOneWidget); // no Confirm for it: only "Not received"
    expect(find.text('Payment received ✓'), findsOneWidget);
    await tester.tap(find.text('Payment received ✓'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('decideOrder').single['args'], [5, true]);
    tester.state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger)).clearSnackBars(); // "will be sent later" covers the page's foot
    await tester.pumpAndSettle();
    final shop = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(find.widgetWithText(TextField, 'Code'), 150, scrollable: shop);
    await tester.enterText(find.widgetWithText(TextField, 'Code'), ' eid10 ');
    await tester.scrollUntilVisible(find.text('Add coupon'), 150, scrollable: shop);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add coupon'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('addCoupon').single['args'], [
      {'code': 'eid10', 'percent': 20, 'maxUses': 50},
    ]);
    await tester.pump(const Duration(seconds: 6));
    await tester.pumpWidget(const SizedBox());
  });
}

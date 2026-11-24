// The institute owner's extra pages, as on the website: batches (new and settings), one student (edit, AI premium,
// remove), money (expenses, profit and the income report), teachers (attendance, payroll, leave), admissions, the class
// routine, the course shop (orders and coupons), the institute's public page, and adding many students from a file.
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../config.dart';
import '../icon.dart';
import '../icons.g.dart';
import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'ai_chat.dart' show packs;
import 'institute.dart' show NewStudent;

const subjects = ['Physics', 'Math', 'Chemistry', 'Biology', 'English']; // subjects in src/lib/mock-data.ts
const expenseKinds = ['rent', 'electricity', 'internet', 'stationery', 'marketing', 'other']; // MoneyTool's CATEGORIES
const stages = ['enquiry', 'called', 'visited', 'admitted', 'lost']; // AdmissionsTool's STAGES

String _month() => dayKey().substring(0, 7);
List<Json> get _staff => rows(store.state?['staff']);
String _said(bool saved, String ok) => saved ? ok : (store.status == Status.offline ? t('app.sentLater') : t('auth.syncFailed'));
String _label(String key) => t(key).replaceAll(' *', '');
num _num(TextEditingController c) => num.tryParse(c.text.trim()) ?? 0;

Future<String?> _pickDay(BuildContext context, String current) async {
  final now = DateTime.now();
  final d = await showDatePicker(context: context, initialDate: current.isEmpty ? now : toDate(current), firstDate: DateTime(now.year - 2), lastDate: DateTime(now.year + 2));
  return d == null ? null : dayKey(d);
}

// ---- the website's sums (src/lib/lms-views.ts and src/lib/centre.ts) -------------------------------------------------

/// The last six months, newest first (YYYY-MM).
List<String> lastMonths() {
  final now = DateTime.now();
  return [for (var i = 0; i < 6; i++) dayKey(DateTime(now.year, now.month - i, 1)).substring(0, 7)];
}

/// incomeByMonth: money received per month (key "YYYY-MM") and per month and batch ("YYYY-MM|batch").
Map<String, num> incomeByMonth(List<Json> payments, List<String> months, List<String> batchNames) {
  final cells = <String, num>{};
  for (final p in payments) {
    if (!batchNames.contains(p['batch']) || p['at'] is! String) continue;
    final m = dayKey(toDate(p['at'] as String)).substring(0, 7);
    if (!months.contains(m)) continue;
    final amount = (p['amount'] as num?) ?? 0;
    cells['$m|${p['batch']}'] = (cells['$m|${p['batch']}'] ?? 0) + amount;
    cells[m] = (cells[m] ?? 0) + amount;
  }
  return cells;
}

/// profitAndLoss: fees collected − staff pay − other costs, for one month.
({num income, num salaries, num other, num profit}) profitAndLoss(String month, Json? s) {
  num sum(Iterable<Json> list) => list.fold<num>(0, (n, x) => n + ((x['amount'] as num?) ?? 0));
  final income = sum(rows(s?['payments']).where((p) => p['at'] is String && dayKey(toDate(p['at'] as String)).startsWith(month))); // 'at' is a UTC time: count it in its local month, as payroll does
  final salaries = sum(rows(s?['staffPayments']).where((p) => p['month'] == month));
  final other = sum(rows(s?['expenses']).where((e) => '${e['date']}'.startsWith(month)));
  return (income: income, salaries: salaries, other: other, profit: income - salaries - other);
}

/// payroll: what each teacher is owed this month (salary + their share of their batches' fees) and what is left to pay.
List<({String name, num salary, num share, num collected, num payable, num paid, num balance})> payroll(Json? s, String month) {
  // A payment counts for the teacher saved on it (who taught the batch then); older payments without one use the batch's teacher now.
  final teacherOf = {for (final b in rows(s?['batches'])) b['name']: b['teacher']};
  final byTeacher = <Object?, num>{}, paidTo = <Object?, num>{};
  for (final p in rows(s?['payments'])) {
    final who = p['teacher'] ?? teacherOf[p['batch']];
    if (who != null && p['at'] is String && dayKey(toDate(p['at'] as String)).startsWith(month)) byTeacher[who] = (byTeacher[who] ?? 0) + ((p['amount'] as num?) ?? 0);
  }
  for (final p in rows(s?['staffPayments'])) {
    if (p['month'] == month) paidTo[p['name']] = (paidTo[p['name']] ?? 0) + ((p['amount'] as num?) ?? 0);
  }
  return [
    for (final st in rows(s?['staff']))
      () {
        final collected = byTeacher[st['name']] ?? 0;
        final salary = (st['salary'] as num?) ?? 0, share = (st['share'] as num?) ?? 0;
        final payable = salary + jsRound(collected * share / 100), paid = paidTo[st['name']] ?? 0;
        return (name: '${st['name']}', salary: salary, share: share, collected: collected, payable: payable, paid: paid, balance: payable - paid > 0 ? payable - paid : 0);
      }(),
  ];
}

// ---- batches --------------------------------------------------------------------------------------------------------

class BatchesScreen extends StatelessWidget {
  const BatchesScreen({super.key});
  @override
  Widget build(BuildContext context) => Live(
    (context) => Screen(
      title: t('tday.batchSettings'),
      children: [
        Doing(label: t('teacher.newBatch'), icon: I.plus, onPressed: () async => push(context, const BatchForm())),
        Group(
          children: [
            for (final b in store.batches)
              Item(
                icon: I.batches,
                title: '${b['name']}',
                subtitle: '${b['teacher'] ?? ''} · ${b['days'] ?? ''} · ${taka((b['fee'] as num?) ?? 0)}',
                onTap: () => push(context, BatchForm(batch: b)),
              ),
          ],
        ),
      ],
    ),
  );
}

/// A new batch (addBatch), or one batch's settings (updateBatch): fee, teacher, late fine, class days, the league.
class BatchForm extends StatefulWidget {
  const BatchForm({super.key, this.batch});
  final Json? batch;
  @override
  State<BatchForm> createState() => _BatchFormState();
}

class _BatchFormState extends State<BatchForm> {
  late final b = widget.batch;
  final name = TextEditingController(), days = TextEditingController(text: 'Sat, Mon, Wed · 4:30 PM');
  late final fee = TextEditingController(text: show(b?['fee'] ?? 1200)), fine = TextEditingController(text: show(b?['lateFine'] ?? 0));
  var subject = subjects.first;
  late var classDays = [for (final d in (b?['classDays'] as List?) ?? const [6, 1, 3]) (d as num).toInt()];
  late var teacher = '${b?['teacher'] ?? ''}';
  late var league = b?['hideLeague'] != true;
  late var public = b?['public'] == true;
  late final about = TextEditingController(text: '${b?['about'] ?? ''}');

  @override
  void dispose() {
    for (final c in [name, days, fee, fine, about]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> save() async {
    final money = _num(fee) < 0 ? 0 : _num(fee).round();
    if (b == null) {
      if (name.text.trim().isEmpty) return;
      // Students, fees and attendance find their batch by name: two batches may never share one (the server refuses it too).
      if (store.batches.any((x) => '${x['name']}'.trim().toLowerCase() == name.text.trim().toLowerCase())) return toast(context, t('teacher.batchTaken'));
      final saved = await store.act('addBatch', [
        {'name': name.text.trim(), 'days': days.text, 'classDays': classDays, 'subject': subject, 'fee': money, 'lateFine': 0, 'teacher': store.staffName},
      ]);
      if (mounted) toast(context, _said(saved, t('teacher.toast.batchCreated')));
    } else {
      final lateFine = _num(fine) < 0 ? 0 : _num(fine).round();
      final patch = {
        if (money != b!['fee']) 'fee': money,
        if (teacher != '${b!['teacher'] ?? ''}') 'teacher': teacher,
        if (lateFine != ((b!['lateFine'] as num?) ?? 0)) 'lateFine': lateFine,
        if (!_same(classDays, b!['classDays'])) 'classDays': classDays,
        if (league != (b!['hideLeague'] != true)) 'hideLeague': !league,
        if (public != (b!['public'] == true)) 'public': public,
        if (about.text.trim() != '${b!['about'] ?? ''}') 'about': about.text.trim(),
      };
      if (patch.isNotEmpty) {
        final saved = await store.act('updateBatch', [b!['id'], patch]);
        if (mounted) toast(context, _said(saved, patch.containsKey('fee') ? t('teacher.feeSaved') : t('settings.saved')));
      }
    }
    if (mounted) Navigator.pop(context);
  }

  static bool _same(List<int> a, Object? b) => b is List && a.length == b.length && a.every(b.contains);

  @override
  Widget build(BuildContext context) {
    final weekdays = lang.list('att.weekdays');
    return Screen(
      title: b == null ? t('teacher.newBatch') : '${b!['name']}',
      refresh: false,
      children: [
        Box(
          children: [
            if (b == null) ...[
              TextField(controller: name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: t('teacher.batchTitle'), hintText: t('teacher.batchTitlePh'))),
              Strong(t('teacher.subject')),
              Chips(value: subject, options: subjects, onChanged: (v) => setState(() => subject = v)),
              TextField(controller: days, decoration: InputDecoration(labelText: t('teacher.schedule'))),
            ],
            TextField(controller: fee, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: t('teacher.monthlyFee'))),
            if (b != null) ...[
              TextField(controller: fine, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: t('fees.lateFine'))),
              Strong(t('routine.teacher')),
              Chips(value: teacher, options: [for (final s in _staff) '${s['name']}'], onChanged: (v) => setState(() => teacher = v)),
            ],
            Strong(t('att.classDays')),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final (d, n) in weekdays.indexed)
                  FilterChip(
                    label: Text(n),
                    selected: classDays.contains(d),
                    onSelected: (on) => setState(() => classDays = on ? [...classDays, d] : classDays.where((x) => x != d).toList()),
                  ),
              ],
            ),
            if (b != null) SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(t('streak.leagueToggle')), value: league, onChanged: (v) => setState(() => league = v)),
            // The website's public Courses page: whether this batch is listed there, and what it says about it.
            if (b != null) SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(t('courses.publicToggle')), value: public, onChanged: (v) => setState(() => public = v)),
            if (b != null && public) TextField(controller: about, minLines: 2, maxLines: 5, maxLength: 1000, decoration: InputDecoration(labelText: t('courses.about'))),
            Doing(label: b == null ? t('teacher.createBatch') : t('settings.save'), onPressed: save),
          ],
        ),
      ],
    );
  }
}

// ---- one student ----------------------------------------------------------------------------------------------------

/// One month after `from` (or after today if it has passed), as on the website's Students page.
String plusMonth([String? from]) {
  final today = dayKey();
  final d = toDate(from != null && from.compareTo(today) >= 0 ? from : today);
  return dayKey(DateTime(d.year, d.month + 1, d.day));
}

class StudentScreen extends StatelessWidget {
  const StudentScreen({super.key, required this.id});
  final int id;
  @override
  Widget build(BuildContext context) => Live((context) {
    final s = store.student(id);
    if (s == null) return const Loading();
    final until = '${s['premiumUntil'] ?? ''}', premium = until.isNotEmpty && until.compareTo(dayKey()) >= 0;
    return Screen(
      title: '${s['name']}',
      subtitle: '${t('batch.roll')} $id · ${s['batch']}',
      children: [
        Box(
          children: [
            Pair(_label('roster.email'), '${s['email'] ?? ''}'),
            Pair(_label('roster.guardianName'), '${s['guardianName'] ?? ''}'),
            Pair(_label('roster.guardianEmail'), '${s['guardianEmail'] ?? ''}'),
            Pair(_label('roster.guardianPhone'), '${s['phone'] ?? ''}'),
            if ('${s['studentPhone'] ?? ''}'.isNotEmpty) Pair(_label('roster.studentPhone'), '${s['studentPhone']}'),
            Pair(t('fees.due'), taka(feeDueOf(s))),
            Doing(label: t('roster.edit'), icon: I.edit, soft: true, onPressed: () async => push(context, NewStudent(student: s))),
            Doing(label: t(s['photo'] == null ? 'cards.addPhoto' : 'cards.changePhoto'), icon: I.camera, soft: true, onPressed: () => setPhoto(context, id)),
          ],
        ),
        Box(
          children: [
            if (!premium)
              Doing(
                label: '⭐ ${t('roster.premiumGive')}',
                soft: true,
                onPressed: () async {
                  final saved = await store.act('setStudentPremium', [id, plusMonth()]);
                  if (context.mounted) toast(context, _said(saved, t('roster.premiumGiven', ['${s['name']}'])));
                },
              ),
            if (premium) ...[
              Align(alignment: AlignmentDirectional.centerStart, child: Tag('⭐ ${t('roster.premiumUntil', [until])}')),
              Strong(t('aichat.packLabel')),
              Chips(
                value: '${s['aiPack'] ?? 150}',
                options: [for (final p in packs) '$p'],
                labels: {for (final p in packs) '$p': taka(p)},
                onChanged: (v) => store.act('setStudentPremium', [id, until, int.parse(v)]),
              ),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  Doing(label: t('roster.premiumExtend'), small: true, onPressed: () => store.act('setStudentPremium', [id, plusMonth(until)])),
                  Doing(label: t('roster.premiumStop'), small: true, soft: true, danger: true, onPressed: () => store.act('setStudentPremium', [id, null])),
                ],
              ),
            ],
          ],
        ),
        Doing(
          label: t('common.remove'),
          icon: I.trash,
          danger: true,
          onPressed: () async {
            if (!await confirm(context, t('common.remove'), t('teacher.confirmRemoveStudent', ['${s['name']}']))) return;
            final saved = await store.act('removeStudent', [id]);
            if (!context.mounted) return;
            toast(context, _said(saved, t('teacher.toast.studentRemoved', ['${s['name']}'])));
            Navigator.pop(context);
          },
        ),
      ],
    );
  });
}

/// The ID-card photo (the website's Cards tool): shrunk to 240 px, as its shrinkImage does, and sent as a data URL.
Future<void> setPhoto(BuildContext context, int id) async {
  try {
    final x = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 240, maxHeight: 240, imageQuality: 80);
    if (x == null) return;
    final bytes = await x.readAsBytes();
    final png = bytes.length > 3 && bytes[0] == 0x89 && bytes[1] == 0x50;
    final saved = await store.act('setStudentPhoto', [id, 'data:image/${png ? 'png' : 'jpeg'};base64,${base64Encode(bytes)}']);
    if (context.mounted) toast(context, _said(saved, t('settings.saved')));
  } catch (_) {
    // no permission: nothing changes
  }
}

// ---- money ----------------------------------------------------------------------------------------------------------

/// Expenses and a monthly profit & loss (the website's Money tool), and fees collected per month (its income report).
class MoneyScreen extends StatefulWidget {
  const MoneyScreen({super.key});
  @override
  State<MoneyScreen> createState() => _MoneyScreenState();
}

class _MoneyScreenState extends State<MoneyScreen> {
  var month = _month(), date = dayKey(), kind = expenseKinds.first;
  final amount = TextEditingController(), note = TextEditingController();

  @override
  void dispose() {
    amount.dispose();
    note.dispose();
    super.dispose();
  }

  Future<void> add() async {
    final n = num.tryParse(amount.text.trim());
    if (n == null || n < 1) return;
    final saved = await store.act('addExpense', [
      {'date': date, 'category': kind, 'amount': jsRound(n), 'note': note.text.trim()},
    ]);
    if (!mounted) return;
    toast(context, _said(saved, t('money.added')));
    amount.clear();
    note.clear();
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final months = lastMonths();
    final pl = profitAndLoss(month, store.state);
    final list = rows(store.state?['expenses']).where((e) => '${e['date']}'.startsWith(month)).toList();
    final names = [for (final b in store.batches) '${b['name']}'];
    final income = incomeByMonth(rows(store.state?['payments']), months, names);
    return Screen(
      title: t('tday.money'),
      children: [
        Strong(t('money.month')),
        Chips(value: month, options: months, labels: {for (final m in months) m: fmtMonth('$m-01')}, onChanged: (v) => setState(() => month = v)),
        Box(
          children: [
            Pair(t('money.income'), taka(pl.income)),
            Pair(t('money.salaries'), taka(pl.salaries)),
            Pair(t('money.other'), taka(pl.other)),
            const Divider(),
            Row(children: [Expanded(child: Strong(t('money.profit'))), Strong(taka(pl.profit), color: pl.profit < 0 ? context.colors.error : null)]),
          ],
        ),
        Box(
          title: t('money.add'),
          children: [
            OutlinedButton.icon(
              onPressed: () async {
                final d = await _pickDay(context, date);
                if (d != null) setState(() => date = d);
              },
              icon: Ico(I.calendar),
              label: Text('${t('money.date')}: ${fmtDate(date)}'),
            ),
            Strong(t('money.category')),
            Chips(value: kind, options: expenseKinds, labels: {for (final k in expenseKinds) k: t('money.cats.$k')}, onChanged: (v) => setState(() => kind = v)),
            TextField(controller: amount, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: t('money.amount'))),
            TextField(controller: note, decoration: InputDecoration(labelText: t('money.note'))),
            Doing(label: t('money.addBtn'), icon: I.plus, onPressed: add),
          ],
        ),
        Group(
          title: '${t('money.list')} · ${fmtMonth('$month-01')}',
          children: [
            if (list.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Muted(t('money.none'))),
            for (final e in list)
              Item(
                title: '${expenseKinds.contains(e['category']) ? t('money.cats.${e['category']}') : e['category']}${'${e['note'] ?? ''}'.isEmpty ? '' : ' · ${e['note']}'}',
                subtitle: '${e['date']} · ${taka((e['amount'] as num?) ?? 0)}',
                trailing: IconButton(tooltip: t('common.remove'), icon: Ico(I.trash), onPressed: () => store.act('removeExpense', [e['id']])),
              ),
          ],
        ),
        Group(
          title: t('income.title'),
          children: [
            for (final m in months)
              Item(
                title: fmtMonth('$m-01'),
                subtitle: [for (final b in names) '$b: ${taka(income['$m|$b'] ?? 0)}'].join('\n'),
                trailing: Strong(taka(income[m] ?? 0)),
              ),
          ],
        ),
      ],
    );
  });
}

// ---- teachers -------------------------------------------------------------------------------------------------------

/// Teachers: who is in today, this month's payroll (salary, share, pay), leave requests, and adding a teacher.
class StaffScreen extends StatefulWidget {
  const StaffScreen({super.key});
  @override
  State<StaffScreen> createState() => _StaffScreenState();
}

class _StaffScreenState extends State<StaffScreen> {
  final name = TextEditingController(), phone = TextEditingController(), email = TextEditingController();
  var badPhone = false;
  // A leave request (the website's Staff tool): who, from, to, why.
  final reason = TextEditingController();
  late var leaveWho = store.staffName;
  var leaveFrom = dayKey(), leaveTo = dayKey();

  Future<void> pickLeaveDay(bool from) async {
    final now = DateTime.now();
    final d = await showDatePicker(context: context, initialDate: toDate(from ? leaveFrom : leaveTo), firstDate: now.subtract(const Duration(days: 365)), lastDate: now.add(const Duration(days: 365)));
    if (d == null) return;
    setState(() {
      if (from) {
        leaveFrom = dayKey(d);
        if (leaveTo.compareTo(leaveFrom) < 0) leaveTo = leaveFrom;
      } else if (dayKey(d).compareTo(leaveFrom) >= 0) {
        leaveTo = dayKey(d);
      }
    });
  }

  Future<void> requestLeave() async {
    if (reason.text.trim().isEmpty) return;
    final saved = await store.act('requestLeave', [
      {'name': leaveWho, 'from': leaveFrom, 'to': leaveTo, 'reason': reason.text.trim()},
    ]);
    reason.clear();
    if (mounted) toast(context, _said(saved, t('staffTool.requested')));
  }

  @override
  void dispose() {
    for (final c in [name, phone, email, reason]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> add() async {
    final n = name.text.trim();
    setState(() => badPhone = !isBdMobile(phone.text));
    if (badPhone || n.isEmpty || email.text.trim().isEmpty) return;
    // One name, one person (batches, pay and private chats follow the name); the server checks the same.
    bool same(Object? a, String b) => '${a ?? ''}'.trim().toLowerCase() == b.trim().toLowerCase();
    if (same(store.state?['teacherName'], n) || _staff.any((s) => same(s['name'], n) || inbox('${s['email'] ?? ''}') == inbox(email.text)) || store.batches.any((b) => same(b['teacher'], n))) {
      toast(context, t('centre.taken'));
      return;
    }
    final saved = await store.act('addStaff', [n, phone.text.trim(), email.text.trim()]);
    if (!mounted) return;
    toast(context, _said(saved, t('settings.saved')));
    for (final c in [name, phone, email]) {
      c.clear();
    }
  }

  Future<void> edit(({String name, num salary, num share, num collected, num payable, num paid, num balance}) r) async {
    final salary = TextEditingController(text: show(r.salary)), share = TextEditingController(text: show(r.share));
    bool? remove; // set to false by "Remove" (and the dialog closes with false): a tap outside the dialog never removes anyone
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(r.name),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          spacing: 12,
          children: [
            TextField(controller: salary, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: t('payroll.salary'))),
            TextField(controller: share, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: t('payroll.share'))),
          ],
        ),
        actions: [
          // A teacher who has left (only once their batches have another teacher; the server checks the same).
          if (_staff.any((x) => x['name'] == r.name)) TextButton(onPressed: () => Navigator.pop(context, remove = false), child: Text(t('centre.remove'), style: TextStyle(color: Theme.of(context).colorScheme.error))),
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(t('app.cancel'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(t('settings.save'))),
        ],
      ),
    );
    if (remove == false && mounted) {
      salary.dispose();
      share.dispose();
      if (store.batches.any((b) => b['teacher'] == r.name)) {
        toast(context, t('centre.stillTeaches', [r.name]));
        return;
      }
      if (await confirm(context, t('centre.remove'), t('centre.removeQ', [r.name]))) {
        final saved = await store.act('removeStaff', [r.name]);
        if (mounted) toast(context, _said(saved, t('settings.saved')));
      }
      return;
    }
    final s = _num(salary) < 0 ? 0 : _num(salary), p = _num(share).clamp(0, 100);
    salary.dispose();
    share.dispose();
    final patch = {if (s != r.salary) 'salary': s, if (p != r.share) 'share': p};
    if (ok == true && patch.isNotEmpty) await store.act('updateStaff', [r.name, patch]);
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final month = _month(), today = dayKey();
    final absentMap = (store.state?['staffAbsent'] as Map?) ?? const {};
    bool absent(String n) => (((absentMap[today] as List?) ?? const []).contains(n)) != store.pending('toggleStaffAbsent', [n]).isOdd; // flipped while on its way
    int daysOff(String n) => absentMap.entries.where((e) => '${e.key}'.startsWith(month) && ((e.value as List?) ?? const []).contains(n)).length;
    final leave = rows(store.state?['staffLeave']);
    return Screen(
      title: t('app.teachers'),
      children: [
        Group(
          title: t('staffTool.today'),
          children: [
            for (final s in _staff)
              Builder(builder: (context) {
                final n = '${s['name']}', off = absent(n);
                return Item(
                  title: n,
                  subtitle: '${s['phone'] ?? ''} · ${t('staffTool.absentThisMonth', [daysOff(n)])}',
                  trailing: Doing(label: off ? t('staffTool.absent') : t('staffTool.present'), small: true, danger: off, soft: !off, onPressed: () => store.act('toggleStaffAbsent', [n])),
                );
              }),
          ],
        ),
        Muted(t('staffTool.payrollNote')),
        Group(
          title: '${t('payroll.title')} · ${fmtMonth('$month-01')}',
          children: [
            for (final r in payroll(store.state, month))
              Item(
                title: r.name,
                subtitle: '${t('payroll.salary')}: ${taka(r.salary)} · ${t('payroll.share')}: ${show(r.share)}\n${t('payroll.collected')}: ${taka(r.collected)} · ${t('payroll.payable')}: ${taka(r.payable)} · ${t('payroll.paid')}: ${taka(r.paid)}',
                onTap: () => edit(r),
                // Hidden while a payment waits to send (offline): store.state still shows the old balance, so a second tap would pay twice.
                below: r.balance > 0 && store.pending('payStaff', [r.name]) == 0
                    ? Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: Doing(
                          label: '${t('payroll.pay')} ${taka(r.balance)}',
                          small: true,
                          onPressed: () async {
                            if (!await confirm(context, t('payroll.title'), t('payroll.confirm', [r.name, taka(r.balance)]))) return;
                            final saved = await store.act('payStaff', [r.name, r.balance]);
                            if (context.mounted) toast(context, _said(saved, t('payroll.paidOk', [r.name])));
                          },
                        ),
                      )
                    : null,
              ),
          ],
        ),
        Box(
          title: t('staffTool.ask'),
          children: [
            Strong(t('staffTool.who')),
            Chips(value: leaveWho, options: [for (final x in rows(store.state?['staff'])) '${x['name']}'], onChanged: (v) => setState(() => leaveWho = v)),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Doing(label: '${t('staffTool.from')} ${fmtDate(leaveFrom)}', icon: I.calendar, soft: true, small: true, onPressed: () => pickLeaveDay(true)),
                Doing(label: '${t('staffTool.to')} ${fmtDate(leaveTo)}', icon: I.calendar, soft: true, small: true, onPressed: () => pickLeaveDay(false)),
              ],
            ),
            TextField(controller: reason, maxLength: 300, onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: t('staffTool.reason'))),
            Doing(label: t('staffTool.send'), icon: I.send, onPressed: reason.text.trim().isEmpty ? null : requestLeave),
          ],
        ),
        Group(
          title: t('staffTool.requests'),
          children: [
            if (leave.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Muted(t('staffTool.none'))),
            for (final l in leave)
              Item(
                title: '${l['name']}',
                subtitle: '${l['from'] == l['to'] ? l['from'] : '${l['from']} → ${l['to']}'} · ${l['reason'] ?? ''}',
                trailing: l['status'] == 'pending' ? null : Tag(t('staffTool.status.${l['status']}'), kind: l['status'] == 'approved' ? 'ok' : 'bad'),
                below: l['status'] == 'pending'
                    ? Wrap(
                        spacing: 8,
                        children: [
                          Doing(label: t('staffTool.approve'), small: true, onPressed: () => store.act('decideLeave', [l['id'], 'approved'])),
                          Doing(label: t('staffTool.reject'), small: true, soft: true, danger: true, onPressed: () => store.act('decideLeave', [l['id'], 'rejected'])),
                        ],
                      )
                    : null,
              ),
          ],
        ),
        Box(
          title: t('app.teachers'),
          children: [
            TextField(controller: name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: t('centre.name'))),
            TextField(
              controller: phone,
              keyboardType: TextInputType.phone,
              onChanged: (_) => setState(() => badPhone = false),
              decoration: InputDecoration(labelText: t('centre.phone'), hintText: '01XXXXXXXXX', errorText: badPhone ? t('teacher.phoneInvalid') : null, errorMaxLines: 2),
            ),
            TextField(controller: email, keyboardType: TextInputType.emailAddress, autocorrect: false, decoration: InputDecoration(labelText: t('auth.email'))),
            Doing(label: t('centre.addTeacher'), icon: I.personAdd, onPressed: add),
          ],
        ),
      ],
    );
  });
}

// ---- admissions -----------------------------------------------------------------------------------------------------

/// New-student enquiries: enquiry → called → visited → admitted (fills in the student form) or not joining.
class AdmissionsScreen extends StatefulWidget {
  const AdmissionsScreen({super.key});
  @override
  State<AdmissionsScreen> createState() => _AdmissionsScreenState();
}

class _AdmissionsScreenState extends State<AdmissionsScreen> {
  final name = TextEditingController(), guardian = TextEditingController(), phone = TextEditingController(), note = TextEditingController();
  late var wants = '${store.batches.firstOrNull?['name'] ?? ''}';
  var followUp = '';

  @override
  void dispose() {
    for (final c in [name, guardian, phone, note]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> add() async {
    final n = name.text.trim();
    if (n.isEmpty || phone.text.trim().isEmpty) return;
    final saved = await store.act('addAdmission', [
      {'name': n, 'guardian': guardian.text.trim(), 'phone': phone.text.trim(), 'wants': wants, if (followUp.isNotEmpty) 'followUp': followUp, 'note': note.text},
    ]);
    if (!mounted) return;
    toast(context, _said(saved, t('admissions.added', [n])));
    for (final c in [name, guardian, phone, note]) {
      c.clear();
    }
    setState(() => followUp = '');
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final today = dayKey(), list = rows(store.state?['admissions']);
    final due = list.where((a) => a['stage'] != 'admitted' && a['stage'] != 'lost' && '${a['followUp'] ?? ''}'.isNotEmpty && '${a['followUp']}'.compareTo(today) <= 0).length;
    return Screen(
      title: t('app.admissions'),
      children: [
        if (due > 0) Box(color: context.colors.tertiaryContainer, children: [Strong(t('admissions.dueToday', [due]))]),
        Wrap(spacing: 6, runSpacing: 6, children: [for (final s in stages) Tag('${t('admissions.stages.$s')}: ${list.where((a) => a['stage'] == s).length}', kind: 'plain')]),
        Box(
          title: t('app.admissions'),
          children: [
            TextField(controller: name, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: t('admissions.name'))),
            TextField(controller: guardian, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: t('admissions.guardian'))),
            TextField(controller: phone, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: t('admissions.phone'))),
            Strong(t('admissions.wants')),
            Chips(value: wants, options: [for (final b in store.batches) '${b['name']}'], onChanged: (v) => setState(() => wants = v)),
            OutlinedButton.icon(
              onPressed: () async {
                final d = await _pickDay(context, followUp);
                if (d != null) setState(() => followUp = d);
              },
              icon: Ico(I.calendar),
              label: Text(followUp.isEmpty ? t('admissions.followUp') : t('admissions.callOn', [fmtDate(followUp)])),
            ),
            TextField(controller: note, decoration: InputDecoration(labelText: t('admissions.note'))),
            Doing(label: t('admissions.addBtn'), onPressed: add),
          ],
        ),
        for (final a in list)
          Opacity(
            opacity: a['stage'] == 'admitted' || a['stage'] == 'lost' ? 0.7 : 1,
            child: Box(
              children: [
                Strong('${a['name']}'),
                Muted('${'${a['guardian'] ?? ''}'.isEmpty ? '' : '${a['guardian']} · '}${a['phone'] ?? ''} · ${a['wants'] ?? ''}'),
                if ('${a['followUp'] ?? ''}'.isNotEmpty && a['stage'] != 'admitted')
                  Align(alignment: AlignmentDirectional.centerStart, child: Tag(t('admissions.callOn', [a['followUp']]), kind: '${a['followUp']}'.compareTo(today) <= 0 ? 'bad' : 'plain')),
                if ('${a['note'] ?? ''}'.isNotEmpty) Text('${a['note']}'),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Doing(label: t('admissions.call'), icon: I.support, small: true, soft: true, onPressed: () => launchUrl(Uri(scheme: 'tel', path: '${a['phone']}'))),
                ),
                Chips(
                  value: '${a['stage']}',
                  options: stages,
                  labels: {for (final s in stages) s: t('admissions.stages.$s')},
                  onChanged: (v) => v == 'admitted' ? push(context, NewStudent(admission: a)) : store.act('updateAdmission', [a['id'], {'stage': v}]),
                ),
              ],
            ),
          ),
      ],
    );
  });
}

// ---- routine --------------------------------------------------------------------------------------------------------

int _mins(Object? hm) => (int.tryParse('$hm'.padRight(5).substring(0, 2)) ?? 0) * 60 + (int.tryParse('$hm'.padRight(5).substring(3, 5)) ?? 0);

/// clashes (src/lib/centre.ts): slots that overlap in time on the same day AND share a teacher, room or batch; with [mine], only pairs where at least one slot is in those batches.
List<({Json a, Json b, List<String> why})> clashes(List<Json> slots, [List<String>? mine]) => [
  for (final (i, a) in slots.indexed)
    for (final b in slots.skip(i + 1))
      if (a['day'] == b['day'] && _mins(a['start']) < _mins(b['end']) && _mins(b['start']) < _mins(a['end']) && (mine == null || mine.contains(a['batch']) || mine.contains(b['batch'])))
        if ([
              for (final k in const ['teacher', 'room', 'batch'])
                if ('${a[k] ?? ''}'.isNotEmpty && '${a[k]}'.trim().toLowerCase() == '${b[k] ?? ''}'.trim().toLowerCase()) k,
            ]
            case final why when why.isNotEmpty)
          (a: a, b: b, why: why),
];

/// The weekly class routine (the website's Routine tool): day × time × room, warning when someone is booked twice.
class RoutineScreen extends StatefulWidget {
  const RoutineScreen({super.key});
  @override
  State<RoutineScreen> createState() => _RoutineScreenState();
}

class _RoutineScreenState extends State<RoutineScreen> {
  var day = 6, start = '16:00', end = '17:30';
  late var batch = '${store.batches.firstOrNull?['name'] ?? ''}', teacher = '${_staff.firstOrNull?['name'] ?? ''}';
  final room = TextEditingController(text: 'Room 1');

  @override
  void dispose() {
    room.dispose();
    super.dispose();
  }

  Future<void> time(bool isStart) async {
    final now = isStart ? start : end;
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: _mins(now) ~/ 60, minute: _mins(now) % 60),
    );
    if (picked == null) return;
    final hm = '${'${picked.hour}'.padLeft(2, '0')}:${'${picked.minute}'.padLeft(2, '0')}';
    setState(() => isStart ? start = hm : end = hm);
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final weekdays = lang.list('att.weekdays');
    final names = [for (final b in store.batches) '${b['name']}'];
    final slots = rows(store.state?['routine']).where((s) => names.contains(s['batch'])).toList();
    final problems = clashes(rows(store.state?['routine']), names); // the whole routine, so a room or teacher double-booked with a colleague's batch is caught too
    String w(Object? d) => d is int && d < weekdays.length ? weekdays[d] : '$d';
    return Screen(
      title: lang.list('tools.names.routine').first,
      children: [
        for (final p in problems)
          Box(
            color: context.colors.errorContainer,
            children: [
              Strong('⚠ ${t('routine.clash', [w(p.a['day']), '${p.a['start']}–${p.a['end']}', '${p.b['start']}–${p.b['end']}', p.why.map((k) => t('routine.why.$k')).join(', ')])}'),
            ],
          ),
        for (final d in const [6, 0, 1, 2, 3, 4, 5])
          if (slots.where((s) => s['day'] == d).toList()..sort((a, b) => '${a['start']}'.compareTo('${b['start']}')) case final list when list.isNotEmpty)
            Group(
              title: w(d),
              children: [
                for (final s in list)
                  Item(
                    icon: problems.any((p) => p.a['id'] == s['id'] || p.b['id'] == s['id']) ? I.error : I.calendar,
                    color: problems.any((p) => p.a['id'] == s['id'] || p.b['id'] == s['id']) ? context.colors.error : null,
                    title: '${s['start']}–${s['end']} · ${s['room']}',
                    subtitle: '${s['batch']}\n${s['teacher']}',
                    trailing: IconButton(tooltip: '${t('common.remove')} ${s['batch']} ${s['start']}', icon: Ico(I.trash), onPressed: () => store.act('removeSlot', [s['id']])),
                  ),
              ],
            ),
        Box(
          title: t('routine.add'),
          children: [
            Strong(t('routine.day')),
            Chips(value: '$day', options: [for (var i = 0; i < weekdays.length; i++) '$i'], labels: {for (final (i, n) in weekdays.indexed) '$i': n}, onChanged: (v) => setState(() => day = int.parse(v))),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(onPressed: () => time(true), icon: Ico(I.hourglass), label: Text('${t('routine.start')}: $start')),
                OutlinedButton.icon(onPressed: () => time(false), icon: Ico(I.hourglass), label: Text('${t('routine.end')}: $end')),
              ],
            ),
            Strong(t('routine.batch')),
            Chips(value: batch, options: names, onChanged: (v) => setState(() => batch = v)),
            Strong(t('routine.teacher')),
            Chips(value: teacher, options: [for (final s in _staff) '${s['name']}'], onChanged: (v) => setState(() => teacher = v)),
            TextField(
              controller: room,
              decoration: InputDecoration(labelText: t('routine.room')),
            ),
            Doing(
              label: t('routine.addBtn'),
              icon: I.plus,
              onPressed: end.compareTo(start) <= 0 || batch.isEmpty
                  ? null
                  : () async {
                      if (room.text.trim().isEmpty) return;
                      await store.act('addSlot', [
                        {'day': day, 'start': start, 'end': end, 'batch': batch, 'teacher': teacher, 'room': room.text},
                      ]);
                    },
            ),
          ],
        ),
      ],
    );
  });
}

// ---- course shop ----------------------------------------------------------------------------------------------------

/// Selling courses (the website's Shop tool): orders paid by bKash to the institute's own number, and coupons.
class ShopScreen extends StatefulWidget {
  const ShopScreen({super.key});
  @override
  State<ShopScreen> createState() => _ShopScreenState();
}

class _ShopScreenState extends State<ShopScreen> {
  final code = TextEditingController(), percent = TextEditingController(text: '20'), maxUses = TextEditingController(text: '50');
  var batchId = '', expires = '';
  var badCode = false;

  @override
  void dispose() {
    for (final c in [code, percent, maxUses]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> add() async {
    final c = code.text.trim(), p = num.tryParse(percent.text.trim()), n = num.tryParse(maxUses.text.trim()) ?? 0;
    setState(() => badCode = !RegExp(r'^[A-Za-z0-9]{3,20}$').hasMatch(c));
    if (badCode || p == null) return;
    final saved = await store.act('addCoupon', [
      {'code': c, 'percent': p.clamp(1, 100), if (batchId.isNotEmpty) 'batchId': batchId, 'maxUses': n < 1 ? 1 : n, if (expires.isNotEmpty) 'expires': expires},
    ]);
    if (!mounted) return;
    toast(context, _said(saved, t('shop.couponAdded', [c.toUpperCase()])));
    code.clear();
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final orders = rows(store.state?['orders']), coupons = rows(store.state?['coupons']);
    final pending = orders.where((o) => o['status'] == 'pending').length;
    String course(Object? id) => '${store.batches.where((b) => b['id'] == id).firstOrNull?['name'] ?? '—'}';
    final public = store.batches.where((b) => b['public'] == true).toList();
    return Screen(
      title: lang.list('tools.names.shop').first,
      children: [
        if ('${(store.state?['site'] as Map?)?['bkash'] ?? ''}'.isEmpty) Box(color: context.colors.tertiaryContainer, children: [Strong(t('shop.needBkash'))]),
        Group(
          title: t('shop.orders', [pending]),
          children: [
            Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 4), child: Muted(t('shop.ordersHelp'))),
            if (orders.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Muted(t('shop.noOrders'))),
            for (final o in orders)
              Builder(
                builder: (context) {
                  final who = (o['student'] as Map?) ?? const {};
                  // Already a student here (one Gmail, one batch): confirming would make a second record, so only "not received" is offered.
                  final taken = o['status'] == 'pending' && '${who['email'] ?? ''}'.trim().isNotEmpty ? store.students.where((x) => inbox('${x['email'] ?? ''}') == inbox('${who['email'] ?? ''}')).firstOrNull : null;
                  return Item(
                    title: '${who['name'] ?? ''} → ${course(o['batchId'])}',
                    subtitle: '${taka((o['price'] as num?) ?? 0)}${o['coupon'] != null ? ' (${o['coupon']})' : ''} · TrxID ${o['trxId'] ?? ''} · ${who['phone'] ?? ''}${o['at'] is String ? ' · ${fmtDateTime(o['at'] as String)}' : ''}${taken != null ? '\n${t('shop.taken', ['${taken['name'] ?? ''}', '${taken['batch'] ?? ''}'])}' : ''}',
                    trailing: o['status'] == 'pending' ? null : Tag(t('shop.status.${o['status']}'), kind: o['status'] == 'confirmed' ? 'ok' : 'bad'),
                    below: o['status'] != 'pending'
                        ? null
                        : Wrap(
                            spacing: 8,
                            children: [
                              if (taken == null) Doing(
                                label: t('shop.confirm'),
                                small: true,
                                onPressed: () async {
                                  final saved = await store.act('decideOrder', [o['id'], true]);
                                  if (context.mounted) toast(context, _said(saved, t('shop.confirmed', ['${who['name'] ?? ''}'])));
                                },
                              ),
                              Doing(
                                label: t('shop.reject'),
                                small: true,
                                soft: true,
                                danger: true,
                                onPressed: () async {
                                  if (await confirm(context, t('shop.reject'), t('shop.rejectQ'))) await store.act('decideOrder', [o['id'], false]);
                                },
                              ),
                            ],
                          ),
                  );
                },
              ),
          ],
        ),
        Box(
          title: t('shop.coupons'),
          children: [
            TextField(
              controller: code,
              textCapitalization: TextCapitalization.characters,
              onChanged: (_) => setState(() => badCode = false),
              decoration: InputDecoration(labelText: t('shop.code'), hintText: 'EID20', errorText: badCode ? 'A–Z, 0–9 · 3–20' : null),
            ),
            TextField(
              controller: percent,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: t('shop.percent')),
            ),
            Strong(t('shop.course')),
            Chips(value: batchId, options: ['', for (final b in public) '${b['id']}'], labels: {'': t('shop.anyCourse'), for (final b in public) '${b['id']}': '${b['name']}'}, onChanged: (v) => setState(() => batchId = v)),
            TextField(
              controller: maxUses,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: t('shop.maxUses')),
            ),
            OutlinedButton.icon(
              onPressed: () async {
                final d = await _pickDay(context, expires);
                if (d != null) setState(() => expires = d);
              },
              icon: Ico(I.calendar),
              label: Text(expires.isEmpty ? t('shop.expires') : '${t('shop.expires')}: ${fmtDate(expires)}'),
            ),
            Doing(label: t('shop.addCoupon'), icon: I.plus, onPressed: add),
          ],
        ),
        if (coupons.isNotEmpty)
          Group(
            children: [
              for (final c in coupons)
                Item(
                  title: '${c['code']}',
                  subtitle:
                      '−${show(c['percent'])}% · ${c['batchId'] != null ? course(c['batchId']) : t('shop.anyCourse')} · ${t('shop.used', [c['used'] ?? 0, c['maxUses']])}${c['expires'] != null ? ' · ${t('shop.until', [c['expires']])}' : ''}',
                  trailing: IconButton(tooltip: '${t('common.remove')} ${c['code']}', icon: Ico(I.trash), onPressed: () => store.act('removeCoupon', [c['code']])),
                ),
            ],
          ),
      ],
    );
  });
}

// ---- the public page ------------------------------------------------------------------------------------------------

/// The website's slugify: lower case, letters and digits joined by dashes, at most 40 characters.
String slugify(String s) {
  final out = s.toLowerCase().replaceAll(RegExp('[^a-z0-9]+'), '-').replaceAll(RegExp(r'^-|-$'), '');
  return out.length > 40 ? out.substring(0, 40) : out;
}

/// The institute's own public page (the website's Website tool): address, intro, bKash number, shown or not.
class WebsiteScreen extends StatefulWidget {
  const WebsiteScreen({super.key});
  @override
  State<WebsiteScreen> createState() => _WebsiteScreenState();
}

class _WebsiteScreenState extends State<WebsiteScreen> {
  static Map get site => (store.state?['site'] as Map?) ?? const {};
  final slug = TextEditingController(text: '${site['slug'] ?? ''}'), bio = TextEditingController(text: '${site['bio'] ?? ''}'), bkash = TextEditingController(text: '${site['bkash'] ?? ''}');
  late var published = site['published'] == true;
  var badPhone = false;

  @override
  void dispose() {
    for (final c in [slug, bio, bkash]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> save() async {
    slug.text = slugify(slug.text);
    setState(() => badPhone = bkash.text.trim().isNotEmpty && !isBdMobile(bkash.text.trim()));
    if (badPhone) return;
    final patch = {
      if (slug.text != '${site['slug'] ?? ''}') 'slug': slug.text,
      if (bio.text != '${site['bio'] ?? ''}') 'bio': bio.text,
      if (bkash.text.trim() != '${site['bkash'] ?? ''}') 'bkash': bkash.text.trim(),
      if (published != (site['published'] == true)) 'published': published,
    };
    if (patch.isEmpty) return;
    // An address another institute already shows is refused by the server too; asked first so the owner is told why.
    final wanted = (patch['published'] ?? site['published']) == true && slug.text.isNotEmpty && (patch.containsKey('slug') || site['published'] != true) ? slug.text : '';
    if (wanted.isNotEmpty) {
      final theirs = await api('/api/public?slug=${Uri.encodeQueryComponent(wanted)}').then((r) => r.statusCode == 200 ? jsonDecode(r.body) : null).catchError((_) => null);
      if (theirs is Map && theirs['site'] != null) {
        if (mounted) toast(context, t('website.taken'));
        return;
      }
    }
    final saved = await store.act('updateSite', [patch]);
    if (mounted) toast(context, _said(saved, t('settings.saved')));
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final live = '${site['slug'] ?? ''}';
    return Screen(
      title: lang.list('tools.names.website').first,
      refresh: false,
      children: [
        Box(
          children: [
            TextField(
              controller: slug,
              autocorrect: false,
              decoration: InputDecoration(labelText: t('website.address'), prefixText: '/t/'),
            ),
            TextField(
              controller: bio,
              minLines: 3,
              maxLines: 8,
              maxLength: 1500,
              decoration: InputDecoration(labelText: t('website.bio'), hintText: t('website.bioPh'), hintMaxLines: 3),
            ),
            TextField(
              controller: bkash,
              keyboardType: TextInputType.phone,
              onChanged: (_) => setState(() => badPhone = false),
              decoration: InputDecoration(labelText: t('website.bkash'), hintText: '01XXXXXXXXX', helperText: t('website.bkashHelp'), helperMaxLines: 3, errorText: badPhone ? t('teacher.phoneInvalid') : null),
            ),
            SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(t('website.publish')), value: published, onChanged: (v) => setState(() => published = v)),
            Muted(t('website.batchesNote', [store.batches.where((b) => b['public'] == true).length])),
            Doing(label: t('settings.save'), onPressed: save),
            if (site['published'] == true && live.isNotEmpty)
              Doing(
                label: t('website.open'),
                icon: I.external,
                soft: true,
                onPressed: () => launchUrl(Uri.parse('$kApiUrl/t/$live'), mode: LaunchMode.externalApplication),
              ),
          ],
        ),
      ],
    );
  });
}

typedef StudentFile = ({List<int> bytes, String type});

/// A student list from the phone: Excel, CSV, or a PDF with text in it.
Future<StudentFile?> pickStudentList() async {
  final f = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: const ['xlsx', 'csv', 'pdf']).catchError((_) => null);
  if (f == null) return null;
  final name = f.name.toLowerCase();
  final type = name.endsWith('.pdf') ? 'application/pdf' : (name.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return (bytes: await f.readAsBytes(), type: type);
}

/// The server reads the list as a table and checks every row, as the website does: `fields` is what each column holds
/// (the server fills it in when not given), `heads` whether the first row is headings. Nothing is added.
Future<Json> sendStudentList(StudentFile file, String batch, {List<String>? fields, bool? heads}) async {
  if (file.bytes.length > 10 * 1024 * 1024) return const {'error': 'size'}; // the server's limit
  final query = {'batch': batch, 'fields': ?fields?.join(','), if (heads != null) 'heads': heads ? '1' : '0'};
  try {
    final res = await apiFile('/api/import-students?${Uri(queryParameters: query).query}', file.bytes, file.type);
    return jsonDecode(res.body) as Json;
  } catch (_) {
    return const {'error': 'offline'};
  }
}

/// Column `i` now holds `f`; a column that held it before holds nothing (one column per kind, as on the website).
List<String> assignColumn(List<String> fields, int i, String f) => [for (final (j, x) in fields.indexed) j == i ? f : (f.isNotEmpty && x == f ? '' : x)];

/// "Add students from a file", as on the website's Students page: the template, the batch for rows without one, then a
/// list the server reads as a table. The owner says which column is which (filled in from the headings and contents),
/// and only the rows without problems are added, one by one, when the owner says so.
class ImportStudentsScreen extends StatefulWidget {
  const ImportStudentsScreen({super.key, this.pick = pickStudentList, this.send = sendStudentList});
  final Future<StudentFile?> Function() pick;
  final Future<Json> Function(StudentFile file, String batch, {List<String>? fields, bool? heads}) send; // tests hand in the server's answers
  @override
  State<ImportStudentsScreen> createState() => _ImportStudentsScreenState();
}

class _ImportStudentsScreenState extends State<ImportStudentsScreen> {
  static const kinds = ['name', 'email', 'guardianName', 'guardianEmail', 'phone', 'studentPhone', 'batch', 'school', 'address']; // IMPORT_COLUMNS on the website
  late var batch = '${store.myBatches.firstOrNull?['name'] ?? ''}';
  StudentFile? file;
  Json? answer; // the server's: columns, heads, fields, missing, rows
  String? problem;
  int? adding; // while adding: how many of `total` are done
  var total = 0;
  final added = <Object?>{}; // rows sent (or waiting to be sent), so pressing Import again goes on from there

  List<String> get fields => [for (final f in (answer?['fields'] as List? ?? const [])) '$f'];
  bool get heads => answer?['heads'] == true;
  bool ok(Json r) => (r['problems'] as List? ?? const []).isEmpty;
  String why(Object? p) => p is Map ? t('importer.unknownBatch', ['${p['unknownBatch']}']) : t('roster.errors.$p');

  static const formats = {'xlsx': ('Excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'csv': ('CSV', 'text/csv'), 'pdf': ('PDF', 'application/pdf')};

  /// The template as an Excel sheet, a CSV file or a PDF to fill in, as on the website.
  Future<void> template(String format) async {
    try {
      final res = await http.get(Uri.parse('$kApiUrl/api/import-students?format=$format&batch=${Uri.encodeQueryComponent(batch)}')).timeout(const Duration(seconds: 20));
      if (res.statusCode == 200) await FilePicker.saveFile(fileName: 'instanton-students-template.$format', bytes: res.bodyBytes, mimeType: formats[format]!.$2);
    } catch (_) {
      if (mounted) toast(context, t('aichat.error'));
    }
  }

  Future<void> choose() async {
    final f = await widget.pick();
    if (f == null || !mounted) return;
    setState(() {
      file = f;
      added.clear(); // a new list: its rows are numbered afresh
    });
    await read();
  }

  /// Ask the server again: a new file, another meaning for a column, the headings switch, or another batch.
  Future<void> read({List<String>? fields, bool? heads}) async {
    final f = file;
    if (f == null) return;
    final a = await widget.send(f, batch, fields: fields, heads: heads);
    if (!mounted) return;
    setState(() {
      final read = a['columns'] is List;
      answer = read ? a : null;
      problem = !read
          ? t(switch (a['error']) {
              'scan' => 'importer.scan',
              'tooMany' => 'importer.tooMany',
              'offline' => 'aichat.error',
              _ => 'importer.unreadable',
            })
          : ((a['columns'] as List).isEmpty || (rows(a['rows']).isEmpty && (a['missing'] as List? ?? const []).isEmpty) ? t('importer.none') : null);
    });
  }

  Future<void> add(List<Json> todo) async {
    var n = 0, refused = 0;
    total = todo.length;
    for (final r in todo) {
      setState(() => adding = n + refused);
      final saved = await store.act('addStudent', [
        {...r['input'] as Json, 'mode': 'offline', 'feePaid': false},
      ]);
      final offline = !saved && store.status == Status.offline;
      if (saved || offline) added.add(r['line']); // made without internet, it waits in the queue and is sent later
      if (saved) {
        n++;
      } else if (offline) {
        break; // press Import again when the internet is back
      } else {
        refused++; // the server said no to this one (its Gmail was taken meanwhile, say); the others still go in
      }
    }
    if (!mounted) return;
    setState(() => adding = null);
    final left = todo.length - n - refused;
    toast(
      context,
      [
        t('importer.done', [n]),
        if (refused > 0) t('auth.syncFailed'),
        if (left > 0) t('aichat.error'),
      ].join(' · '),
    );
    if (left == 0) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final a = answer, cols = rows(a?['columns']), missing = [for (final f in (a?['missing'] as List? ?? const [])) '$f'];
    final list = a == null || missing.isNotEmpty ? const <Json>[] : rows(a['rows']);
    final good = list.where(ok).toList(), todo = good.where((r) => !added.contains(r['line'])).toList();
    return Screen(
      title: t('importer.title'),
      children: [
        Box(
          children: [
            Muted(t('importer.subApp')), // the app reads no photos: they're read on the website
            Muted(t('importer.template')),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final MapEntry(key: f, value: (label, _)) in formats.entries)
                  Semantics(
                    label: '${t('importer.template')} ($label)',
                    child: Doing(label: label, icon: I.file, soft: true, small: true, onPressed: () => template(f)),
                  ),
              ],
            ),
            Muted(t('importer.defaultBatch')),
            Chips(
              value: batch,
              options: [for (final b in store.myBatches) '${b['name']}'],
              onChanged: (b) {
                setState(() => batch = b);
                if (a != null) read(fields: fields, heads: heads); // rows without a batch go into this one
              },
            ),
            Doing(label: t('importer.choose'), icon: I.upload, onPressed: adding == null ? choose : null),
            if (problem != null) Semantics(liveRegion: true, child: Strong(problem!, color: context.colors.error)),
          ],
        ),
        if (a != null && cols.isNotEmpty)
          Box(
            title: t('importer.mapTitle'),
            children: [
              Muted(t('importer.mapHelp')),
              CheckboxListTile(value: heads, onChanged: (v) => read(heads: v ?? false), title: Text(t('importer.heads')), contentPadding: EdgeInsets.zero, controlAffinity: ListTileControlAffinity.leading),
              for (final (i, c) in cols.indexed)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10), // a column's examples stay with it, apart from the next column
                  child: DropdownButtonFormField<String>(
                    key: ValueKey('$i:${fields.elementAtOrNull(i)}'), // drawn afresh when the server's answer changes it
                    initialValue: kinds.contains(fields.elementAtOrNull(i)) ? fields[i] : '',
                    isExpanded: true,
                    decoration: InputDecoration(
                      labelText: '${c['heading'] ?? ''}'.isEmpty ? t('importer.column', [i + 1]) : '${c['heading']}',
                      helperText: [for (final s in (c['samples'] as List? ?? const [])) '$s'].join(' · '),
                    ),
                    items: [
                      DropdownMenuItem(value: '', child: Text(t('importer.unused'))),
                      for (final k in kinds) DropdownMenuItem(value: k, child: Text(t('importer.cols.$k'))),
                    ],
                    onChanged: (v) => read(fields: assignColumn(fields, i, v ?? ''), heads: heads),
                  ),
                ),
              if (missing.isNotEmpty) Semantics(liveRegion: true, child: Strong(t('importer.unmapped', [missing.map((f) => t('importer.cols.$f')).join(', ')]), color: context.colors.error)),
            ],
          ),
        if (list.isNotEmpty)
          Box(
            title: t('importer.summary', [good.length, list.length - good.length]),
            children: [
              Paged(
                items: list,
                row: (Json r) {
                  final s = r['input'] as Json? ?? const {};
                  return Item(
                    icon: ok(r) ? I.personCheck : I.close,
                    color: ok(r) ? context.colors.primary : context.colors.error,
                    title: '${t('importer.row', [r['line']])} ${'${s['name'] ?? ''}'.isEmpty ? '—' : s['name']}',
                    subtitle: [s['email'], s['guardianName'], s['phone'], s['batch']].map((v) => '${v ?? ''}'.isEmpty ? '—' : '$v').join(' · '),
                    below: ok(r) ? null : Strong([for (final p in r['problems'] as List) why(p)].join(' · '), color: context.colors.error),
                  );
                },
              ),
              Doing(label: adding == null ? t('importer.import', [todo.length]) : t('importer.adding', [adding! + 1, total]), icon: I.personAdd, onPressed: todo.isEmpty || adding != null ? null : () => add(todo)),
            ],
          ),
      ],
    );
  }
}

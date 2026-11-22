// The institute owner's extra pages, as on the website: batches (new and settings), one student (edit, AI premium,
// remove), money (expenses, profit and the income report), teachers (attendance, payroll, leave) and admissions.
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

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
  final income = sum(rows(s?['payments']).where((p) => '${p['at']}'.startsWith(month)));
  final salaries = sum(rows(s?['staffPayments']).where((p) => p['month'] == month));
  final other = sum(rows(s?['expenses']).where((e) => '${e['date']}'.startsWith(month)));
  return (income: income, salaries: salaries, other: other, profit: income - salaries - other);
}

/// payroll: what each teacher is owed this month (salary + their share of their batches' fees) and what is left to pay.
List<({String name, num salary, num share, num collected, num payable, num paid, num balance})> payroll(Json? s, String month) {
  final byBatch = <Object?, num>{}, paidTo = <Object?, num>{};
  for (final p in rows(s?['payments'])) {
    if (p['at'] is String && dayKey(toDate(p['at'] as String)).startsWith(month)) byBatch[p['batch']] = (byBatch[p['batch']] ?? 0) + ((p['amount'] as num?) ?? 0);
  }
  for (final p in rows(s?['staffPayments'])) {
    if (p['month'] == month) paidTo[p['name']] = (paidTo[p['name']] ?? 0) + ((p['amount'] as num?) ?? 0);
  }
  return [
    for (final st in rows(s?['staff']))
      () {
        final collected = rows(s?['batches']).where((b) => b['teacher'] == st['name']).fold<num>(0, (n, b) => n + (byBatch[b['name']] ?? 0));
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
            Pair(t('fees.due'), taka((s['feeDue'] as num?) ?? 0)),
            Doing(label: t('roster.edit'), icon: I.edit, soft: true, onPressed: () async => push(context, NewStudent(student: s))),
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

  @override
  void dispose() {
    for (final c in [name, phone, email]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> add() async {
    final n = name.text.trim();
    setState(() => badPhone = !isBdMobile(phone.text));
    if (badPhone || n.isEmpty || email.text.trim().isEmpty || _staff.any((s) => s['name'] == n)) return;
    final saved = await store.act('addStaff', [n, phone.text.trim(), email.text.trim()]);
    if (!mounted) return;
    toast(context, _said(saved, t('settings.saved')));
    for (final c in [name, phone, email]) {
      c.clear();
    }
  }

  Future<void> edit(({String name, num salary, num share, num collected, num payable, num paid, num balance}) r) async {
    final salary = TextEditingController(text: show(r.salary)), share = TextEditingController(text: show(r.share));
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
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(t('app.cancel'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(t('settings.save'))),
        ],
      ),
    );
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
                below: r.balance > 0
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

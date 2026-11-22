import 'package:material_ui/material_ui.dart';

import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'student.dart' show Stat;
import 'teacher.dart' show BatchScreen, Notices, absentOn, batchNo;
import '../icon.dart';
import '../icons.g.dart';

class InstituteApp extends StatelessWidget {
  const InstituteApp({super.key});
  @override
  Widget build(BuildContext context) => Live(
    (context) => Tabs(
      [
        AppTab(I.dashboard, t('app.tabs2.dashboard'), const Dashboard()),
        AppTab(I.fees, t('app.tabs2.fees'), const Fees(), badge: store.students.where((s) => ((s['feeDue'] as num?) ?? 0) > 0).length),
        AppTab(I.users, t('app.tabs2.students'), const Students()),
        AppTab(I.megaphone, t('app.tabs2.notices'), const Notices(), screen: 'notices'),
      ],
      details: [(t('settings.yourName'), store.staffName), (t('settings.instituteName'), '${store.state?['instituteName'] ?? ''}')],
    ),
  );
}

class Dashboard extends StatelessWidget {
  const Dashboard({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final students = store.students, payments = rows(store.state?['payments']);
    final month = dayKey().substring(0, 7);
    num collected = 0, due = 0;
    for (final p in payments) {
      if (p['at'] is String && dayKey(toDate(p['at'] as String)).startsWith(month)) collected += (p['amount'] as num?) ?? 0;
    }
    for (final s in students) {
      final d = (s['feeDue'] as num?) ?? 0;
      if (d > 0) due += d;
    }
    final taken = (store.state?['attendance'] as Map?)?.containsKey(dayKey()) ?? false;
    final n = students.length;
    return Screen(
      children: [
        H1('${store.state?['instituteName'] ?? store.state?['teacherName'] ?? ''}', kicker: '${t('teacher.greeting')} ${store.staffName}'),
        // The coloured card: this month's money at a glance.
        Box(
          hero: true,
          onTap: () => push(context, const Fees(pushed: true)),
          children: [
            H2(t('glance.title')),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 12,
              children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Muted(t('app.collected')), Big(taka(collected))]),
                ),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Muted(t('app.totalDue')), Big(taka(due))]),
                ),
              ],
            ),
          ],
        ),
        CardGrid([
          Stat(icon: I.users, label: t('app.tabs2.students'), value: localNumber(n, lang.code), onTap: () => push(context, const Students(pushed: true))),
          Stat(icon: I.personCheck, color: context.course(1), label: t('app.presentToday'), value: taken ? '${localNumber(n - absentOn(dayKey()).length, lang.code)}/${localNumber(n, lang.code)}' : '—'),
          Stat(icon: I.classroom, color: context.course(4), label: t('app.myBatches'), value: localNumber(store.batches.length, lang.code)),
          Stat(icon: I.school, color: context.course(3), label: t('app.teachers'), value: localNumber(rows(store.state?['staff']).length, lang.code)),
        ]),
        Section(t('app.myBatches')),
        CardGrid([
          for (final b in store.batches)
            CourseCard(
              color: context.course(batchNo(b['name'])),
              icon: I.users,
              title: '${b['name']}',
              subtitle: '${b['teacher'] ?? ''}\n${t('app.studentsN', [students.where((s) => s['batch'] == b['name']).length])} · ${taka((b['fee'] as num?) ?? 0)}',
              onTap: () => push(context, BatchScreen(batch: '${b['name']}')),
            ),
        ]),
      ],
    );
  });
}

/// Who owes what; record a cash or bKash payment received at the institute.
class Fees extends StatelessWidget {
  const Fees({super.key, this.pushed = false});
  final bool pushed;

  Future<void> record(BuildContext context, Json s) async {
    final done = await showDialog<String>(context: context, builder: (context) => FeeSheet(student: s));
    if (done != null && context.mounted) toast(context, done);
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final owing = store.students.where((s) => ((s['feeDue'] as num?) ?? 0) > 0).toList()..sort((a, b) => (b['feeDue'] as num).compareTo(a['feeDue'] as num));
    final recent = rows(store.state?['payments']).take(10).toList();
    return Screen(
      title: pushed ? t('app.whoOwes') : null,
      children: [
        Section(t('app.whoOwes')),
        if (owing.isEmpty) Box(children: [Muted(t('app.nobodyOwes'))]),
        if (owing.isNotEmpty)
          Box(
            flush: true,
            children: [
              Paged(
                items: owing,
                row: (s) => Item(
                  leading: Avatar('${s['name']}', size: 38, color: context.course(batchNo(s['batch']))),
                  title: '${s['name']}',
                  subtitle: '${s['batch']} · ${s['phone'] ?? ''}',
                  trailing: Strong(taka(s['feeDue'] as num), color: context.colors.error),
                  onTap: () => record(context, s),
                ),
              ),
            ],
          ),
        if (recent.isNotEmpty)
          Group(
            title: t('app.paidOk').replaceAll(' ✓', ''),
            children: [
              for (final p in recent)
                Item(
                  icon: I.checkCircle,
                  title: '${store.student(p['studentId'])?['name'] ?? '#${p['studentId']}'}',
                  subtitle: '${t(p['method'] == 'cash' ? 'app.cash' : 'app.bkash')}${p['at'] is String ? ' · ${fmtWhen(p['at'] as String)}' : ''}',
                  trailing: Strong(taka((p['amount'] as num?) ?? 0)),
                ),
            ],
          ),
      ],
    );
  });
}

class Students extends StatefulWidget {
  const Students({super.key, this.pushed = false});
  final bool pushed;
  @override
  State<Students> createState() => _StudentsState();
}

class _StudentsState extends State<Students> {
  var q = '';
  @override
  Widget build(BuildContext context) => Live((context) {
    final needle = q.trim().toLowerCase();
    final list = store.students.where((s) => needle.isEmpty || ['name', 'email', 'guardianName', 'phone', 'batch'].any((k) => '${s[k] ?? ''}'.toLowerCase().contains(needle))).toList();
    return Screen(
      title: widget.pushed ? t('app.tabs2.students') : null,
      children: [
        Doing(label: t('app.addStudent'), icon: I.personAdd, onPressed: () async => push(context, const NewStudent())),
        // People who joined from a link: approve them (they can then log in) or refuse (their request is deleted).
        if (store.pendingStudents.isNotEmpty)
          Box(
            color: context.colors.tertiaryContainer,
            title: t('roster.pendingTitle', [store.pendingStudents.length]),
            children: [
              Muted(t('roster.pendingHelp')),
              for (final p in store.pendingStudents)
                Item(
                  leading: Avatar('${p['name']}', size: 38, color: context.course(batchNo(p['batch']))),
                  title: '${p['name']}',
                  subtitle: '${p['batch']} · ${p['email'] ?? ''}',
                  below: Wrap(
                    spacing: 8,
                    children: [
                      Doing(label: t('roster.approve'), icon: I.personCheck, small: true, onPressed: () => store.act('approveStudent', [p['id']])),
                      Doing(
                        label: t('roster.reject'),
                        icon: I.close,
                        small: true,
                        soft: true,
                        onPressed: () async {
                          if (await confirm(context, t('roster.reject'), t('roster.rejectQ', ['${p['name']}']))) await store.act('removeStudent', [p['id']]);
                        },
                      ),
                    ],
                  ),
                ),
            ],
          ),
        Semantics(
          container: true,
          child: TextField(
            onChanged: (v) => setState(() => q = v),
            decoration: InputDecoration(labelText: t('app.search'), hintText: t('roster.searchPh'), prefixIcon: Ico(I.search)),
          ),
        ),
        Section(t('roster.count', [list.length])),
        Box(
          flush: true,
          children: [
            if (list.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Muted(t('roster.none'))),
            Paged(
              items: list,
              resetKey: needle,
              row: (s) {
                final due = (s['feeDue'] as num?) ?? 0;
                return Item(
                  leading: Avatar('${s['name']}', size: 38, color: context.course(batchNo(s['batch']))),
                  title: '${s['id']}. ${s['name']}',
                  subtitle: '${s['batch']} · ${s['guardianName'] ?? ''} · ${s['phone'] ?? ''}',
                  trailing: due > 0 ? Tag(taka(due), kind: 'bad') : null,
                );
              },
            ),
          ],
        ),
      ],
    );
  });
}

/// Enrol a student: the same fields and checks as the website (their Gmail, and the guardian's, open the apps).
class NewStudent extends StatefulWidget {
  const NewStudent({super.key});
  @override
  State<NewStudent> createState() => _NewStudentState();
}

class _NewStudentState extends State<NewStudent> {
  static const fields = [
    ('name', 'roster.name', TextInputType.name),
    ('email', 'roster.email', TextInputType.emailAddress),
    ('guardianName', 'roster.guardianName', TextInputType.name),
    ('guardianEmail', 'roster.guardianEmail', TextInputType.emailAddress),
    ('phone', 'roster.guardianPhone', TextInputType.phone),
  ];
  final inputs = {for (final f in fields) f.$1: TextEditingController()};
  var errors = <String, String>{};
  var gender = '', noGender = false;
  late var batch = '${store.batches.firstOrNull?['name'] ?? ''}';

  @override
  void dispose() {
    for (final c in inputs.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> save() async {
    final input = <String, dynamic>{for (final e in inputs.entries) e.key: e.value.text};
    final errs = validateStudent(input, store.students);
    setState(() {
      errors = errs;
      noGender = gender.isEmpty;
    });
    if (errs.isNotEmpty || gender.isEmpty || batch.isEmpty) return;
    final saved = await store.act('addStudent', [
      {...input, 'gender': gender, 'batch': batch, 'mode': 'offline', 'feePaid': false},
    ]);
    if (!mounted) return;
    if (saved) {
      toast(context, t('roster.added', [input['name'].toString().trim()]));
      return Navigator.pop(context);
    }
    toast(context, store.status == Status.offline ? t('app.sentLater') : t('auth.syncFailed'));
    if (store.status == Status.offline) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) => Screen(
    title: t('app.addStudent'),
    refresh: false,
    children: [
      Box(
        children: [
          for (final (key, label, keyboard) in fields)
            Semantics(
              container: true,
              child: TextField(
                controller: inputs[key],
                keyboardType: keyboard,
                autocorrect: false,
                textCapitalization: keyboard == TextInputType.name ? TextCapitalization.words : TextCapitalization.none,
                decoration: InputDecoration(labelText: t(label), errorText: errors[key] == null ? null : t('roster.errors.${errors[key]}'), errorMaxLines: 3),
              ),
            ),
          Strong(t('roster.gender')),
          Chips(value: gender, options: const ['male', 'female'], labels: {'male': t('roster.male'), 'female': t('roster.female')}, onChanged: (v) => setState(() => gender = v)),
          if (noGender && gender.isEmpty) Strong(t('roster.genderRequired'), color: context.colors.error),
          Strong(t('roster.batch')),
          Chips(value: batch, options: [for (final b in store.batches) '${b['name']}'], onChanged: (v) => setState(() => batch = v)),
          Doing(label: t('roster.enrol'), onPressed: batch.isEmpty ? null : save),
        ],
      ),
    ],
  );
}

/// A student's fees, as on the website: record all or part of what is due (cash or bKash), and set a monthly discount.
class FeeSheet extends StatefulWidget {
  const FeeSheet({super.key, required this.student});
  final Json student;
  @override
  State<FeeSheet> createState() => _FeeSheetState();
}

class _FeeSheetState extends State<FeeSheet> {
  late final amount = TextEditingController(text: show(widget.student['feeDue'] ?? 0));
  late final discount = TextEditingController(text: show(widget.student['discount'] ?? 0));
  var method = 'cash';

  @override
  void dispose() {
    amount.dispose();
    discount.dispose();
    super.dispose();
  }

  String result(bool saved, String ok) => saved ? ok : (store.status == Status.offline ? t('app.sentLater') : t('auth.syncFailed'));

  @override
  Widget build(BuildContext context) {
    final s = widget.student, due = (s['feeDue'] as num?) ?? 0;
    final pay = num.tryParse(amount.text.trim());
    final okPay = pay != null && pay >= 1 && pay <= due;
    return AlertDialog(
      title: Text(t('fees.title', ['${s['name']}'])),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 12,
          children: [
            Row(children: [Expanded(child: Text(t('fees.due'))), Strong(taka(due))]),
            if (due > 0) ...[
              TextField(controller: amount, keyboardType: TextInputType.number, onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: t('fees.amount'), helperText: t('fees.installmentHint'), helperMaxLines: 3)),
              Chips(value: method, options: const ['cash', 'bkash'], labels: {'cash': t('app.cash'), 'bkash': t('app.bkash')}, onChanged: (v) => setState(() => method = v)),
              FilledButton(
                onPressed: okPay
                    ? () async {
                        final saved = await store.act('payFee', [s['id'], method, pay]);
                        if (context.mounted) Navigator.pop(context, result(saved, '${s['name']}: ${t('fees.recorded')}'));
                      }
                    : null,
                child: Text(t('fees.record')),
              ),
            ],
            const Divider(),
            TextField(controller: discount, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: t('fees.discount'), helperText: t('fees.discountHint'), helperMaxLines: 2)),
            OutlinedButton(
              onPressed: () async {
                final saved = await store.act('setDiscount', [s['id'], num.tryParse(discount.text.trim()) ?? 0]);
                if (context.mounted) Navigator.pop(context, result(saved, t('fees.discountSaved')));
              },
              child: Text(t('settings.save')),
            ),
          ],
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text(t('app.cancel')))],
    );
  }
}

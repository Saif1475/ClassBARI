import 'package:material_ui/material_ui.dart';

import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'teacher.dart' show Notices, absentOn;

class InstituteApp extends StatelessWidget {
  const InstituteApp({super.key});
  @override
  Widget build(BuildContext context) => Live(
    (context) => Tabs([
      (icon: Icons.dashboard_outlined, label: t('app.tabs2.dashboard'), page: const Dashboard()),
      (icon: Icons.payments_outlined, label: t('app.tabs2.fees'), page: const Fees()),
      (icon: Icons.groups_outlined, label: t('app.tabs2.students'), page: const Students()),
      (icon: Icons.campaign_outlined, label: t('app.tabs2.notices'), page: const Notices()),
      (icon: Icons.person_outline, label: t('app.tabs.profile'), page: const InstituteProfile()),
    ]),
  );
}

class Dashboard extends StatelessWidget {
  const Dashboard({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final students = store.students, payments = rows(store.state?['payments']);
    final month = dayKey().substring(0, 7);
    num collected = 0, due = 0;
    var owing = 0;
    for (final p in payments) {
      if (p['at'] is String && dayKey(toDate(p['at'] as String)).startsWith(month)) collected += (p['amount'] as num?) ?? 0;
    }
    for (final s in students) {
      final d = (s['feeDue'] as num?) ?? 0;
      if (d > 0) {
        due += d;
        owing++;
      }
    }
    final taken = (store.state?['attendance'] as Map?)?.containsKey(dayKey()) ?? false;
    final n = students.length;
    Widget stat(IconData icon, String label, String value, [VoidCallback? onTap]) => Box(
      onTap: onTap,
      children: [
        Align(alignment: Alignment.centerLeft, child: Glyph(icon)),
        Muted(label),
        Big(value),
      ],
    );
    final stats = [
      stat(Icons.groups_outlined, t('app.tabs2.students'), localNumber(n, lang.code), () => push(context, const Students(pushed: true))),
      stat(Icons.class_outlined, t('app.myBatches'), localNumber(store.batches.length, lang.code)),
      stat(Icons.how_to_reg_outlined, t('app.presentToday'), taken ? '${localNumber(n - absentOn(dayKey()).length, lang.code)}/${localNumber(n, lang.code)}' : '—'),
      stat(Icons.school_outlined, t('app.teachers'), localNumber(rows(store.state?['staff']).length, lang.code)),
    ];
    return Screen(
      children: [
        H1('${store.state?['instituteName'] ?? store.state?['teacherName'] ?? ''}', kicker: '${t('teacher.greeting')} ${store.staffName}'),
        // The green card: this month's money at a glance.
        Box(
          hero: true,
          title: t('glance.title'),
          children: [
            Line(child: Pair(t('app.collected'), taka(collected))),
            Line(child: Pair(t('app.totalDue'), taka(due))),
          ],
        ),
        Box(
          title: t('tday.attention'),
          children: [
            if (owing == 0)
              Muted(t('tday.allClear'))
            else
              Line(
                onTap: () => push(context, const Fees(pushed: true)),
                child: Row(
                  spacing: 12,
                  children: [
                    Icon(Icons.payments_outlined, color: context.colors.primary),
                    Expanded(child: Strong(t('tday.feesOwed', [owing]))),
                    const Icon(Icons.chevron_right),
                  ],
                ),
              ),
          ],
        ),
        for (var i = 0; i < stats.length; i += 2)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 16,
              children: [
                Expanded(child: stats[i]),
                Expanded(child: stats[i + 1]),
              ],
            ),
          ),
        Box(
          title: t('app.myBatches'),
          children: [
            for (final b in store.batches)
              Line(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Strong('${b['name']}'),
                    Muted('${b['teacher'] ?? ''} · ${b['days'] ?? ''} · ${taka((b['fee'] as num?) ?? 0)} · ${t('app.studentsN', [students.where((s) => s['batch'] == b['name']).length])}'),
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  });
}

/// Who owes what; record a cash or bKash payment received at the institute.
class Fees extends StatelessWidget {
  const Fees({super.key, this.pushed = false});
  final bool pushed;

  Future<void> record(BuildContext context, Json s) async {
    final method = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(t('app.recordPayment')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 16,
          children: [
            Text(t('app.confirmPayment', ['${s['name']}', taka(s['feeDue'] as num)])),
            Row(
              spacing: 10,
              children: [
                Expanded(
                  child: FilledButton(onPressed: () => Navigator.pop(context, 'cash'), child: Text(t('app.cash'))),
                ),
                Expanded(
                  child: FilledButton(onPressed: () => Navigator.pop(context, 'bkash'), child: Text(t('app.bkash'))),
                ),
              ],
            ),
          ],
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text(t('app.cancel')))],
      ),
    );
    if (method == null) return;
    final saved = await store.act('payFee', [s['id'], method]);
    if (context.mounted) toast(context, saved ? '${s['name']}: ${t('app.paidOk')}' : (store.status == Status.offline ? t('app.sentLater') : t('auth.syncFailed')));
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final owing = store.students.where((s) => ((s['feeDue'] as num?) ?? 0) > 0).toList()..sort((a, b) => (b['feeDue'] as num).compareTo(a['feeDue'] as num));
    final recent = rows(store.state?['payments']).take(10).toList();
    return Screen(
      title: pushed ? t('app.whoOwes') : null,
      children: [
        if (!pushed) H1(t('app.whoOwes')),
        if (owing.isEmpty) Muted(t('app.nobodyOwes')),
        if (owing.isNotEmpty)
          Box(
            children: [
              Paged(
                items: owing,
                row: (s) => Line(
                  onTap: () => record(context, s),
                  child: Row(
                    spacing: 10,
                    children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Strong('${s['name']}'), Muted('${s['batch']} · ${s['phone'] ?? ''}')]),
                      ),
                      Strong(taka(s['feeDue'] as num), color: context.colors.error),
                    ],
                  ),
                ),
              ),
            ],
          ),
        if (recent.isNotEmpty)
          Box(
            title: t('app.paidOk').replaceAll(' ✓', ''),
            children: [
              for (final p in recent)
                Pair(
                  '${store.student(p['studentId'])?['name'] ?? '#${p['studentId']}'}',
                  '${taka((p['amount'] as num?) ?? 0)} · ${t(p['method'] == 'cash' ? 'app.cash' : 'app.bkash')}${p['at'] is String ? ' · ${fmtWhen(p['at'] as String)}' : ''}',
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
        if (!widget.pushed) H1(t('app.tabs2.students')),
        Doing(label: t('app.addStudent'), icon: Icons.person_add_alt, onPressed: () async => push(context, const NewStudent())),
        Semantics(
          container: true,
          child: TextField(
            onChanged: (v) => setState(() => q = v),
            decoration: InputDecoration(labelText: t('app.search'), hintText: t('roster.searchPh'), prefixIcon: const Icon(Icons.search)),
          ),
        ),
        Muted(t('roster.count', [list.length])),
        Box(
          children: [
            if (list.isEmpty) Muted(t('roster.none')),
            Paged(
              items: list,
              resetKey: needle,
              row: (s) {
                final due = (s['feeDue'] as num?) ?? 0;
                return Line(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Strong('${s['id']}. ${s['name']}'), Muted('${s['batch']} · ${s['guardianName'] ?? ''} · ${s['phone'] ?? ''}${due > 0 ? ' · ${taka(due)}' : ''}')]),
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

class InstituteProfile extends StatelessWidget {
  const InstituteProfile({super.key});
  @override
  Widget build(BuildContext context) => Live((context) => Profile(rows: [(t('settings.yourName'), store.staffName), (t('settings.instituteName'), '${store.state?['instituteName'] ?? ''}')]));
}

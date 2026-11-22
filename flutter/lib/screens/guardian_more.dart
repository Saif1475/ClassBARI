// The guardian app's extra pages, the same as on the website: payments and receipts, this month's invoice, the
// report card, calling the teacher, and the child's class points and portfolio.
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../icons.g.dart';
import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'student.dart' show attendanceOf;
import 'student_more.dart' show PointsBox, PortfolioBox;

const kFeeDueDay = 10; // FEE_DUE_DAY in src/lib/mock-data.ts

String _month() => dayKey(DateTime.now()).substring(0, 7);
Json? _batchOf(Json child) => store.batches.where((b) => b['name'] == child['batch']).firstOrNull;

/// A label on the left, its value on the right: one line of a receipt, invoice or report card.
class Line extends StatelessWidget {
  const Line(this.label, this.value, {super.key});
  final String label, value;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(spacing: 12, children: [Expanded(child: Text(label)), Strong(value)]),
  );
}

/// The amount at the bottom of a receipt or invoice, on a coloured band.
class Total extends StatelessWidget {
  const Total(this.label, this.value, {super.key, this.warm = false});
  final String label, value;
  final bool warm;
  @override
  Widget build(BuildContext context) {
    final bg = warm ? context.colors.tertiaryContainer : context.colors.secondaryContainer, fg = warm ? context.colors.onTertiaryContainer : context.colors.onSecondaryContainer;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
      child: Row(children: [Expanded(child: Strong(label, color: fg)), Text(value, style: context.type.headlineSmall?.copyWith(color: fg, fontWeight: FontWeight.w800))]),
    );
  }
}

/// Payments: what is due this month, and every payment with its receipt.
class PaymentsScreen extends StatelessWidget {
  const PaymentsScreen({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final child = store.child;
    if (child == null) return const Loading();
    final due = (child['feeDue'] as num?) ?? 0;
    final list = rows(store.state?['payments']).where((p) => p['studentId'] == child['id']).toList();
    return Screen(
      title: t('parent.paymentsTitle'),
      children: [
        if (due > 0) Total(t('parent.feeFor', [fmtMonth('${_month()}-01')]), taka(due), warm: true),
        if (due > 0) Muted(t('auth.payAtInstitute')),
        Group(
          title: t('parent.history'),
          children: [
            Item(icon: I.file, title: t('fees.invoice'), onTap: () => push(context, const InvoiceScreen())),
            if (list.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Muted(t('parent.noPayments'))),
            for (final p in list)
              Item(
                icon: I.fees,
                title: taka(p['amount'] as num? ?? 0),
                subtitle: '${p['at'] is String ? fmtDate(p['at'] as String) : ''} · ${t('parent.methods.${p['method']}')}',
                trailing: Tag(t('parent.receipt'), kind: 'plain'),
                onTap: () => push(context, ReceiptScreen(payment: p)),
              ),
          ],
        ),
      ],
    );
  });
}

class ReceiptScreen extends StatelessWidget {
  const ReceiptScreen({super.key, required this.payment});
  final Json payment;
  @override
  Widget build(BuildContext context) {
    final p = payment;
    final student = store.children.where((c) => c['id'] == p['studentId']).firstOrNull;
    final at = p['at'] is String ? p['at'] as String : null;
    return Screen(
      title: t('parent.receiptTitle'),
      children: [
        Box(
          children: [
            Muted('${store.state?['instituteName'] ?? ''}'),
            Line(t('parent.receiptNo'), '${p['id']}'),
            Line(t('parent.student'), '${student?['name'] ?? ''} (${t('batch.roll')} ${p['studentId']})'),
            Line(t('parent.batch'), '${p['batch'] ?? ''}'),
            if (at != null) Line(t('parent.date'), '${fmtDate(at)} ${toDate(at).year} · ${fmtTime(at)}'),
            Line(t('parent.method'), t('parent.methods.${p['method']}')),
            Total(t('parent.amount'), taka(p['amount'] as num? ?? 0)),
            Muted(t('parent.receiptNote')),
          ],
        ),
      ],
    );
  }
}

/// This month's invoice: the fee, any discount or late fine, what was paid, and the balance.
class InvoiceScreen extends StatelessWidget {
  const InvoiceScreen({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final s = store.child;
    if (s == null) return const Loading();
    final month = _month(), batch = _batchOf(s);
    final paid = rows(store.state?['payments']).where((p) => p['studentId'] == s['id'] && p['at'] is String && dayKey(toDate(p['at'] as String)).startsWith(month)).fold<num>(0, (n, p) => n + ((p['amount'] as num?) ?? 0));
    final discount = (s['discount'] as num?) ?? 0, fine = (batch?['lateFine'] as num?) ?? 0;
    return Screen(
      title: '${t('fees.invoiceTitle')} · ${fmtMonth('$month-01')}',
      children: [
        Box(
          children: [
            Muted('${s['name']} · ${t('batch.roll')} ${s['id']} · ${s['batch']}'),
            Line(t('fees.monthlyFee'), taka((batch?['fee'] as num?) ?? 0)),
            if (discount > 0) Line(t('fees.discountLine'), '− ${taka(discount)}'),
            if (s['fineMonth'] == month && fine > 0) Line(t('fees.fineLine'), '+ ${taka(fine)}'),
            Line(t('fees.paidThisMonth'), taka(paid)),
            Total(t('fees.balance'), taka((s['feeDue'] as num?) ?? 0), warm: true),
            Muted(t('fees.invoiceNote', [kFeeDueDay])),
          ],
        ),
      ],
    );
  });
}

/// This month's report card: attendance, quiz marks, homework and exams, and the teacher's comment.
class ReportCardScreen extends StatelessWidget {
  const ReportCardScreen({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final s = store.child;
    if (s == null) return const Loading();
    final id = s['id'] as int;
    final att = attendanceOf(s);
    final results = gradedResults(store.modules, id);
    final quizzes = results.where((r) => r.kind == 'quiz').toList();
    final tasks = [for (final m in store.modules) ...rows(m['items']).where((it) => it['kind'] == 'task' || it['kind'] == 'exam')];
    final comment = '${(store.state?['reportComments'] as Map?)?['$id'] ?? ''}';
    return Screen(
      title: t('report.title'),
      subtitle: '${s['name']} · ${s['batch']} · ${fmtMonth(DateTime.now().toIso8601String())}',
      children: [
        Box(children: [Strong(t('report.attendance')), Line(att.held > 0 ? t('parent.classesOf', [att.present, att.held]) : t('parent.noClasses'), att.held > 0 ? '${localNumber(att.pct, lang.code)}%' : '—')]),
        Box(children: [Strong(t('report.quizzes')), if (quizzes.isEmpty) Muted(t('student.noQuizYet')), for (final q in quizzes) Line(q.title, '${show(q.score)}/${show(q.points)}')]),
        if (tasks.isNotEmpty)
          Box(
            children: [
              Strong(t('report.assignments')),
              for (final it in tasks)
                Builder(builder: (context) {
                  final sub = ((it['submissions'] as Map?)?['$id']) as Map?;
                  return Line('${it['title']}', sub == null ? t('report.notSubmitted') : (sub['grade'] is num ? '${show(sub['grade'] as num)}/${show((it['points'] as num?) ?? 20)}' : t('sub.waiting')));
                }),
            ],
          ),
        Box(children: [Strong(t('report.comment')), Text(comment.isEmpty ? t('report.noComment') : comment)]),
      ],
    );
  });
}

/// The teacher of the child's batch, with a phone number the server shares with this family (or null).
({String name, String phone})? teacherToCall(Json child) {
  final name = _batchOf(child)?['teacher'];
  final phone = '${rows(store.state?['staff']).where((x) => x['name'] == name).firstOrNull?['phone'] ?? ''}';
  return name == null || phone.trim().isEmpty ? null : (name: '$name', phone: phone.trim());
}

Future<void> callTeacher(String phone) => launchUrl(Uri(scheme: 'tel', path: phone));

/// The chosen child's batch's lessons (a guardian of several children gets every child's).
List<Json> childModules() => store.modules.where((m) => m['batch'] == null || m['batch'] == store.child?['batch']).toList();

/// The child's class points and portfolio (the website's results page) (view only, as on the website).
class ChildPointsScreen extends StatelessWidget {
  const ChildPointsScreen({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final s = store.child;
    if (s == null) return const Loading();
    return Screen(
      title: t('dojo.points'),
      children: [
        PointsBox(s['id']),
        PortfolioBox(s['id'], key: ValueKey(s['id']), title: t('dojo.portfolioOf', ['${s['name']}'])),
      ],
    );
  });
}

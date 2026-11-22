import 'package:material_ui/material_ui.dart';

import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'lesson.dart';

const kindIcons = {'video': Icons.play_circle_outline, 'pdf': Icons.picture_as_pdf_outlined, 'quiz': Icons.quiz_outlined, 'task': Icons.edit_note, 'exam': Icons.assignment_outlined};

class StudentApp extends StatelessWidget {
  const StudentApp({super.key});
  @override
  Widget build(BuildContext context) => Tabs([
    (icon: Icons.home_outlined, label: t('app.tabs.home'), page: const StudentHome()),
    (icon: Icons.menu_book_outlined, label: t('app.tabs.lessons'), page: const Lessons()),
    (icon: Icons.insights_outlined, label: t('app.tabs.progress'), page: const Progress()),
    (icon: Icons.person_outline, label: t('app.tabs.profile'), page: const StudentProfile()),
  ]);
}

/// Notices for one batch (and those for everyone).
List<Json> noticesFor(Object? batch) => rows(store.state?['announcements']).where((a) => a['batch'] == null || a['batch'] == '' || a['batch'] == batch || a['batch'] == 'all').toList();

class NoticeLines extends StatelessWidget {
  const NoticeLines(this.list, {super.key});
  final List<Json> list;
  @override
  Widget build(BuildContext context) => Box(
    title: t('app.notices'),
    children: [
      for (final (i, a) in list.indexed)
        Line(
          first: i == 0,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Strong('${a['title']}'), Muted('${a['body']}')]),
        ),
    ],
  );
}

/// The next live class of a batch, while it is still to come (or began less than `grace` ago).
Json? liveFor(Object? batch, {Duration grace = Duration.zero}) {
  final live = store.state?['liveClass'];
  if (live is! Map<String, dynamic> || live['batch'] != batch || live['start'] is! String) return null;
  return toDate(live['start'] as String).isAfter(DateTime.now().subtract(grace)) ? live : null;
}

class LiveBox extends StatelessWidget {
  const LiveBox(this.live, {super.key});
  final Json live;
  @override
  Widget build(BuildContext context) => Box(title: t('app.nextLive'), children: [Strong('${live['topic'] ?? ''}'), Muted(fmtDateTime(live['start'] as String))]);
}

class StudentHome extends StatelessWidget {
  const StudentHome({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final me = store.me;
    if (me == null) return const Loading();
    final xp = ((store.state?['xp'] as Map?)?['${me['id']}'] as Map?) ?? const {};
    // Work still to do, soonest first (quizzes, homework, exams).
    final todo = [
      for (final m in store.modules)
        for (final it in rows(m['items']))
          if (it['done'] != true && const ['quiz', 'task', 'exam'].contains(it['kind'])) (m: m, it: it),
    ]..sort((a, b) => '${a.it['dueDate'] ?? '9999'}'.compareTo('${b.it['dueDate'] ?? '9999'}'));
    final live = liveFor(me['batch'], grace: const Duration(minutes: 90));
    final notices = noticesFor(me['batch']).take(3).toList();
    final due = (me['feeDue'] as num?) ?? 0;
    Widget stat(IconData icon, String text) => Expanded(
      child: Box(
        children: [
          Icon(icon, color: context.colors.tertiary, size: 28),
          Strong(text),
        ],
      ),
    );
    return Screen(
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            H1(t('app.hello', ['${me['name']}'.split(' ').first])),
            Muted('${me['batch']}'),
          ],
        ),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 12,
            children: [
              stat(Icons.local_fire_department, t('app.streak', [streak(xp).days])),
              stat(Icons.star, t('app.weekXp', [weekXp(xp)])),
            ],
          ),
        ),
        if (due > 0)
          Box(
            color: context.colors.tertiaryContainer,
            children: [
              Strong(t('app.feeDue', [taka(due)])),
              Muted(t('auth.payAtInstitute')),
            ],
          ),
        if (live != null) LiveBox(live),
        Box(
          title: t('app.todo'),
          children: [
            if (todo.isEmpty) Muted(t('app.nothingDue')),
            for (final (i, x) in todo.take(5).indexed)
              Line(
                first: i == 0,
                onTap: () => push(context, LessonScreen(moduleId: x.m['id'] as int, itemId: x.it['id'] as int)),
                child: Row(
                  spacing: 12,
                  children: [
                    Icon(kindIcons[x.it['kind']], color: context.colors.primary),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Strong('${x.it['title']}'),
                          if (x.it['dueDate'] is String) Muted(t('app.due', [fmtDate(x.it['dueDate'] as String)])),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right),
                  ],
                ),
              ),
          ],
        ),
        if (notices.isNotEmpty) NoticeLines(notices),
      ],
    );
  });
}

class Lessons extends StatefulWidget {
  const Lessons({super.key});
  @override
  State<Lessons> createState() => _LessonsState();
}

class _LessonsState extends State<Lessons> {
  Object? open = store.modules.firstOrNull?['id'];
  @override
  Widget build(BuildContext context) => Live((context) {
    final modules = store.modules;
    return Screen(
      children: [
        H1(t('app.tabs.lessons')),
        if (modules.isEmpty) Muted(t('app.noChapters')),
        for (final m in modules)
          Builder(
            builder: (context) {
              final items = rows(m['items']);
              final done = items.where((it) => it['done'] == true).length;
              return Box(
                children: [
                  InkWell(
                    onTap: () => setState(() => open = open == m['id'] ? null : m['id']),
                    child: Semantics(
                      expanded: open == m['id'],
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        spacing: 6,
                        children: [
                          Row(
                            children: [
                              Expanded(child: Strong('${m['title']}')),
                              Icon(open == m['id'] ? Icons.expand_less : Icons.expand_more),
                            ],
                          ),
                          MarkBar(items.isEmpty ? 0 : done / items.length * 100, plain: true),
                          Muted('${localNumber(done, lang.code)}/${localNumber(items.length, lang.code)} · ${t('app.items', [items.length])}'),
                        ],
                      ),
                    ),
                  ),
                  if (open == m['id'])
                    for (final it in items)
                      Line(
                        onTap: () => push(context, LessonScreen(moduleId: m['id'] as int, itemId: it['id'] as int)),
                        child: Row(
                          spacing: 12,
                          children: [
                            Icon(kindIcons[it['kind']], color: context.colors.primary),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('${it['title']}'), if ('${it['meta'] ?? ''}'.isNotEmpty) Muted('${it['meta']}')]),
                            ),
                            if (it['done'] == true) Icon(Icons.check_circle, color: context.colors.primary, semanticLabel: t('app.done')),
                          ],
                        ),
                      ),
                ],
              );
            },
          ),
      ],
    );
  });
}

/// A list of marks, each with a bar: used for the student's own and for a guardian's child.
class ResultLines extends StatelessWidget {
  const ResultLines(this.studentId, {super.key});
  final int studentId;
  @override
  Widget build(BuildContext context) {
    final results = gradedResults(store.modules, studentId).reversed.toList();
    if (results.isEmpty) return Muted(t('app.noResults'));
    return Paged(
      items: results,
      resetKey: '$studentId',
      row: (r, first) => Line(
        first: first,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 4,
          children: [
            Strong(r.title),
            Row(
              spacing: 10,
              children: [
                Expanded(child: MarkBar(r.pct)),
                Text('${show(r.score)}/${show(r.points)}'),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// This month's attendance of one student, in words.
class AttendanceBox extends StatelessWidget {
  const AttendanceBox(this.student, {super.key});
  final Json student;
  @override
  Widget build(BuildContext context) {
    final batch = store.batches.where((b) => b['name'] == student['batch']).firstOrNull;
    final att = monthAttendance((store.state?['attendance'] as Map?) ?? const {}, student['id'] as int, batch?['classDays'] as List?);
    return Box(
      title: t('app.attendance'),
      children: [
        Text(att.held > 0 ? '${localNumber(att.pct, lang.code)}%' : '—', style: context.type.headlineSmall),
        Muted(att.held > 0 ? t('app.attended', [att.present, att.held]) : t('parent.noClasses')),
      ],
    );
  }
}

class Progress extends StatelessWidget {
  const Progress({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final me = store.me;
    if (me == null) return const Loading();
    final xp = ((store.state?['xp'] as Map?)?['${me['id']}'] as Map?) ?? const {};
    return Screen(
      children: [
        H1(t('app.tabs.progress')),
        AttendanceBox(me),
        Box(
          title: 'XP',
          children: [
            Text('${t('app.weekXp', [weekXp(xp)])} · ${localNumber(totalXp(xp), lang.code)} XP'),
          ],
        ),
        Box(title: t('app.results'), children: [ResultLines(me['id'] as int)]),
      ],
    );
  });
}

class StudentProfile extends StatelessWidget {
  const StudentProfile({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final me = store.me;
    return Profile(
      note: t('settings.askInstitute'),
      rows: me == null ? const [] : [(t('settings.yourName'), '${me['name']}'), (t('app.batch'), '${me['batch']}'), (t('app.roll'), '${me['id']}'), (t('app.guardian'), '${me['guardianName'] ?? ''}')],
    );
  });
}

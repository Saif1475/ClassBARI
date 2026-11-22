import 'package:material_ui/material_ui.dart';

import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'lesson.dart';

const kindIcons = {'video': Icons.videocam_outlined, 'pdf': Icons.description_outlined, 'quiz': Icons.quiz_outlined, 'task': Icons.edit_note, 'exam': Icons.assignment_outlined};

class StudentApp extends StatelessWidget {
  const StudentApp({super.key});
  @override
  Widget build(BuildContext context) => Live(
    (context) => Tabs([
      (icon: Icons.home_outlined, label: t('app.tabs.home'), page: const StudentHome()),
      (icon: Icons.menu_book_outlined, label: t('app.tabs.lessons'), page: const Lessons()),
      (icon: Icons.insights_outlined, label: t('app.tabs.progress'), page: const Progress()),
      (icon: Icons.person_outline, label: t('app.tabs.profile'), page: const StudentProfile()),
    ]),
  );
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
      for (final a in list)
        Line(
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
  Widget build(BuildContext context) => Box(
    title: t('app.nextLive'),
    children: [
      Line(
        child: Row(
          spacing: 12,
          children: [
            const Glyph(Icons.sensors),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Strong('${live['topic'] ?? ''}'), Muted(fmtDateTime(live['start'] as String))]),
            ),
          ],
        ),
      ),
    ],
  );
}

/// The streak card, as on the website: a big flame, the days in a row, and whether today is done.
class StreakBox extends StatelessWidget {
  const StreakBox(this.xp, {super.key});
  final Map xp;
  @override
  Widget build(BuildContext context) {
    final run = streak(xp);
    return Box(
      children: [
        Row(
          spacing: 14,
          children: [
            const ExcludeSemantics(child: Text('🔥', style: TextStyle(fontSize: 44, height: 1.1))),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(t('streak.days', [run.days]), style: context.type.headlineSmall),
                  Strong(t(run.doneToday ? 'streak.today' : 'streak.notToday'), color: run.doneToday ? context.colors.primary : context.colors.onSurfaceVariant),
                ],
              ),
            ),
          ],
        ),
        Line(
          child: Row(
            spacing: 10,
            children: [
              const ExcludeSemantics(child: Text('⭐', style: TextStyle(fontSize: 20))),
              Expanded(child: Strong(t('streak.xpWeek', [weekXp(xp)]))),
            ],
          ),
        ),
      ],
    );
  }
}

class StudentHome extends StatelessWidget {
  const StudentHome({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final me = store.me;
    if (me == null) return const Loading();
    final c = context.colors;
    final xp = ((store.state?['xp'] as Map?)?['${me['id']}'] as Map?) ?? const {};
    final all = [
      for (final m in store.modules)
        for (final it in rows(m['items'])) (m: m, it: it),
    ];
    // Work still to do, soonest first (quizzes, homework, exams).
    final todo = all.where((x) => x.it['done'] != true && const ['quiz', 'task', 'exam'].contains(x.it['kind'])).toList()..sort((a, b) => '${a.it['dueDate'] ?? '9999'}'.compareTo('${b.it['dueDate'] ?? '9999'}'));
    final next = all.where((x) => x.it['done'] != true && const ['video', 'pdf'].contains(x.it['kind'])).firstOrNull;
    final live = liveFor(me['batch'], grace: const Duration(minutes: 90));
    final notices = noticesFor(me['batch']).take(3).toList();
    final due = (me['feeDue'] as num?) ?? 0;
    final soon = dayKey(DateTime.now().add(const Duration(days: 2)));
    void open(({Json m, Json it}) x) => push(context, LessonScreen(moduleId: x.m['id'] as int, itemId: x.it['id'] as int));
    return Screen(
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 4,
          children: [
            H1(t('kid.hi', ['${me['name']}'.split(' ').first])),
            Text(t('kid.sub'), style: context.type.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
          ],
        ),
        Box(
          title: t('kid.homework'),
          children: [
            if (todo.isEmpty) Muted(t('app.nothingDue')),
            for (final x in todo.take(5))
              Line(
                onTap: () => open(x),
                child: Row(
                  spacing: 14,
                  children: [
                    // Red when it is due within two days (or late), amber otherwise.
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(color: '${x.it['dueDate'] ?? '9999'}'.compareTo(soon) <= 0 ? c.error : c.tertiary, shape: BoxShape.circle),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Strong('${x.it['title']}'),
                          if (x.it['dueDate'] is String) Muted(t('app.due', [fmtDate(x.it['dueDate'] as String)])),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
        Box(
          title: t('kid.keepLearning'),
          children: [
            if (next == null)
              Muted(t('kid.allLessonsDone'))
            else
              Line(
                onTap: () => open(next),
                child: Row(
                  spacing: 12,
                  children: [
                    Glyph(kindIcons[next.it['kind']]!),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Strong('${next.it['title']}'), Muted('${next.m['title']}')]),
                    ),
                    Doing(label: t('student.actions.${next.it['kind']}'), small: true, onPressed: () async => open(next)),
                  ],
                ),
              ),
          ],
        ),
        StreakBox(xp),
        if (due > 0)
          Box(
            color: c.tertiaryContainer,
            children: [
              Strong(t('app.feeDue', [taka(due)])),
              Muted(t('auth.payAtInstitute')),
            ],
          ),
        if (live != null) LiveBox(live),
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
    final every = [for (final m in modules) ...rows(m['items'])];
    final pct = every.isEmpty ? 0 : jsRound(every.where((it) => it['done'] == true).length / every.length * 100);
    return Screen(
      children: [
        H1(t('app.tabs.lessons'), kicker: '${store.me?['batch'] ?? ''}'),
        if (modules.isEmpty) Muted(t('app.noChapters')),
        if (modules.isNotEmpty)
          Row(
            spacing: 12,
            children: [
              Muted(t('student.progress')),
              Expanded(child: MarkBar(pct, plain: true)),
              Strong('${localNumber(pct, lang.code)}%'),
            ],
          ),
        for (final m in modules)
          Builder(
            builder: (context) {
              final items = rows(m['items']);
              final on = open == m['id'];
              return Box(
                children: [
                  InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => setState(() => open = on ? null : m['id']),
                    child: Semantics(
                      expanded: on,
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: 48),
                        child: Row(
                          spacing: 10,
                          children: [
                            Icon(on ? Icons.expand_more : Icons.chevron_right),
                            Expanded(child: Text('${m['title']}', style: context.type.titleMedium?.copyWith(fontSize: 18))),
                            if (m['tag'] is String && '${m['tag']}'.isNotEmpty) Tag(t('student.tags.${m['tag']}')),
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (on)
                    for (final it in items)
                      Line(
                        onTap: () => push(context, LessonScreen(moduleId: m['id'] as int, itemId: it['id'] as int)),
                        child: Row(
                          spacing: 12,
                          children: [
                            Glyph(kindIcons[it['kind']] ?? Icons.article_outlined),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Strong('${it['title']}'), if ('${it['meta'] ?? ''}'.isNotEmpty) Muted('${it['meta']}')]),
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
      row: (r) => Line(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 6,
          children: [
            Row(
              spacing: 10,
              children: [
                Expanded(child: Strong(r.title)),
                Strong('${show(r.score)}/${show(r.points)}'),
              ],
            ),
            MarkBar(r.pct),
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
        Text(att.held > 0 ? '${localNumber(att.pct, lang.code)}%' : '—', style: context.type.headlineMedium),
        if (att.held > 0) MarkBar(att.pct),
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
        H1(t('app.tabs.progress'), kicker: '${me['name']}'),
        AttendanceBox(me),
        Box(
          title: 'XP',
          children: [
            Line(child: Strong('${t('streak.xpWeek', [weekXp(xp)])} · ${t('streak.xp', [totalXp(xp)])}')),
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

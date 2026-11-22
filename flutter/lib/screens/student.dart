import 'package:material_ui/material_ui.dart';

import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'lesson.dart';
import 'guardian.dart' show ChatThread;
import 'student_more.dart';
import 'community.dart';
import '../icon.dart';
import '../icons.g.dart';

const kindIcons = {'video': I.play, 'pdf': I.file, 'quiz': I.quiz, 'task': I.editNote, 'exam': I.clipboard};
const _cardIcons = [I.book, I.flask, I.calculator, I.globe, I.idea, I.books, I.helix, I.formula];

/// A chapter's place in the list: that decides its colour everywhere it shows.
int chapterNo(Object? moduleId) {
  final i = store.modules.indexWhere((m) => m['id'] == moduleId);
  return i < 0 ? 0 : i;
}

/// Work still to do, soonest first (quizzes, homework, written exams).
List<({Json m, Json it})> todoItems() => [
  for (final m in store.modules)
    for (final it in rows(m['items']))
      if (it['done'] != true && const ['quiz', 'task', 'exam'].contains(it['kind'])) (m: m, it: it),
]..sort((a, b) => '${a.it['dueDate'] ?? '9999'}'.compareTo('${b.it['dueDate'] ?? '9999'}'));

class StudentApp extends StatelessWidget {
  const StudentApp({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final me = store.me;
    return Tabs(
      [
        AppTab(I.dashboard, t('app.tabs2.dashboard'), const StudentHome()),
        AppTab(I.checklist, t('app.todo'), const TodoPage(), badge: todoItems().length, screen: 'todo'),
        AppTab(I.insights, t('app.tabs2.results'), const Progress(), screen: 'results'),
        AppTab(I.bell, t('app.notices'), const StudentNotices(), screen: 'notices'),
        AppTab(I.message, t('app.tabs2.messages'), const StudentMessages(), screen: 'messages'),
      ],
      note: t('settings.askInstitute'),
      details: me == null ? const [] : [(t('settings.yourName'), '${me['name']}'), (t('app.batch'), '${me['batch']}'), (t('app.roll'), '${me['id']}'), (t('app.guardian'), '${me['guardianName'] ?? ''}')],
    );
  });
}

/// Notices for one batch (and those for everyone).
List<Json> noticesFor(Object? batch) => rows(store.state?['announcements']).where((a) => a['batch'] == null || a['batch'] == '' || a['batch'] == batch || a['batch'] == 'all').toList();

/// Notices, newest first, each in its own card.
class NoticeCards extends StatelessWidget {
  const NoticeCards(this.list, {super.key});
  final List<Json> list;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: 12,
    children: [
      for (final a in list)
        Box(
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 12,
              children: [
                Glyph(I.megaphone, color: context.colors.tertiary),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, spacing: 2, children: [Strong('${a['title']}'), if (a['at'] is String) Muted(fmtWhen(a['at'] as String))]),
                ),
              ],
            ),
            Text('${a['body']}'),
          ],
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
  Widget build(BuildContext context) => Group(
    title: t('app.nextLive'),
    children: [
      Item(icon: I.live, color: context.colors.error, title: '${live['topic'] ?? ''}', subtitle: fmtDateTime(live['start'] as String)),
      // The teacher's class link (Zoom, Meet…), as on the website.
      if ('${live['link'] ?? ''}'.startsWith('http')) Doing(label: t('batch.joinZoom'), icon: I.external, onPressed: () => openLink(context, '${live['link']}')),
    ],
  );
}

/// A small rounded fact with a picture in front: the streak, this week's XP.
class Fact extends StatelessWidget {
  const Fact(this.emoji, this.text, {super.key});
  final String emoji, text;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(
      color: context.colors.surfaceContainerLowest,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: context.colors.outlineVariant),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      spacing: 6,
      children: [
        ExcludeSemantics(child: Text(emoji, style: const TextStyle(fontSize: 16))),
        Flexible(
          child: Text(text, style: context.type.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
        ),
      ],
    ),
  );
}

class StudentHome extends StatelessWidget {
  const StudentHome({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final me = store.me;
    if (me == null) return const Loading();
    final c = context.colors;
    final xp = ((store.state?['xp'] as Map?)?['${me['id']}'] as Map?) ?? const {};
    final modules = store.modules;
    final next = [
      for (final m in modules)
        for (final it in rows(m['items']))
          if (it['done'] != true && const ['video', 'pdf'].contains(it['kind'])) (m: m, it: it),
    ].firstOrNull;
    final live = liveFor(me['batch'], grace: const Duration(minutes: 90));
    final due = (me['feeDue'] as num?) ?? 0;
    return Screen(
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 2,
          children: [
            H1(t('kid.hi', ['${me['name']}'.split(' ').first])),
            Text(t('kid.sub'), style: context.type.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
          ],
        ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            Fact('🔥', t('streak.days', [streak(xp).days])),
            Fact('⭐', t('streak.xpWeek', [weekXp(xp)])),
          ],
        ),
        if (due > 0)
          Box(
            color: c.tertiaryContainer,
            children: [
              Strong(t('app.feeDue', [taka(due)]), color: c.onTertiaryContainer),
              Text(t('auth.payAtInstitute'), style: context.type.bodySmall?.copyWith(color: c.onTertiaryContainer)),
            ],
          ),
        if (live != null) LiveBox(live),
        if (next != null)
          Group(
            title: t('kid.keepLearning'),
            children: [
              Item(
                icon: kindIcons[next.it['kind']],
                color: context.course(chapterNo(next.m['id'])),
                title: '${next.it['title']}',
                subtitle: '${next.m['title']}',
                trailing: Doing(
                  label: t('student.actions.${next.it['kind']}'),
                  small: true,
                  onPressed: () async => push(context, LessonScreen(moduleId: next.m['id'] as int, itemId: next.it['id'] as int)),
                ),
              ),
            ],
          ),
        // The website's other student pages, one tap away.
        Group(
          title: t('app.moreForYou'),
          children: [
            if (rows(store.state?['exploreVideos']).isNotEmpty) Item(icon: I.video, title: t('student.explore'), onTap: () => push(context, const ExploreScreen())),
            Item(icon: I.calendar, title: t('student.calendar'), subtitle: t('student.calendarSub'), onTap: () => push(context, const CalendarScreen())),
            Item(icon: I.sparkle, title: t('practice.title'), subtitle: t('practice.sub'), onTap: () => push(context, const PracticeScreen())),
            Item(icon: I.quiz, title: t('doubts.ask'), subtitle: t('doubts.askPh'), onTap: () => push(context, const DoubtsScreen())),
            Item(icon: I.users, title: t('community.title'), subtitle: t('community.sub'), onTap: () => push(context, const CommunityScreen())),
            Item(icon: I.live, title: t('liveRoom.open'), onTap: () => push(context, const LiveClassScreen())),
            Item(icon: I.editNote, title: t('kp.myNotes'), onTap: () => push(context, const NotesScreen())),
            Item(icon: I.star, title: t('dojo.section'), onTap: () => push(context, boxScreen(t('dojo.section'), () => [PointsBox(store.me?['id']), StoryBox(store.me?['batch'])]))),
            Item(icon: I.image, title: t('dojo.portfolio'), subtitle: t('dojo.portfolioSub'), onTap: () => push(context, boxScreen(t('dojo.portfolio'), () => [PortfolioBox(store.me?['id'], canAdd: true)]))),
            Item(icon: I.insights, title: t('skills.title'), subtitle: t('skills.sub'), onTap: () => push(context, boxScreen(t('skills.title'), () => [MasteryBox(store.modules, store.me?['id'])]))),
          ],
        ),
        Section(t('app.chapters')),
        if (modules.isEmpty) Muted(t('app.noChapters')),
        if (modules.isNotEmpty)
          CardGrid([
            for (final (i, m) in modules.indexed)
              Builder(
                builder: (context) {
                  final items = rows(m['items']);
                  final done = items.where((it) => it['done'] == true).length;
                  return CourseCard(
                    color: context.course(i),
                    icon: _cardIcons[i % _cardIcons.length],
                    title: '${m['title']}',
                    subtitle: t('app.itemsDone', [done, items.length]),
                    progress: items.isEmpty ? 0 : done / items.length * 100,
                    badge: m['tag'] == 'new' ? t('student.tags.new') : null,
                    onTap: () => push(context, ChapterScreen(moduleId: m['id'] as int)),
                  );
                },
              ),
          ]),
      ],
    );
  });
}

/// One chapter, in its own colour: how far along it is, and its lessons in order.
class ChapterScreen extends StatelessWidget {
  const ChapterScreen({super.key, required this.moduleId});
  final int moduleId;
  @override
  Widget build(BuildContext context) => Live((context) {
    final m = store.modules.where((x) => x['id'] == moduleId).firstOrNull;
    if (m == null) return Screen(title: '', children: [Muted(t('app.noChapters'))]);
    final color = context.course(chapterNo(moduleId));
    final items = rows(m['items']);
    final done = items.where((it) => it['done'] == true).length;
    final pct = items.isEmpty ? 0 : jsRound(done / items.length * 100);
    return Screen(
      title: '${m['title']}',
      subtitle: t('app.itemsDone', [done, items.length]),
      color: color,
      children: [
        Box(
          children: [
            Row(
              spacing: 12,
              children: [
                Muted(t('student.progress')),
                Expanded(child: MarkBar(pct, color: color)),
                Strong('${localNumber(pct, lang.code)}%'),
              ],
            ),
          ],
        ),
        if (items.isNotEmpty)
          Group(
            children: [
              for (final it in items)
                Item(
                  icon: kindIcons[it['kind']] ?? I.file,
                  color: color,
                  title: '${it['title']}',
                  subtitle: [
                    if ('${it['meta'] ?? ''}'.isNotEmpty) '${it['meta']}',
                    if (it['dueDate'] is String) t('app.due', [fmtDate(it['dueDate'] as String)]),
                  ].join(' · '),
                  trailing: it['done'] == true ? Ico(I.checkCircle, color: context.colors.primary, semanticLabel: t('app.done')) : null,
                  onTap: () => push(context, LessonScreen(moduleId: moduleId, itemId: it['id'] as int)),
                ),
            ],
          ),
      ],
    );
  });
}

/// Everything still to hand in or take, grouped by how soon it is due.
class TodoPage extends StatelessWidget {
  const TodoPage({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final all = todoItems();
    final today = dayKey(), week = dayKey(DateTime.now().add(const Duration(days: 7)));
    String due(({Json m, Json it}) x) => '${x.it['dueDate'] ?? ''}';
    final groups = [
      (t('app.overdue'), all.where((x) => due(x).isNotEmpty && due(x).compareTo(today) < 0).toList(), true),
      (t('app.dueSoon'), all.where((x) => due(x).isNotEmpty && due(x).compareTo(today) >= 0 && due(x).compareTo(week) <= 0).toList(), false),
      (t('app.later'), all.where((x) => due(x).isEmpty || due(x).compareTo(week) > 0).toList(), false),
    ];
    return Screen(
      children: [
        if (all.isEmpty)
          Box(
            children: [
              const ExcludeSemantics(
                child: Text('🎉', textAlign: TextAlign.center, style: TextStyle(fontSize: 44)),
              ),
              Text(t('app.caughtUp'), textAlign: TextAlign.center, style: context.type.titleMedium),
            ],
          ),
        for (final (title, list, late) in groups)
          if (list.isNotEmpty)
            Group(
              title: title,
              children: [
                for (final x in list)
                  Item(
                    icon: kindIcons[x.it['kind']],
                    color: context.course(chapterNo(x.m['id'])),
                    title: '${x.it['title']}',
                    subtitle: [
                      ('${x.m['title']}'),
                      if (due(x).isNotEmpty) t('app.due', [fmtDate(due(x))]),
                    ].join(' · '),
                    trailing: late ? Tag(t('app.overdue'), kind: 'bad') : null,
                    onTap: () => push(context, LessonScreen(moduleId: x.m['id'] as int, itemId: x.it['id'] as int)),
                  ),
              ],
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
    if (results.isEmpty) return Padding(padding: const EdgeInsets.all(16), child: Muted(t('app.noResults')));
    return Paged(
      items: results,
      resetKey: '$studentId',
      row: (r) => Item(icon: kindIcons[r.kind], color: r.pct >= 60 ? context.colors.primary : context.colors.error, title: r.title, below: MarkBar(r.pct), trailing: Strong('${show(r.score)}/${show(r.points)}')),
    );
  }
}

/// A number with its name, in a small card: attendance, the average mark.
class Stat extends StatelessWidget {
  const Stat({super.key, required this.icon, required this.label, required this.value, this.note, this.pct, this.onTap, this.color});
  final CbIcon icon;
  final String label, value;
  final String? note;
  final num? pct;
  final VoidCallback? onTap;
  final Color? color;
  @override
  Widget build(BuildContext context) => Box(
    onTap: onTap,
    children: [
      Align(
        alignment: Alignment.centerLeft,
        child: Glyph(icon, color: color),
      ),
      Muted(label),
      Big(value),
      if (pct != null) MarkBar(pct!, color: color),
      if (note != null) Muted(note!),
    ],
  );
}

/// This month's attendance of one student.
({int held, int present, int pct}) attendanceOf(Json student) {
  final batch = store.batches.where((b) => b['name'] == student['batch']).firstOrNull;
  return monthAttendance((store.state?['attendance'] as Map?) ?? const {}, student['id'] as int, batch?['classDays'] as List?);
}

/// The average of everything marked so far (%), or null when nothing is.
int? averageOf(int studentId) {
  final r = gradedResults(store.modules, studentId);
  return r.isEmpty ? null : jsRound(r.fold<num>(0, (n, x) => n + x.pct) / r.length);
}

class Progress extends StatelessWidget {
  const Progress({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final me = store.me;
    if (me == null) return const Loading();
    final id = me['id'] as int;
    final xp = ((store.state?['xp'] as Map?)?['$id'] as Map?) ?? const {};
    final att = attendanceOf(me), avg = averageOf(id), run = streak(xp);
    return Screen(
      children: [
        CardGrid([
          Stat(
            icon: I.eventOk,
            label: t('app.attendance'),
            value: att.held > 0 ? '${localNumber(att.pct, lang.code)}%' : '—',
            pct: att.held > 0 ? att.pct : null,
            note: att.held > 0 ? t('app.attended', [att.present, att.held]) : t('parent.noClasses'),
          ),
          Stat(icon: I.star, color: context.course(1), label: t('app.average'), value: avg == null ? '—' : '${localNumber(avg, lang.code)}%', pct: avg, note: avg == null ? t('app.noResults') : null),
        ]),
        Group(
          children: [
            Item(
              leading: const ExcludeSemantics(child: Text('🔥', style: TextStyle(fontSize: 30))),
              title: t('streak.days', [run.days]),
              subtitle: t(run.doneToday ? 'streak.today' : 'streak.notToday'),
            ),
            Item(
              leading: const ExcludeSemantics(child: Text('⭐', style: TextStyle(fontSize: 30))),
              title: t('streak.xpWeek', [weekXp(xp)]),
              subtitle: t('streak.xp', [totalXp(xp)]),
            ),
          ],
        ),
        Section(t('app.results')),
        Box(flush: true, children: [ResultLines(id)]),
      ],
    );
  });
}

/// The student's private chat with their batch teacher (nobody else can read it, not the institute or a guardian).
class StudentMessages extends StatelessWidget {
  const StudentMessages({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final me = store.me?['id'];
    return Screen(children: [Muted(t('app.privateChat')), if (me != null) ChatThread(threadId: 'student-$me', family: true)]);
  });
}

class StudentNotices extends StatelessWidget {
  const StudentNotices({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final batch = store.me?['batch'];
    final live = liveFor(batch, grace: const Duration(minutes: 90));
    final list = noticesFor(batch);
    return Screen(
      children: [
        if (live != null) LiveBox(live),
        if (list.isEmpty && live == null) Box(children: [Muted(t('app.noNotices'))]),
        if (list.isNotEmpty) NoticeCards(list),
      ],
    );
  });
}

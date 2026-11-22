import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'guardian.dart' show ChatThread;
import 'lesson.dart' show OpenFile;
import 'pdf.dart';

/// Homework and written exams handed in but not marked yet, in the batches this person looks after.
List<({Json m, Json it, int sid, Json sub})> toMark() {
  final names = {for (final b in store.myBatches) b['name']};
  return [
    for (final m in store.modules)
      if (names.contains(m['batch']))
        for (final it in rows(m['items']))
          if (it['kind'] == 'task' || it['kind'] == 'exam')
            for (final e in ((it['submissions'] as Map?) ?? const {}).entries)
              if ((e.value as Map)['grade'] == null) (m: m, it: it, sid: int.parse('${e.key}'), sub: (e.value as Map).cast<String, dynamic>()),
  ];
}

List<int> absentOn(String day) => (((store.state?['attendance'] as Map?)?[day] as List?) ?? const []).cast<int>();

/// The guardian threads of the batches this person looks after.
List<Json> guardianChats() {
  final names = {for (final b in store.myBatches) b['name']};
  return rows(store.state?['chats']).where((c) => '${c['id']}'.startsWith('parent-') && (store.runsAll || names.contains(c['role']))).toList();
}

/// A batch's place in the list: that decides its colour everywhere it shows.
int batchNo(Object? name) {
  final i = store.batches.indexWhere((b) => b['name'] == name);
  return i < 0 ? 0 : i;
}

class TeacherApp extends StatelessWidget {
  const TeacherApp({super.key});
  @override
  Widget build(BuildContext context) => Live(
    (context) => Tabs(
      [
        AppTab(Icons.space_dashboard_outlined, t('app.myBatches'), const TeacherHome()),
        AppTab(Icons.checklist_rounded, t('app.todo'), const Marking(), badge: toMark().length, screen: 'todo'),
        AppTab(Icons.chat_bubble_outline_rounded, t('app.tabs2.messages'), const Inbox(), badge: guardianChats().fold<int>(0, (n, c) => n + ((c['unread'] as num?) ?? 0).toInt()), screen: 'messages'),
        AppTab(Icons.campaign_outlined, t('app.tabs2.notices'), const Notices(), screen: 'notices'),
      ],
      details: [
        (t('settings.yourName'), store.staffName),
        (t('settings.instituteName'), '${store.state?['instituteName'] ?? store.state?['teacherName'] ?? ''}'),
        (t('app.myBatches'), [for (final b in store.myBatches) b['name']].join(', ')),
      ],
    ),
  );
}

/// The teacher's dashboard: a card per batch in its own colour, and what needs doing today.
class TeacherHome extends StatelessWidget {
  const TeacherHome({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final batches = store.myBatches;
    final waiting = toMark().length, absent = absentOn(dayKey());
    final unread = guardianChats().where((c) => ((c['unread'] as num?) ?? 0) > 0).toList();
    final taken = (store.state?['attendance'] as Map?)?.containsKey(dayKey()) ?? false;
    return Screen(
      children: [
        H1('${t('tday.today')} · ${fmtDate(dayKey())}', kicker: '${t('teacher.greeting')} ${store.staffName}'),
        if (waiting > 0 || unread.isNotEmpty)
          Group(
            title: t('tday.attention'),
            children: [
              if (waiting > 0) Item(icon: Icons.fact_check_outlined, color: context.colors.tertiary, title: t('tday.toMark', [waiting]), onTap: () => push(context, const Marking(pushed: true))),
              if (unread.isNotEmpty)
                Item(
                  icon: Icons.chat_bubble_outline_rounded,
                  color: context.course(1),
                  title: t('tday.unread', [unread.fold<num>(0, (n, c) => n + (c['unread'] as num))]),
                  onTap: () => push(context, ChatScreen(threadId: '${unread.first['id']}')),
                ),
            ],
          ),
        Section(t('app.myBatches')),
        if (batches.isEmpty) Muted(t('tday.noClass')),
        CardGrid([
          for (final b in batches)
            Builder(
              builder: (context) {
                final kids = store.students.where((s) => s['batch'] == b['name']).toList();
                final out = kids.where((k) => absent.contains(k['id'])).length;
                return CourseCard(
                  color: context.course(batchNo(b['name'])),
                  icon: Icons.groups_rounded,
                  title: '${b['name']}',
                  subtitle: '${b['days'] ?? ''}\n${t('app.studentsN', [kids.length])}',
                  badge: taken && out > 0 ? t('app.absentToday', [out]) : null,
                  onTap: () => push(context, BatchScreen(batch: '${b['name']}')),
                );
              },
            ),
        ]),
      ],
    );
  });
}

/// One batch, in its own colour: today's register, its students, and its highlighted PDFs.
class BatchScreen extends StatelessWidget {
  const BatchScreen({super.key, required this.batch});
  final String batch;
  @override
  Widget build(BuildContext context) => Live((context) {
    final color = context.course(batchNo(batch));
    final b = store.batches.where((x) => x['name'] == batch).firstOrNull;
    final kids = store.students.where((s) => s['batch'] == batch).toList()..sort((x, y) => (x['id'] as int) - (y['id'] as int));
    final out = kids.where((k) => absentOn(dayKey()).contains(k['id'])).length;
    final pdfs = [
      for (final m in store.modules)
        if (m['batch'] == batch)
          for (final it in rows(m['items']))
            if (it['kind'] == 'pdf' && '${it['url'] ?? ''}'.startsWith('/api/files/')) it,
    ];
    return Screen(
      title: batch,
      subtitle: '${b?['days'] ?? ''}',
      color: color,
      children: [
        Doing(
          label: t('tday.takeAttendance'),
          icon: Icons.how_to_reg_rounded,
          color: color,
          onPressed: () async => push(context, Attendance(batch: batch)),
        ),
        Group(
          children: [
            Item(icon: Icons.event_busy_outlined, color: color, title: t('app.absentToday', [out]), subtitle: t('app.studentsN', [kids.length])),
            Item(icon: Icons.fact_check_outlined, color: color, title: t('tday.toMark', [toMark().where((x) => x.m['batch'] == batch).length]), onTap: () => push(context, const Marking(pushed: true))),
          ],
        ),
        if (pdfs.isNotEmpty)
          Group(
            title: t('pdfhl.open'),
            children: [
              for (final it in pdfs)
                Item(
                  icon: Icons.auto_awesome,
                  color: color,
                  title: '${it['title']}',
                  onTap: () => push(context, PdfScreen(file: '${it['url']}', title: '${it['title']}')),
                ),
            ],
          ),
        Section(t('app.tabs2.students')),
        Box(
          flush: true,
          children: [
            Paged(
              items: kids,
              resetKey: batch,
              row: (k) => Item(
                leading: Avatar('${k['name']}', size: 38, color: color),
                title: '${k['name']}',
                subtitle: '${t('app.roll')} ${k['id']} · ${k['guardianName'] ?? ''} · ${k['phone'] ?? ''}',
              ),
            ),
          ],
        ),
      ],
    );
  });
}

/// Messages from guardians, newest thread first.
class Inbox extends StatelessWidget {
  const Inbox({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final chats = guardianChats();
    return Screen(
      children: [
        if (chats.isEmpty) Box(children: [Muted(t('app.noMessages'))]),
        if (chats.isNotEmpty)
          Group(
            children: [
              for (final ch in chats)
                Item(
                  leading: Avatar('${ch['name']}', color: context.course(batchNo(ch['role']))),
                  title: '${ch['name']}',
                  subtitle: '${rows(ch['messages']).lastOrNull?['text'] ?? ''}',
                  trailing: ((ch['unread'] as num?) ?? 0) > 0 ? Tag(localNumber(ch['unread'], lang.code)) : null,
                  onTap: () => push(context, ChatScreen(threadId: '${ch['id']}')),
                ),
            ],
          ),
      ],
    );
  });
}

class ChatScreen extends StatelessWidget {
  const ChatScreen({super.key, required this.threadId});
  final String threadId;
  @override
  Widget build(BuildContext context) => Live(
    (context) => Screen(
      title: '${rows(store.state?['chats']).where((c) => c['id'] == threadId).firstOrNull?['name'] ?? ''}',
      children: [ChatThread(threadId: threadId, guardian: false)],
    ),
  );
}

/// Today's register: everyone starts present; tap a student to mark them absent (and back).
class Attendance extends StatefulWidget {
  const Attendance({super.key, required this.batch});
  final String batch;
  @override
  State<Attendance> createState() => _AttendanceState();
}

class _AttendanceState extends State<Attendance> {
  @override
  Widget build(BuildContext context) => Live((context) {
    final batch = widget.batch;
    final today = dayKey(), absent = absentOn(today), c = context.colors;
    final kids = store.students.where((s) => s['batch'] == batch).toList()..sort((a, b) => (a['id'] as int) - (b['id'] as int));
    return Screen(
      title: t('app.tabs2.attendance'),
      subtitle: '$batch · ${fmtDate(today)}',
      color: context.course(batchNo(batch)),
      children: [
        if (kids.isNotEmpty)
          Doing(
            label: t('app.allPresent'),
            icon: Icons.done_all,
            soft: true,
            onPressed: () => store.act('markAllPresent', [
              [for (final k in kids) k['id']],
              today,
            ]),
          ),
        if (kids.isNotEmpty)
          Box(
            flush: true,
            children: [
              Paged(
                items: kids,
                resetKey: batch,
                row: (k) {
                  // A tap shows at once, also without internet: what the server has, flipped once for each tap still on its way.
                  final out = absent.contains(k['id']) != store.pending('toggleAttendance', [k['id'], today]).isOdd;
                  return Semantics(
                    toggled: !out,
                    child: Item(
                      leading: SizedBox(width: 30, child: Muted('${k['id']}')),
                      title: '${k['name']}',
                      onTap: () => store.act('toggleAttendance', [k['id'], today]),
                      trailing: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(color: out ? c.error : c.primary, borderRadius: BorderRadius.circular(10)),
                        child: Text(
                          t(out ? 'app.absent' : 'app.present'),
                          style: TextStyle(fontWeight: FontWeight.w800, color: out ? c.onError : c.onPrimary),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
      ],
    );
  });
}

/// Hand-ins waiting for marks.
class Marking extends StatelessWidget {
  const Marking({super.key, this.pushed = false});
  final bool pushed;
  @override
  Widget build(BuildContext context) => Live((context) {
    final list = toMark();
    return Screen(
      title: pushed ? t('app.tabs2.marking') : null,
      children: [
        if (list.isEmpty)
          Box(
            children: [
              const ExcludeSemantics(
                child: Text('🎉', textAlign: TextAlign.center, style: TextStyle(fontSize: 44)),
              ),
              Text(t('tday.allClear'), textAlign: TextAlign.center, style: context.type.titleMedium),
            ],
          ),
        if (list.isNotEmpty) ...[
          Section(t('app.tabs2.marking')),
          Box(
            flush: true,
            children: [
              Paged(
                items: list,
                row: (x) => Item(
                  icon: Icons.edit_note_rounded,
                  color: context.course(batchNo(x.m['batch'])),
                  title: '${store.student(x.sid)?['name'] ?? '#${x.sid}'}',
                  subtitle: '${x.it['title']}\n${x.m['batch']}${x.sub['at'] is String ? ' · ${fmtWhen(x.sub['at'] as String)}' : ''}',
                  onTap: () => push(context, MarkOne(moduleId: x.m['id'] as int, itemId: x.it['id'] as int, sid: x.sid)),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  });
}

/// Look at one hand-in and give marks and a comment.
class MarkOne extends StatefulWidget {
  const MarkOne({super.key, required this.moduleId, required this.itemId, required this.sid});
  final int moduleId, itemId, sid;
  @override
  State<MarkOne> createState() => _MarkOneState();
}

class _MarkOneState extends State<MarkOne> {
  final marks = TextEditingController(), comment = TextEditingController();
  String? link;
  Json? get item => rows(store.modules.where((m) => m['id'] == widget.moduleId).firstOrNull?['items']).where((x) => x['id'] == widget.itemId).firstOrNull;
  Map? get sub => (item?['submissions'] as Map?)?['${widget.sid}'] as Map?;

  @override
  void initState() {
    super.initState();
    final s = sub;
    if (s?['grade'] != null) marks.text = show(s!['grade']);
    comment.text = '${s?['comment'] ?? ''}';
    if (s?['file'] is String) fileLink(s!['file'] as String).then((l) => mounted ? setState(() => link = l) : null);
  }

  @override
  void dispose() {
    marks.dispose();
    comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final it = item, s = sub;
    if (it == null || s == null) return Screen(title: '', children: [Muted(t('app.nothingToMark'))]);
    final points = (it['points'] as num?) ?? 20;
    final n = num.tryParse(marks.text.trim());
    final ok = n != null && n >= 0 && n <= points;
    final isPdf = '${s['fileName'] ?? ''}'.toLowerCase().endsWith('.pdf');
    return Screen(
      title: '${it['title']}',
      refresh: false,
      children: [
        H1('${store.student(widget.sid)?['name'] ?? '#${widget.sid}'}'),
        Muted('${s['fileName'] ?? ''}'),
        if (link != null && !isPdf)
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: InteractiveViewer(
              child: Image.network(link!, fit: BoxFit.contain, semanticLabel: '${s['fileName'] ?? ''}', errorBuilder: (_, _, _) => OpenFile(s['file'] as String?)),
            ),
          ),
        if (isPdf) OpenFile(s['file'] as String?),
        Box(
          title: '${t('app.marks')} (${t('app.outOf', [points])})',
          children: [
            Semantics(
              container: true,
              child: TextField(
                controller: marks,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: t('app.marks'), hintText: '0'),
              ),
            ),
            Semantics(
              container: true,
              child: TextField(
                controller: comment,
                minLines: 2,
                maxLines: 5,
                maxLength: 1000,
                decoration: InputDecoration(labelText: t('app.comment'), counterText: ''),
              ),
            ),
            Doing(
              label: t('app.saveMarks'),
              onPressed: !ok
                  ? null
                  : () async {
                      final saved = await store.act('gradeSubmission', [widget.moduleId, widget.itemId, widget.sid, n, comment.text.trim()]);
                      if (!context.mounted) return;
                      if (saved) return Navigator.pop(context);
                      if (store.status == Status.offline) toast(context, t('app.sentLater'));
                    },
            ),
          ],
        ),
      ],
    );
  });
}

/// Notices for the batches this person looks after, and posting a new one (Teacher and Institution apps).
class Notices extends StatefulWidget {
  const Notices({super.key});
  @override
  State<Notices> createState() => _NoticesState();
}

class _NoticesState extends State<Notices> {
  final title = TextEditingController(), body = TextEditingController();
  late var batch = '${store.myBatches.firstOrNull?['name'] ?? ''}';

  @override
  void dispose() {
    title.dispose();
    body.dispose();
    super.dispose();
  }

  Future<void> post() async {
    final saved = await store.act('addAnnouncement', [
      {'title': title.text.trim(), 'body': body.text.trim(), 'batch': batch},
    ]);
    if (!mounted) return;
    if (saved || store.status == Status.offline) {
      title.clear();
      body.clear();
      setState(() {});
    }
    if (!saved && store.status == Status.offline) toast(context, t('app.sentLater'));
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final names = {for (final b in store.myBatches) b['name']};
    final list = rows(store.state?['announcements']).where((a) => names.contains(a['batch']) || a['batch'] == 'all').toList();
    final ready = batch.isNotEmpty && title.text.trim().isNotEmpty && body.text.trim().isNotEmpty;
    return Screen(
      children: [
        Box(
          title: t('app.newNotice'),
          children: [
            Chips(value: batch, options: [for (final n in names) '$n'], onChanged: (v) => setState(() => batch = v)),
            Semantics(
              container: true,
              child: TextField(
                controller: title,
                maxLength: 120,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: t('app.noticeTitle'), counterText: '', fillColor: context.colors.surface),
              ),
            ),
            Semantics(
              container: true,
              child: TextField(
                controller: body,
                minLines: 3,
                maxLines: 8,
                maxLength: 2000,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: t('app.noticeBody'), counterText: '', alignLabelWithHint: true, fillColor: context.colors.surface),
              ),
            ),
            Doing(label: t('app.post'), icon: Icons.send_rounded, onPressed: ready ? post : null),
          ],
        ),
        if (list.isEmpty) Muted(t('app.noNotices')),
        if (list.isNotEmpty)
          Box(
            flush: true,
            children: [
              Paged(
                items: list,
                row: (a) => Item(icon: Icons.campaign_outlined, color: context.course(batchNo(a['batch'])), title: '${a['title']}', subtitle: '${a['body']}\n${a['batch']}${a['at'] is String ? ' · ${fmtWhen(a['at'] as String)}' : ''}'),
              ),
            ],
          ),
      ],
    );
  });
}

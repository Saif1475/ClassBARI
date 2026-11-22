import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'guardian.dart' show ChatThread;
import 'lesson.dart' show OpenFile;
import 'pdf.dart';

class TeacherApp extends StatelessWidget {
  const TeacherApp({super.key});
  @override
  Widget build(BuildContext context) => Tabs([
    (icon: Icons.home_outlined, label: t('app.tabs2.today'), page: const TeacherToday()),
    (icon: Icons.fact_check_outlined, label: t('app.tabs2.attendance'), page: const Attendance()),
    (icon: Icons.rate_review_outlined, label: t('app.tabs2.marking'), page: const Marking()),
    (icon: Icons.campaign_outlined, label: t('app.tabs2.notices'), page: const Notices()),
    (icon: Icons.person_outline, label: t('app.tabs.profile'), page: const TeacherProfile()),
  ]);
}

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

class TeacherToday extends StatelessWidget {
  const TeacherToday({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final batches = store.myBatches, names = {for (final b in batches) b['name']};
    final waiting = toMark().length, absent = absentOn(dayKey());
    final all = store.runsAll;
    final chats = rows(store.state?['chats']).where((c) => '${c['id']}'.startsWith('parent-') && (all || names.contains(c['role']))).toList();
    final pdfs = [
      for (final m in store.modules)
        if (names.contains(m['batch']))
          for (final it in rows(m['items']))
            if (it['kind'] == 'pdf' && '${it['url'] ?? ''}'.startsWith('/api/files/')) (m: m, it: it),
    ];
    return Screen(
      children: [
        H1(t('app.hello', [store.staffName.split(' ').first])),
        Box(
          color: waiting > 0 ? context.colors.tertiaryContainer : null,
          onTap: () => push(context, const Marking(pushed: true)),
          children: [
            Row(
              children: [
                Expanded(child: H2(waiting > 0 ? t('app.toMark', [waiting]) : t('app.nothingToMark'))),
                const Icon(Icons.chevron_right),
              ],
            ),
          ],
        ),
        H2(t('app.myBatches')),
        for (final b in batches)
          Builder(
            builder: (context) {
              final kids = store.students.where((s) => s['batch'] == b['name']).toList();
              return Box(
                onTap: () => push(context, Attendance(batch: '${b['name']}')),
                children: [
                  Row(
                    children: [
                      Expanded(child: Strong('${b['name']}')),
                      const Icon(Icons.chevron_right),
                    ],
                  ),
                  Muted('${b['days'] ?? ''} · ${t('app.studentsN', [kids.length])}'),
                  Text(t('app.absentToday', [kids.where((k) => absent.contains(k['id'])).length])),
                ],
              );
            },
          ),
        if (pdfs.isNotEmpty)
          Box(
            title: t('pdfhl.open'),
            children: [
              for (final (i, x) in pdfs.indexed)
                Line(
                  first: i == 0,
                  onTap: () => push(context, PdfScreen(file: '${x.it['url']}', title: '${x.it['title']}')),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Strong('${x.it['title']}'), Muted('${x.m['batch']}')]),
                ),
            ],
          ),
        if (chats.isNotEmpty)
          Box(
            title: t('app.guardianChats'),
            children: [
              for (final (i, ch) in chats.indexed)
                Line(
                  first: i == 0,
                  onTap: () => push(context, ChatScreen(threadId: '${ch['id']}')),
                  child: Row(
                    spacing: 12,
                    children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Strong('${ch['name']}'), Muted('${rows(ch['messages']).lastOrNull?['text'] ?? ''}')]),
                      ),
                      if (((ch['unread'] as num?) ?? 0) > 0) Badge(label: Text(localNumber(ch['unread'], lang.code))),
                    ],
                  ),
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
  const Attendance({super.key, this.batch});
  final String? batch;
  @override
  State<Attendance> createState() => _AttendanceState();
}

class _AttendanceState extends State<Attendance> {
  late var batch = widget.batch ?? '${store.myBatches.firstOrNull?['name'] ?? ''}';
  @override
  Widget build(BuildContext context) => Live((context) {
    final today = dayKey(), absent = absentOn(today), c = context.colors;
    final kids = store.students.where((s) => s['batch'] == batch).toList()..sort((a, b) => (a['id'] as int) - (b['id'] as int));
    return Screen(
      title: widget.batch == null ? null : t('app.tabs2.attendance'),
      children: [
        if (widget.batch == null) H1(t('app.tabs2.attendance')),
        Chips(value: batch, options: [for (final b in store.myBatches) '${b['name']}'], onChanged: (v) => setState(() => batch = v)),
        if (batch.isEmpty) Muted(t('app.chooseBatch')),
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
            children: [
              Paged(
                items: kids,
                resetKey: batch,
                row: (k, first) {
                  // A tap shows at once, also without internet: what the server has, flipped once for each tap still on its way.
                  final out = absent.contains(k['id']) != store.pending('toggleAttendance', [k['id'], today]).isOdd;
                  return Line(
                    first: first,
                    onTap: () => store.act('toggleAttendance', [k['id'], today]),
                    child: Semantics(
                      toggled: !out,
                      child: Row(
                        spacing: 12,
                        children: [
                          SizedBox(width: 36, child: Muted('${k['id']}')),
                          Expanded(child: Text('${k['name']}')),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(color: out ? c.error : c.primary, borderRadius: BorderRadius.circular(10)),
                            child: Text(
                              t(out ? 'app.absent' : 'app.present'),
                              style: TextStyle(fontWeight: FontWeight.w800, color: out ? c.onError : c.onPrimary),
                            ),
                          ),
                        ],
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

class Marking extends StatelessWidget {
  const Marking({super.key, this.pushed = false});
  final bool pushed;
  @override
  Widget build(BuildContext context) => Live((context) {
    final list = toMark();
    return Screen(
      title: pushed ? t('app.tabs2.marking') : null,
      children: [
        if (!pushed) H1(t('app.tabs2.marking')),
        if (list.isEmpty) Muted(t('app.nothingToMark')),
        if (list.isNotEmpty)
          Box(
            children: [
              Paged(
                items: list,
                row: (x, first) => Line(
                  first: first,
                  onTap: () => push(context, MarkOne(moduleId: x.m['id'] as int, itemId: x.it['id'] as int, sid: x.sid)),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [Strong('${store.student(x.sid)?['name'] ?? '#${x.sid}'}'), Text('${x.it['title']}'), Muted('${x.m['batch']}${x.sub['at'] is String ? ' · ${fmtWhen(x.sub['at'] as String)}' : ''}')],
                        ),
                      ),
                      const Icon(Icons.chevron_right),
                    ],
                  ),
                ),
              ),
            ],
          ),
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
        H1(t('app.tabs2.notices')),
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
                decoration: InputDecoration(labelText: t('app.noticeTitle'), counterText: ''),
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
                decoration: InputDecoration(labelText: t('app.noticeBody'), counterText: '', alignLabelWithHint: true),
              ),
            ),
            Doing(label: t('app.post'), icon: Icons.send, onPressed: ready ? post : null),
          ],
        ),
        if (list.isEmpty) Muted(t('app.noNotices')),
        if (list.isNotEmpty)
          Box(
            children: [
              Paged(
                items: list,
                row: (a, first) => Line(
                  first: first,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, spacing: 2, children: [Strong('${a['title']}'), Text('${a['body']}'), Muted('${a['batch']}${a['at'] is String ? ' · ${fmtWhen(a['at'] as String)}' : ''}')]),
                ),
              ),
            ],
          ),
      ],
    );
  });
}

class TeacherProfile extends StatelessWidget {
  const TeacherProfile({super.key});
  @override
  Widget build(BuildContext context) => Live(
    (context) => Profile(
      rows: [
        (t('settings.yourName'), store.staffName),
        (t('settings.instituteName'), '${store.state?['instituteName'] ?? store.state?['teacherName'] ?? ''}'),
        (t('app.myBatches'), [for (final b in store.myBatches) b['name']].join(', ')),
      ],
    ),
  );
}

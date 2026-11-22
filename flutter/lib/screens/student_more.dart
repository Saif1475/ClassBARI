// The student app's extra pages, the same as on the website: asking the teacher a doubt (more follow).
import 'dart:convert';

import 'package:material_ui/material_ui.dart';

import '../icons.g.dart';
import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'lesson.dart' show pickPhoto, VideoBox;
import '../icon.dart';

/// A picture saved in the data as a data: link (doubts, replies). Nothing is drawn for anything else.
class DataPicture extends StatelessWidget {
  const DataPicture(this.url, {super.key});
  final String url;
  @override
  Widget build(BuildContext context) {
    final comma = url.indexOf(',');
    if (!url.startsWith('data:image/') || comma < 0) return const SizedBox.shrink();
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Image.memory(base64Decode(url.substring(comma + 1)), height: 280, fit: BoxFit.contain, semanticLabel: t('doubts.photo')),
    );
  }
}

/// One doubt: the question (and photo), whether it is solved, and the teacher's answers. `below`: the teacher's reply box.
class DoubtCard extends StatelessWidget {
  const DoubtCard(this.d, {super.key, this.below});
  final Json d;
  final Widget? below;
  @override
  Widget build(BuildContext context) => Box(
    children: [
      Wrap(spacing: 8, children: [Tag(d['solved'] == true ? t('doubts.solved') : t('doubts.open'), kind: d['solved'] == true ? 'ok' : 'note'), if (d['at'] is String) Muted(fmtWhen(d['at'] as String))]),
      Text('${d['text'] ?? ''}'),
      if (d['image'] is String) DataPicture(d['image'] as String),
      for (final r in rows(d['replies']))
        Container(
          margin: const EdgeInsets.only(left: 16),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: context.colors.primaryContainer.withValues(alpha: .6), borderRadius: BorderRadius.circular(10)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 4,
            children: [
              Strong('${r['by'] ?? ''}'),
              if ('${r['text'] ?? ''}'.isNotEmpty) Text('${r['text']}'),
              if (r['image'] is String) DataPicture(r['image'] as String),
              // shortcut: voice notes play on the website only; add an audio player package to play them here.
              if (r['audio'] is String) Muted(t('app.voiceOnWeb')),
            ],
          ),
        ),
      ?below,
    ],
  );
}

/// Ask your teacher: a question with an optional photo of the problem, and the answers to my earlier ones.
class DoubtsScreen extends StatefulWidget {
  const DoubtsScreen({super.key});
  @override
  State<DoubtsScreen> createState() => _DoubtsScreenState();
}

class _DoubtsScreenState extends State<DoubtsScreen> {
  final text = TextEditingController();
  ({String name, dynamic bytes, String data})? photo;

  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  Future<void> addPhoto(bool camera) async {
    final p = await pickPhoto(context, camera: camera);
    if (p != null && mounted) setState(() => photo = p);
  }

  Future<void> send() async {
    final me = store.me;
    if (me == null || text.text.trim().isEmpty) return;
    final saved = await store.act('askDoubt', [me['id'], me['batch'], text.text.trim(), photo?.data]);
    text.clear();
    setState(() => photo = null);
    if (mounted) toast(context, saved ? t('app.questionSent') : t('app.sentLater'));
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final me = store.me?['id'];
    final mine = rows(store.state?['doubts']).where((d) => d['studentId'] == me).toList();
    return Screen(
      title: t('doubts.ask'),
      children: [
        Box(
          children: [
            TextField(controller: text, minLines: 3, maxLines: 8, maxLength: 2000, onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: t('doubts.ask'), hintText: t('doubts.askPh'))),
            if (photo != null) Tag(t('doubts.photoAdded'), kind: 'ok'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Doing(label: t('app.choosePhoto'), icon: I.image, soft: true, small: true, onPressed: () => addPhoto(false)),
                Doing(label: t('app.takePhoto'), icon: I.camera, soft: true, small: true, onPressed: () => addPhoto(true)),
                Doing(label: t('doubts.askBtn'), icon: I.send, small: true, onPressed: text.text.trim().isEmpty ? null : send),
              ],
            ),
          ],
        ),
        if (mine.isEmpty) Muted(t('doubts.none')),
        for (final d in mine) DoubtCard(d),
      ],
    );
  });
}

/// Practice: the course's quiz questions, untimed and not graded, one chapter at a time; "My mistakes" first.
/// Only questions whose answer the student may see are sent (quizzes they've taken). 2 XP per right answer, as on the website.
class PracticeScreen extends StatefulWidget {
  const PracticeScreen({super.key});
  @override
  State<PracticeScreen> createState() => _PracticeScreenState();
}

class _PracticeScreenState extends State<PracticeScreen> {
  Object? chapterId;
  var i = 0, right = 0;
  int? pick;

  List<({Object id, String title, List<Json> questions})> chapters() {
    final me = '${store.me?['id']}';
    final items = [for (final m in store.modules) ...rows(m['items'])];
    final wrong = [
      for (final it in items)
        for (final (n, q) in rows(it['questions']).indexed)
          if ((((it['answers'] as Map?)?[me]) as List?)?.elementAtOrNull(n) == false) q,
    ];
    return [
      if (wrong.isNotEmpty) (id: -1, title: t('skills.mistakes'), questions: wrong),
      for (final m in store.modules) (id: m['id'] as Object, title: '${m['title']}', questions: [for (final it in rows(m['items'])) ...rows(it['questions']).where((q) => (q['answer'] as num? ?? -1) >= 0)]),
    ].where((c) => c.questions.isNotEmpty).toList();
  }

  void restart(Object? id) => setState(() {
    chapterId = id;
    i = right = 0;
    pick = null;
  });

  @override
  Widget build(BuildContext context) => Live((context) {
    final list = chapters();
    if (list.isEmpty) return Screen(title: t('practice.title'), children: [Muted(t('practice.empty'))]);
    final chapter = list.where((c) => c.id == chapterId).firstOrNull ?? list.first;
    final q = chapter.questions.elementAtOrNull(i);
    final c = context.colors;
    return Screen(
      title: t('practice.title'),
      children: [
        Muted(t('practice.sub')),
        DropdownButtonFormField<Object>(
          initialValue: chapter.id,
          isExpanded: true,
          decoration: InputDecoration(labelText: t('practice.chapter')),
          items: [for (final ch in list) DropdownMenuItem(value: ch.id, child: Text('${ch.title} (${ch.questions.length})', overflow: TextOverflow.ellipsis))],
          onChanged: restart,
        ),
        if (q == null)
          Box(
            color: c.secondaryContainer,
            children: [Strong(t('practice.done', [right, chapter.questions.length])), Doing(label: t('practice.again'), onPressed: () async => restart(chapter.id))],
          )
        else
          Box(
            children: [
              Muted(t('app.question', [i + 1, chapter.questions.length])),
              Strong('${q['q'] ?? ''}'),
              for (final (n, opt) in ((q['options'] as List?) ?? const []).indexed)
                Builder(builder: (context) {
                  final answer = (q['answer'] as num).toInt();
                  final tone = pick == null ? null : (n == answer ? c.primaryContainer : (n == pick ? c.errorContainer : null));
                  return Material(
                    color: tone ?? c.surface,
                    shape: RoundedRectangleBorder(side: BorderSide(color: c.outlineVariant), borderRadius: BorderRadius.circular(12)),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: pick != null
                          ? null
                          : () {
                              setState(() => pick = n);
                              if (n == answer) {
                                right++;
                                store.act('earnXp', [store.me?['id'], 2]);
                              }
                            },
                      child: Padding(padding: const EdgeInsets.all(14), child: Text('$opt')),
                    ),
                  );
                }),
              if (pick != null) ...[
                Strong(pick == q['answer'] ? t('practice.correct') : t('practice.wrong', ['${(q['options'] as List)[(q['answer'] as num).toInt()]}']), color: pick == q['answer'] ? c.primary : c.error),
                Doing(label: t('practice.next'), onPressed: () async => setState(() {
                  i++;
                  pick = null;
                })),
              ],
            ],
          ),
      ],
    );
  });
}

/// The calendar entries a batch sees, by time: its events, its live class, and the due dates of its homework, quizzes
/// and exams. The same list as the website's (lms-store `calendar`, filtered to the batch).
List<Json> calendarFor(Object? batch) {
  final live = store.state?['liveClass'];
  final list = <Json>[
    for (final e in rows(store.state?['calendarEvents'])) {...e, 'id': 'e${e['id']}'},
    if (live is Map && '${live['batch'] ?? ''}'.isNotEmpty && '${live['topic'] ?? ''}'.isNotEmpty && live['start'] is String)
      {'id': 'live', 'title': '${live['batch']}: ${live['topic']}', 'start': live['start'], 'meta': store.state?['teacherName'] ?? '', 'kind': 'live', 'batch': live['batch']},
    for (final m in store.modules)
      for (final it in rows(m['items']))
        if (const ['quiz', 'task', 'exam'].contains(it['kind']) && it['dueDate'] is String)
          {'id': 'i${it['id']}', 'title': it['title'], 'start': it['dueDate'], 'meta': m['batch'] ?? '', 'kind': it['kind'] == 'task' ? 'due' : 'exam', 'allDay': true, 'batch': m['batch']},
  ].where((e) => e['start'] is String && ('${e['batch'] ?? ''}'.isEmpty || e['batch'] == batch)).toList();
  list.sort((a, b) => toDate(a['start'] as String).compareTo(toDate(b['start'] as String)));
  return list;
}

/// Calendar: everything coming up for the student's batch, with a chip per day.
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});
  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  String? day; // null: all days

  @override
  Widget build(BuildContext context) => Live((context) {
    final all = calendarFor(store.me?['batch']);
    final days = {for (final e in all) dayKey(toDate(e['start'] as String))}.toList();
    final shown = day == null ? all : all.where((e) => dayKey(toDate(e['start'] as String)) == day).toList();
    final c = context.colors;
    return Screen(
      title: t('student.calendar'),
      subtitle: t('student.calendarSub'),
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            ChoiceChip(label: Text(t('student.all')), selected: day == null, onSelected: (_) => setState(() => day = null)),
            for (final d in days) ChoiceChip(label: Text(fmtDate(d)), selected: day == d, onSelected: (_) => setState(() => day = d)),
          ],
        ),
        if (shown.isEmpty) Muted(t('app.nothingYet')),
        for (final e in shown)
          Box(
            children: [
              Row(
                spacing: 12,
                children: [
                  Container(
                    width: 56,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(color: c.primary, borderRadius: BorderRadius.circular(12)),
                    child: Text(fmtDate(e['start'] as String), textAlign: TextAlign.center, style: context.type.labelMedium?.copyWith(color: c.onPrimary, fontWeight: FontWeight.w800)),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: 2,
                      children: [
                        Strong('${e['title'] ?? ''}'),
                        Wrap(spacing: 8, children: [Tag(t('kinds.${e['kind']}'), kind: e['kind'] == 'exam' ? 'note' : 'plain'), if (e['allDay'] != true) Muted(fmtTime(e['start'] as String))]),
                        if ('${e['meta'] ?? ''}'.isNotEmpty) Muted('${e['meta']}'),
                      ],
                    ),
                  ),
                ],
              ),
              if (e['kind'] == 'live' && '${(store.state?['liveClass'] as Map?)?['link'] ?? ''}'.startsWith('http'))
                Doing(label: t('student.joinClass'), icon: I.external, small: true, onPressed: () => openLink(context, '${(store.state?['liveClass'] as Map)['link']}')),
            ],
          ),
      ],
    );
  });
}

/// Explore: the institute's video library, by subject and level; free videos for everyone, the rest for students
/// whose batch the video's teacher teaches (the website's rule).
class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});
  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  var chip = 'all', q = '';

  @override
  Widget build(BuildContext context) => Live((context) {
    final all = rows(store.state?['exploreVideos']);
    final subjects = {for (final v in all) '${v['subject']}'}, levels = {for (final v in all) '${v['level']}'};
    final needle = q.trim().toLowerCase();
    final videos = all
        .where((v) => (chip == 'all' || v['subject'] == chip || v['level'] == chip || (chip == 'free' && v['free'] == true)) && (needle.isEmpty || '${v['title']} ${v['teacher']} ${v['subject']}'.toLowerCase().contains(needle)))
        .toList();
    return Screen(
      title: t('student.explore'),
      children: [
        TextField(onChanged: (v) => setState(() => q = v), decoration: InputDecoration(prefixIcon: Ico(I.search), hintText: t('app.search'))),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final (key, label) in [('all', t('student.all')), for (final s in subjects) (s, s), for (final l in levels) (l, l), ('free', t('student.free'))])
              ChoiceChip(label: Text(label), selected: chip == key, onSelected: (_) => setState(() => chip = key)),
          ],
        ),
        if (videos.isEmpty) Muted(t('app.nothingYet')),
        if (videos.isNotEmpty)
          Group(
            children: [
              for (final v in videos)
                Item(
                  icon: I.play,
                  title: '${v['title']}',
                  subtitle: '${v['teacher']} · ${v['subject']} · ${v['length']}',
                  trailing: v['free'] == true ? Tag(t('student.free'), kind: 'ok') : null,
                  onTap: () => push(context, WatchScreen(videoId: v['id'])),
                ),
            ],
          ),
      ],
    );
  });
}

class WatchScreen extends StatelessWidget {
  const WatchScreen({super.key, required this.videoId});
  final Object? videoId;
  @override
  Widget build(BuildContext context) => Live((context) {
    final all = rows(store.state?['exploreVideos']);
    final v = all.where((x) => x['id'] == videoId).firstOrNull;
    if (v == null) return Screen(title: '', children: [Muted(t('app.nothingYet'))]);
    final batch = store.me?['batch'];
    final locked = v['free'] != true && !store.batches.any((b) => b['name'] == batch && b['teacher'] == v['teacher']);
    final more = all.where((x) => x['id'] != v['id'] && (x['subject'] == v['subject'] || x['teacher'] == v['teacher'])).take(6);
    return Screen(
      title: '${v['title']}',
      children: [
        if (locked) Box(color: context.colors.inverseSurface, children: [Strong(t('video.locked'), color: context.colors.onInverseSurface), Muted(t('video.lockedSub'))]) else VideoBox(v['url'] as String?),
        Muted('${v['teacher']} · ${v['subject']} · ${v['level']}'),
        if (more.isNotEmpty) Section(t('video.more')),
        for (final x in more) Item(icon: I.play, title: '${x['title']}', subtitle: '${x['teacher']} · ${x['length']}', onTap: () => Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => WatchScreen(videoId: x['id'])))),
      ],
    );
  });
}

// The student app's extra pages, the same as on the website: asking the teacher a doubt, practice, calendar,
// explore, my notes, class points and story, portfolio, topic mastery and the live class.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:just_audio/just_audio.dart';
import 'package:material_ui/material_ui.dart';

import '../api.dart';

import '../icons.g.dart';
import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'lesson.dart' show pickPhoto, VideoBox;
import 'student.dart' show liveFor;
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
              if (r['audio'] is String) VoiceNote(r['audio'] as String),
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
  const CalendarScreen({super.key, this.batch});
  /// Whose batch (a guardian's chosen child); the signed-in student's when left out.
  final Object? batch;
  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  String? day; // null: all days

  @override
  Widget build(BuildContext context) => Live((context) {
    final all = calendarFor(widget.batch ?? store.me?['batch']);
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


/// The bytes of a data: link (a photo or voice note saved in the data), or null for anything else.
Uint8List? dataBytes(String url) => _data(url)?.contentAsBytes();
UriData? _data(String url) {
  try {
    return url.startsWith('data:') ? UriData.parse(url) : null;
  } catch (_) {
    return null;
  }
}

/// A voice note saved as a data: link (the teacher's answer to a doubt), played from memory.
class VoiceNote extends StatefulWidget {
  const VoiceNote(this.url, {super.key});
  final String url;
  @override
  State<VoiceNote> createState() => _VoiceNoteState();
}

class _VoiceNoteState extends State<VoiceNote> {
  AudioPlayer? player;

  @override
  void dispose() {
    player?.dispose();
    super.dispose();
  }

  Future<void> toggle() async {
    final p = player ??= AudioPlayer()..playerStateStream.listen((_) => mounted ? setState(() {}) : null);
    if (p.playing) return p.pause();
    try {
      if (p.audioSource == null) {
        // The player reads files, not data: links: the note goes to the app's temporary folder first.
        final d = _data(widget.url)!, ext = d.mimeType.split('/').last.replaceAll(RegExp(r'[^a-z0-9]'), '');
        final f = File('${Directory.systemTemp.path}/voice-${widget.url.hashCode.toUnsigned(32)}.${ext == 'mp4' ? 'm4a' : ext}');
        await f.writeAsBytes(d.contentAsBytes());
        await p.setFilePath(f.path);
      }
      if (p.processingState == ProcessingState.completed) await p.seek(Duration.zero);
      unawaited(p.play());
    } catch (_) {
      if (mounted) toast(context, t('app.noFile'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final playing = player?.playing == true && player?.processingState != ProcessingState.completed;
    return Align(alignment: Alignment.centerLeft, child: Doing(label: t('doubts.voice'), icon: playing ? I.pause : I.play, soft: true, small: true, onPressed: toggle));
  }
}

/// My notes: key points I saved (only I see them), a new one, and deleting one (addNote / deleteNote, as on the website).
class NotesScreen extends StatefulWidget {
  const NotesScreen({super.key});
  @override
  State<NotesScreen> createState() => _NotesScreenState();
}

class _NotesScreenState extends State<NotesScreen> {
  final title = TextEditingController(), text = TextEditingController();

  @override
  void dispose() {
    title.dispose();
    text.dispose();
    super.dispose();
  }

  Future<void> save() async {
    final saved = await store.act('addNote', [title.text.trim().isEmpty ? t('kp.myNotes') : title.text.trim(), text.text.trim()]);
    title.clear();
    text.clear();
    setState(() {});
    if (mounted) toast(context, saved ? t('kp.saved') : t('app.sentLater'));
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final notes = rows(store.state?['notes']);
    return Screen(
      title: t('kp.myNotes'),
      children: [
        Box(
          children: [
            TextField(controller: title, maxLength: 200, decoration: InputDecoration(labelText: t('app.noteTitle'), counterText: '')),
            TextField(controller: text, minLines: 3, maxLines: 10, maxLength: 20000, onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: t('kp.myNotes'), counterText: '')),
            Doing(label: t('kp.save'), icon: I.check, small: true, onPressed: text.text.trim().isEmpty ? null : save),
          ],
        ),
        if (notes.isEmpty) Muted(t('kp.noNotes')),
        for (final n in notes)
          Box(
            children: [
              Row(
                children: [
                  Expanded(child: Strong('${n['title'] ?? ''}')),
                  if (n['at'] is String) Muted(fmtWhen(n['at'] as String)),
                  IconButton(tooltip: '${t('common.remove')} ${n['title'] ?? ''}', icon: Ico(I.trash, size: 18), onPressed: () => store.act('deleteNote', [n['id']])),
                ],
              ),
              Text('${n['text'] ?? ''}'),
            ],
          ),
      ],
    );
  });
}

const kPointKinds = {'helping': 1, 'participation': 1, 'homework': 1, 'teamwork': 1, 'lateHomework': -1, 'offTask': -1}; // POINT_KINDS in mock-data.ts

/// Class points of one student: the total, this week's, and the latest five (the website's PointsSummary).
class PointsBox extends StatelessWidget {
  const PointsBox(this.studentId, {super.key});
  final Object? studentId;
  @override
  Widget build(BuildContext context) {
    final mine = rows(store.state?['points']).where((p) => p['studentId'] == studentId).toList();
    int value(Json p) => kPointKinds[p['kind']] ?? 0;
    final weekAgo = DateTime.now().subtract(const Duration(days: 7));
    final week = mine.where((p) => p['at'] is String && toDate(p['at'] as String).isAfter(weekAgo));
    final c = context.colors;
    return Box(
      children: [
        Row(children: [Expanded(child: H2(t('dojo.points'))), Big(localNumber(mine.fold<int>(0, (n, p) => n + value(p)), lang.code))]),
        Muted(t('dojo.week', [week.where((p) => value(p) > 0).length, week.where((p) => value(p) < 0).length])),
        if (mine.isEmpty) Muted(t('dojo.none')),
        for (final p in mine.take(5)) Text('${value(p) > 0 ? '+1' : '−1'} · ${t('dojo.kinds.${p['kind']}')}', style: TextStyle(color: value(p) > 0 ? c.primary : c.error)),
      ],
    );
  }
}

/// The class story of a batch: the teacher's posts with a photo (read only, as for students and guardians on the website).
class StoryBox extends StatelessWidget {
  const StoryBox(this.batch, {super.key});
  final Object? batch;
  @override
  Widget build(BuildContext context) {
    final posts = rows(store.state?['story']).where((p) => p['batch'] == batch).toList();
    return Box(
      title: t('dojo.story'),
      children: [
        if (posts.isEmpty) Muted(t('dojo.noStory')),
        for (final p in posts)
          Box(
            color: context.colors.surfaceContainer,
            children: [
              Row(children: [Expanded(child: Strong('${p['author'] ?? ''}')), if (p['at'] is String) Muted(fmtWhen(p['at'] as String))]),
              Text('${p['text'] ?? ''}'),
              if (p['image'] is String) DataPicture(p['image'] as String),
            ],
          ),
      ],
    );
  }
}

/// Photos of a student's work; `canAdd`: a new one with its name (addPortfolio, allowed for the student and their family).
class PortfolioBox extends StatefulWidget {
  const PortfolioBox(this.studentId, {super.key, this.canAdd = false, this.title});
  final Object? studentId;
  final bool canAdd;
  final String? title;
  @override
  State<PortfolioBox> createState() => _PortfolioBoxState();
}

class _PortfolioBoxState extends State<PortfolioBox> {
  final name = TextEditingController();
  String? image;

  @override
  void dispose() {
    name.dispose();
    super.dispose();
  }

  Future<void> add() async {
    final saved = await store.act('addPortfolio', [widget.studentId, name.text.trim(), image]);
    name.clear();
    setState(() => image = null);
    if (!saved && mounted && store.status == Status.offline) toast(context, t('app.sentLater'));
  }

  @override
  Widget build(BuildContext context) {
    final items = rows(store.state?['portfolio']).where((p) => p['studentId'] == widget.studentId).toList();
    return Box(
      title: widget.title ?? t('dojo.portfolio'),
      children: [
        if (widget.canAdd) ...[
          Muted(t('dojo.portfolioSub')),
          TextField(controller: name, maxLength: 200, onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: t('dojo.workTitle'), counterText: '')),
          if (image != null) Tag(t('doubts.photoAdded'), kind: 'ok'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final camera in [false, true])
                Doing(
                  label: t(camera ? 'app.takePhoto' : 'app.choosePhoto'),
                  icon: camera ? I.camera : I.image,
                  soft: true,
                  small: true,
                  onPressed: () async {
                    final p = await pickPhoto(context, camera: camera);
                    if (p != null && mounted) setState(() => image = p.data);
                  },
                ),
              Doing(label: t('dojo.addWork'), icon: I.plus, small: true, onPressed: image == null || name.text.trim().isEmpty ? null : add),
            ],
          ),
        ],
        if (items.isEmpty) Muted(t('dojo.noWork')),
        if (items.isNotEmpty)
          CardGrid([
            for (final p in items)
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 4,
                children: [
                  if (dataBytes('${p['image']}') case final bytes?)
                    ClipRRect(borderRadius: BorderRadius.circular(10), child: Image.memory(bytes, height: 140, width: double.infinity, fit: BoxFit.cover, semanticLabel: '${p['title']}')),
                  Strong('${p['title'] ?? ''}'),
                ],
              ),
          ]),
      ],
    );
  }
}

/// Per-topic results from tagged quiz questions (lms-views.ts topicMastery, for one student).
List<({String topic, int pct, String level})> topicMastery(List<Json> modules, Object? studentId) {
  final by = <String, (int, int)>{};
  for (final it in [for (final m in modules) ...rows(m['items'])]) {
    final qs = rows(it['questions']);
    final marks = ((it['answers'] as Map?)?['$studentId'] as List?) ?? const [];
    for (final (i, ok) in marks.indexed) {
      final topic = qs.elementAtOrNull(i)?['topic'];
      if (topic is! String || topic.isEmpty) continue;
      final (right, total) = by[topic] ?? (0, 0);
      by[topic] = (right + (ok == true ? 1 : 0), total + 1);
    }
  }
  return [
    for (final MapEntry(key: topic, value: (right, total)) in by.entries)
      (topic: topic, pct: jsRound(right / total * 100), level: jsRound(right / total * 100) >= 90 ? 'mastered' : (jsRound(right / total * 100) >= 60 ? 'proficient' : 'familiar')),
  ];
}

class MasteryBox extends StatelessWidget {
  const MasteryBox(this.modules, this.studentId, {super.key});
  final List<Json> modules;
  final Object? studentId;
  @override
  Widget build(BuildContext context) {
    final list = topicMastery(modules, studentId), c = context.colors;
    final tone = {'familiar': c.error, 'proficient': c.tertiary, 'mastered': c.primary};
    return Box(
      title: t('skills.title'),
      children: [
        Muted(t('skills.sub')),
        if (list.isEmpty) Muted(t('skills.none')),
        for (final r in list)
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 4,
            children: [
              Row(spacing: 8, children: [Expanded(child: Strong(r.topic)), Text('${localNumber(r.pct, lang.code)}%'), Text(t('skills.levels.${r.level}'), style: TextStyle(color: tone[r.level], fontWeight: FontWeight.w700))]),
              MarkBar(r.pct, color: tone[r.level]),
            ],
          ),
      ],
    );
  }
}

/// A page holding one of the boxes above (points, story, portfolio, mastery), redrawn as the data changes.
Widget boxScreen(String title, List<Widget> Function() body) => Live((context) => Screen(title: title, children: body()));

const kJitsi = String.fromEnvironment('JITSI_DOMAIN', defaultValue: 'meet.jit.si'); // NEXT_PUBLIC_JITSI_DOMAIN

/// The live class's video room, built as the website's VideoRoom builds it (opened in the browser or Jitsi app).
String jitsiUrl({required String room, required String batch, required String topic, required String name, bool audioOnly = false}) =>
    'https://$kJitsi/$room#userInfo.displayName=${Uri.encodeComponent(jsonEncode(name))}&config.subject=${Uri.encodeComponent(jsonEncode('$batch · $topic'))}'
    '${audioOnly ? '&config.startAudioOnly=true&config.startWithVideoMuted=true' : ''}';

/// One random id per phone, so the server counts one join, one hand and one vote per device (the website's voter id).
String get voterId {
  var v = store.prefs.getString('classbari-poll-voter');
  if (v == null) {
    final r = Random.secure();
    v = List.generate(32, (_) => r.nextInt(16).toRadixString(16)).join();
    store.prefs.setString('classbari-poll-voter', v);
  }
  return v;
}

/// The bodies the website's live class posts to /api/class and /api/poll (LiveClassroom.tsx, LivePollBanner.tsx).
Json joinBody(String batch, String voter, String name, Object? studentId) => {'action': 'join', 'batch': batch, 'voter': voter, 'name': name, 'studentId': studentId};
Json handBody(String batch, String voter, String name, bool up) => {'action': 'hand', 'batch': batch, 'voter': voter, 'name': name, 'up': up};
Json voteBody(String batch, Object? pollId, String voter, int option) => {'action': 'vote', 'batch': batch, 'pollId': pollId, 'voter': voter, 'option': option};

const _reactions = ['👍', '❤️', '😂', '👏', '❓']; // REACTIONS in live-class.ts

/// The live class of my batch: joining counts as attending; raise a hand, react, answer the poll, see the board and
/// open the video room. Asks the server every 2 seconds while this page is open, as the website does.
class LiveClassScreen extends StatefulWidget {
  const LiveClassScreen({super.key});
  @override
  State<LiveClassScreen> createState() => _LiveClassScreenState();
}

class _LiveClassScreenState extends State<LiveClassScreen> {
  Json? v, poll;
  String? board;
  var boardAt = 0, joined = false, loaded = false;
  int? sent; // the poll option I just picked
  Timer? timer;
  final voter = voterId;
  String get batch => '${store.me?['batch'] ?? ''}';
  String get name => '${store.me?['name'] ?? ''}';

  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 2), (_) => load());
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<Json?> get(String path) async {
    try {
      final res = await api(path);
      return res.statusCode == 200 ? jsonDecode(res.body) as Json : null;
    } catch (_) {
      return null;
    }
  }

  var busy = false; // on slow internet the next ask waits for the last answer

  Future<void> load() async {
    if (batch.isEmpty || busy) return;
    busy = true;
    final q = 'batch=${Uri.encodeQueryComponent(batch)}&voter=$voter';
    final (c, p) = await (get('/api/class?$q&board=$boardAt'), get('/api/poll?$q')).wait;
    busy = false;
    if (!mounted) return;
    setState(() {
      loaded = true;
      // A failed request keeps what was shown (as the website's polling does).
      if (c != null) v = c['live'] == true ? c : null;
      if (p != null) {
        final next = p['poll'] as Json?;
        if (next?['id'] != poll?['id']) sent = null; // a new poll: answer again
        poll = next;
      }
      if (v?['board'] is String) {
        board = v!['board'] as String;
        boardAt = (v!['boardAt'] as num).toInt();
      } else if (v == null || v!['boardAt'] == 0) {
        board = null;
        boardAt = 0;
      }
    });
    if (v != null && !joined) {
      joined = true; // opening the live class counts as attending (one record per device)
      unawaited(post('/api/class', joinBody(batch, voter, name, store.me?['id'])));
    }
  }

  Future<bool> post(String path, Json body) async {
    try {
      final res = await api(path, body: body);
      return res.statusCode == 200 || res.statusCode == 409;
    } catch (_) {
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final live = v, c = context.colors;
    if (live == null) {
      final next = liveFor(store.me?['batch']);
      return Screen(
        title: t('liveRoom.badge'),
        children: [
          if (!loaded) const Loading() else Box(children: [H2(t('liveRoom.notLive')), if (next != null) Muted('${t('app.nextLive')}: ${next['topic']} · ${fmtDateTime(next['start'] as String)}')]),
        ],
      );
    }
    final topic = '${live['topic'] ?? ''}', myHand = live['myHand'] == true;
    String url(bool audio) => jitsiUrl(room: '${live['room']}', batch: batch, topic: topic, name: name, audioOnly: audio);
    return Screen(
      title: t('liveRoom.badge'),
      children: [
        Box(color: c.errorContainer, children: [Strong('● ${t('liveRoom.liveNow', [topic])} · ${live['teacher'] ?? ''}', color: c.onErrorContainer)]),
        Box(
          title: t('liveRoom.room'),
          children: [
            Muted(t('liveRoom.studentHow')),
            Doing(label: '📹 ${t('liveRoom.join')}', onPressed: () => openLink(context, url(false))),
            Doing(label: '🎧 ${t('liveRoom.audioOnly')}', soft: true, onPressed: () => openLink(context, url(true))),
            Muted(t('liveRoom.privacy')),
          ],
        ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            Doing(
              label: '✋ ${myHand ? t('liveRoom.handUp') : t('liveRoom.raiseHand')}',
              soft: !myHand,
              small: true,
              onPressed: () async {
                await post('/api/class', handBody(batch, voter, name, !myHand));
                await load();
              },
            ),
            for (final e in _reactions)
              Semantics(
                label: t('liveRoom.react', [e]),
                child: IconButton.filledTonal(onPressed: () => post('/api/class', {'action': 'react', 'batch': batch, 'voter': voter, 'emoji': e}), icon: ExcludeSemantics(child: Text(e, style: const TextStyle(fontSize: 20)))),
              ),
          ],
        ),
        if (poll case final p?) _LivePoll(p, mine: (p['mine'] as num?)?.toInt() ?? sent, onVote: (i) async {
          setState(() => sent = i);
          if (!await post('/api/poll', voteBody(batch, p['id'], voter, i)) && mounted) setState(() => sent = null);
        }),
        if (board != null) Box(title: '📝 ${t('liveRoom.board')}', children: [DataPicture(board!)]),
      ],
    );
  }
}

/// The teacher's one-question poll: pick an answer, then see how everyone answered (LivePollBanner.tsx).
class _LivePoll extends StatelessWidget {
  const _LivePoll(this.p, {required this.mine, required this.onVote});
  final Json p;
  final int? mine;
  final Future<void> Function(int) onVote;
  @override
  Widget build(BuildContext context) {
    final options = [for (final o in (p['options'] as List?) ?? const []) '$o'];
    final counts = [for (final n in (p['counts'] as List?) ?? const []) (n as num).toInt()];
    final total = (p['total'] as num?)?.toInt() ?? 0, voted = mine != null, c = context.colors;
    return Box(
      children: [
        Row(children: [Expanded(child: Tag('● ${t('poll.badge')}', kind: 'bad')), Muted(t('poll.responses', [total]))]),
        Strong('${p['question'] ?? ''}'),
        for (final (i, o) in options.indexed)
          if (!voted)
            OutlinedButton(onPressed: () => onVote(i), child: Align(alignment: Alignment.centerLeft, child: Text('${String.fromCharCode(65 + i)}. $o'))),
        if (voted)
          for (final (i, o) in options.indexed) ...[
            Row(
              children: [
                Expanded(child: Text('${String.fromCharCode(65 + i)}. $o${p['correct'] == i ? ' ✓' : ''}${mine == i ? ' ←' : ''}', style: TextStyle(color: p['correct'] == i ? c.primary : (mine == i ? c.error : null), fontWeight: FontWeight.w600))),
                Strong('${total == 0 ? 0 : jsRound((counts.elementAtOrNull(i) ?? 0) / total * 100)}%'),
              ],
            ),
            MarkBar(total == 0 ? 0 : (counts.elementAtOrNull(i) ?? 0) / total * 100, plain: true),
          ],
      ],
    );
  }
}

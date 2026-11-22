// The teacher app's extra pages, the same as on the website: answering students' doubts, and one batch's gradebook,
// live class, calendar, course studio, video watch time and merit list.
import 'package:material_ui/material_ui.dart';

import '../icon.dart';
import '../icons.g.dart';
import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'lesson.dart' show pickPhoto;
import 'teacher.dart' show batchNo;
import 'teacher_tools.dart';

/// The doubts of this person's batches that still wait for an answer.
List<Json> openDoubts() {
  final names = {for (final b in store.myBatches) b['name']};
  return rows(store.state?['doubts']).where((d) => d['solved'] != true && (store.runsAll || names.contains(d['batch']))).toList();
}

/// Students' doubts: waiting or solved; answer with text, a photo and a voice note, and mark solved.
class TeacherDoubtsScreen extends StatefulWidget {
  const TeacherDoubtsScreen({super.key});
  @override
  State<TeacherDoubtsScreen> createState() => _TeacherDoubtsScreenState();
}

class _TeacherDoubtsScreenState extends State<TeacherDoubtsScreen> {
  var solved = false;

  @override
  Widget build(BuildContext context) => Live((context) {
    final names = {for (final b in store.myBatches) b['name']};
    final mine = rows(store.state?['doubts']).where((d) => store.runsAll || names.contains(d['batch'])).toList();
    final list = mine.where((d) => (d['solved'] == true) == solved).toList();
    return Screen(
      title: t('app.doubts'),
      children: [
        Wrap(
          spacing: 8,
          children: [
            ChoiceChip(label: Text(t('doubts.openList', [mine.where((d) => d['solved'] != true).length])), selected: !solved, onSelected: (_) => setState(() => solved = false)),
            ChoiceChip(label: Text(t('doubts.solvedList')), selected: solved, onSelected: (_) => setState(() => solved = true)),
          ],
        ),
        if (list.isEmpty) Muted(t('doubts.none')),
        for (final d in list)
          TeacherDoubtCard(
            d,
            below: _Reply(key: ValueKey(d['id']), doubtId: d['id']),
          ),
      ],
    );
  });
}

class _Reply extends StatefulWidget {
  const _Reply({super.key, required this.doubtId});
  final Object? doubtId;
  @override
  State<_Reply> createState() => _ReplyState();
}

class _ReplyState extends State<_Reply> {
  final text = TextEditingController();
  String? photo, audio;

  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  Future<void> send(bool solved) async {
    final saved = await store.act('replyDoubt', [
      widget.doubtId,
      {'text': text.text.trim(), 'image': ?photo, 'audio': ?audio, 'by': store.staffName},
      solved,
    ]);
    text.clear();
    setState(() => photo = audio = null);
    if (mounted) toast(context, saved ? t('doubts.replied') : t('app.sentLater'));
  }

  @override
  Widget build(BuildContext context) {
    final can = text.text.trim().isNotEmpty || photo != null || audio != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        TextField(
          controller: text,
          minLines: 2,
          maxLines: 6,
          maxLength: 2000,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(hintText: t('doubts.replyPh'), counterText: ''),
        ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            Doing(
              label: photo == null ? t('doubts.addPhoto') : t('doubts.photoAdded'),
              icon: I.image,
              soft: true,
              small: true,
              onPressed: () async {
                final p = await pickPhoto(context, camera: false);
                if (p != null && mounted) setState(() => photo = p.data);
              },
            ),
            if (audio == null) VoiceRecorder(onDone: (a) => setState(() => audio = a)) else VoicePlayer(audio!, key: ValueKey(audio.hashCode)),
            Doing(label: t('doubts.sendSolved'), icon: I.checkCircle, small: true, onPressed: can ? () => send(true) : null),
            Doing(label: t('doubts.send'), icon: I.send, soft: true, small: true, onPressed: can ? () => send(false) : null),
          ],
        ),
      ],
    );
  }
}

// ---- one batch's teaching tools, as on the website's course studio ------------------------------------------------
List<Json> batchModules(String batch) => store.modules.where((m) => m['batch'] == batch).toList();
List<Json> batchKids(String batch) => store.students.where((s) => s['batch'] == batch).toList()..sort((a, b) => (a['id'] as int) - (b['id'] as int));

/// The batch's live class topic, or null when none is set.
String? liveTopic(String batch) {
  final lc = store.state?['liveClass'] as Map?;
  return lc?['batch'] == batch && '${lc?['topic'] ?? ''}'.isNotEmpty ? '${lc!['topic']}' : null;
}

/// What an item is marked out of (the website's Gradebook `outOf`).
num outOf(Json it) => (it['points'] as num?) ?? (it['kind'] == 'quiz' ? 30 : 20);

/// Marks by student: a quiz's own scores; homework and exams only once marked (lms-views.ts itemScores).
Map<int, num> itemScores(Json it) => it['kind'] == 'quiz'
    ? {for (final e in ((it['scores'] as Map?) ?? const {}).entries) int.parse('${e.key}'): e.value as num}
    : {
        for (final e in ((it['submissions'] as Map?) ?? const {}).entries)
          if ((e.value as Map)['grade'] != null) int.parse('${e.key}'): (e.value as Map)['grade'] as num,
      };

/// The website's parseQuiz (src/lib/quiz.ts): blocks split by a blank line, the right option starts with *.
({List<Json> questions, int? bad}) parseQuiz(String text) {
  final blocks = text.split(RegExp(r'\n\s*\n')).map((b) => b.split('\n').map((l) => l.trim()).where((l) => l.isNotEmpty).toList()).where((b) => b.isNotEmpty);
  final questions = <Json>[];
  String? section;
  for (var b in blocks) {
    final heading = RegExp(r'^#{1,3}\s*(.{1,40})$').firstMatch(b.first);
    if (heading != null) {
      section = heading[1]!.trim();
      if (b.length == 1) continue;
      b = b.sublist(1); // heading written directly above a question
    }
    final first = b.first, lines = b.sublist(1);
    if (lines.length < 2 || lines.where((l) => l.startsWith('*')).length != 1) return (questions: <Json>[], bad: questions.length + 1);
    final tag = RegExp(r'^\[([^\]]{1,40})\]\s*(.+)$').firstMatch(first);
    questions.add({
      'q': tag != null ? tag[2] : first,
      if (tag != null) 'topic': tag[1]!.trim(),
      'section': ?section,
      'options': [for (final l in lines) l.replaceFirst(RegExp(r'^\*\s*'), '')],
      'answer': lines.indexWhere((l) => l.startsWith('*')),
    });
  }
  return (questions: questions, bad: null);
}

/// Marks per student from the latest six marked quizzes, homework and written exams, with each one's average.
class GradebookScreen extends StatelessWidget {
  const GradebookScreen({super.key, required this.batch});
  final String batch;
  @override
  Widget build(BuildContext context) => Live((context) {
    final all = [
      for (final m in batchModules(batch))
        for (final it in rows(m['items']))
          if (itemScores(it).isNotEmpty) it,
    ];
    final items = all.length > 6 ? all.sublist(all.length - 6) : all;
    final scores = [for (final it in items) itemScores(it)];
    return Screen(
      title: t('teacher.sections.grades'),
      subtitle: batch,
      color: context.course(batchNo(batch)),
      children: [
        if (items.isEmpty) Box(children: [Muted(t('teacher.noMarksYet'))]),
        if (items.isNotEmpty) ...[
          Muted(t('teacher.gradesHelpReal')),
          Box(
            flush: true,
            children: [
              Paged(
                items: batchKids(batch),
                resetKey: batch,
                row: (k) {
                  final id = k['id'] as int;
                  final parts = [
                    for (final (i, it) in items.indexed)
                      if (scores[i][id] != null) scores[i][id]! / outOf(it),
                  ];
                  return Item(
                    title: '${t('app.roll')} ${k['id']} · ${k['name']}',
                    subtitle: [for (final (i, it) in items.indexed) '${it['title']} (${show(outOf(it))}): ${scores[i][id] == null ? '—' : show(scores[i][id])}'].join('\n'),
                    trailing: Tag('${t('teacher.gAvg')} ${parts.isEmpty ? '—' : '${jsRound(parts.reduce((a, b) => a + b) / parts.length * 100)}%'}', kind: 'ok'),
                  );
                },
              ),
            ],
          ),
        ],
      ],
    );
  });
}

/// Pick a day, then a time.
Future<DateTime?> pickWhen(BuildContext context, DateTime from) async {
  final now = DateTime.now();
  final d = await showDatePicker(context: context, initialDate: from, firstDate: now.subtract(const Duration(days: 30)), lastDate: now.add(const Duration(days: 365)));
  if (d == null || !context.mounted) return null;
  final tm = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(from));
  return tm == null ? null : DateTime(d.year, d.month, d.day, tm.hour, tm.minute);
}

bool _isLink(String s) => RegExp(r'^https?://\S+\.\S+').hasMatch(s.trim());

/// The batch's next live class: topic, date and time, and the Zoom / Meet link (one for the institute, as on the website).
class LiveClassScreen extends StatefulWidget {
  const LiveClassScreen({super.key, required this.batch});
  final String batch;
  @override
  State<LiveClassScreen> createState() => _LiveClassScreenState();
}

class _LiveClassScreenState extends State<LiveClassScreen> {
  final topic = TextEditingController(), link = TextEditingController();
  DateTime? start;
  Map? get live => store.state?['liveClass'] as Map?;

  @override
  void initState() {
    super.initState();
    final lc = live;
    if (lc?['batch'] == widget.batch) {
      topic.text = '${lc!['topic'] ?? ''}';
      link.text = '${lc['link'] ?? ''}';
      start = DateTime.tryParse('${lc['start']}')?.toLocal();
    }
  }

  @override
  void dispose() {
    topic.dispose();
    link.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final lc = live, color = context.course(batchNo(widget.batch));
    final on = liveTopic(widget.batch) != null;
    final ready = topic.text.trim().isNotEmpty && start != null && _isLink(link.text);
    return Screen(
      title: t('teacher.sections.live'),
      subtitle: widget.batch,
      color: color,
      children: [
        if (!on) Box(children: [Muted(t('teacher.noLiveScheduled'))]),
        if (on)
          Box(
            children: [
              Strong('${lc!['topic']}'),
              Muted(fmtDateTime('${lc['start']}')),
              Doing(label: t('teacher.startClass'), icon: I.live, color: color, onPressed: () => openLink(context, '${lc['link']}')),
            ],
          ),
        Box(
          title: t('teacher.liveTitle'),
          children: [
            Semantics(
              container: true,
              child: TextField(
                controller: topic,
                maxLength: 200,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: t('teacher.liveTopic'), counterText: ''),
              ),
            ),
            Doing(
              label: '${t('teacher.liveStart')}: ${start == null ? '—' : fmtDateTime(start!.toIso8601String())}',
              icon: I.calendar,
              soft: true,
              onPressed: () async {
                final d = await pickWhen(context, start ?? DateTime.now());
                if (d != null) setState(() => start = d);
              },
            ),
            Semantics(
              container: true,
              child: TextField(
                controller: link,
                keyboardType: TextInputType.url,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: t('teacher.liveLink'), hintText: 'https://'),
              ),
            ),
            Doing(
              label: t('teacher.liveSave'),
              icon: I.check,
              onPressed: !ready
                  ? null
                  : () async {
                      final saved = await store.act('updateLiveClass', [
                        {'batch': widget.batch, 'topic': topic.text.trim(), 'start': start!.toUtc().toIso8601String(), 'link': link.text.trim()},
                      ]);
                      if (context.mounted) toast(context, saved ? t('teacher.toast.liveUpdated') : t('app.sentLater'));
                    },
            ),
          ],
        ),
      ],
    );
  });
}

/// The batch's calendar: live classes, exams and deadlines that students see; add one.
class BatchCalendarScreen extends StatefulWidget {
  const BatchCalendarScreen({super.key, required this.batch});
  final String batch;
  @override
  State<BatchCalendarScreen> createState() => _BatchCalendarScreenState();
}

class _BatchCalendarScreenState extends State<BatchCalendarScreen> {
  final title = TextEditingController();
  var kind = 'live';
  late var day = DateTime.now().add(const Duration(days: 1));
  var from = const TimeOfDay(hour: 17, minute: 0), to = const TimeOfDay(hour: 18, minute: 15); // the website's defaults

  @override
  void dispose() {
    title.dispose();
    super.dispose();
  }

  String at(TimeOfDay x) => DateTime(day.year, day.month, day.day, x.hour, x.minute).toUtc().toIso8601String();

  Future<void> pickTime(bool start) async {
    final x = await showTimePicker(context: context, initialTime: start ? from : to);
    if (x != null) setState(() => start ? from = x : to = x);
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final events = rows(store.state?['calendarEvents']).where((e) => e['batch'] == null || e['batch'] == widget.batch).toList()..sort((a, b) => '${a['start']}'.compareTo('${b['start']}'));
    return Screen(
      title: t('student.calendar'),
      subtitle: '${t('teacher.calSub')} · ${widget.batch}',
      color: context.course(batchNo(widget.batch)),
      children: [
        Box(
          children: [
            Semantics(
              container: true,
              child: TextField(
                controller: title,
                maxLength: 200,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: t('teacher.evTitlePh'), counterText: ''),
              ),
            ),
            Chips(
              value: kind,
              options: const ['live', 'exam', 'due'],
              labels: {
                for (final k in ['live', 'exam', 'due']) k: t('kinds.$k'),
              },
              onChanged: (v) => setState(() => kind = v),
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Doing(
                  label: fmtDate(dayKey(day)),
                  icon: I.calendar,
                  soft: true,
                  small: true,
                  onPressed: () async {
                    final now = DateTime.now();
                    final d = await showDatePicker(context: context, initialDate: day, firstDate: now.subtract(const Duration(days: 30)), lastDate: now.add(const Duration(days: 365)));
                    if (d != null) setState(() => day = d);
                  },
                ),
                Doing(label: '${t('teacher.evStart')} ${fmtTime(at(from))}', soft: true, small: true, onPressed: () => pickTime(true)),
                Doing(label: '${t('teacher.evEnd')} ${fmtTime(at(to))}', soft: true, small: true, onPressed: () => pickTime(false)),
              ],
            ),
            Doing(
              label: t('teacher.postCal'),
              icon: I.plus,
              onPressed: title.text.trim().isEmpty
                  ? null
                  : () async {
                      final saved = await store.act('addCalendarEvent', [
                        {'title': title.text.trim(), 'start': at(from), 'end': at(to), 'meta': '${store.staffName} · ${widget.batch}', 'kind': kind, 'batch': widget.batch},
                      ]);
                      title.clear();
                      if (context.mounted) toast(context, saved ? t('teacher.toast.eventAdded') : t('app.sentLater'));
                    },
            ),
          ],
        ),
        if (events.isNotEmpty)
          Box(
            flush: true,
            children: [
              Paged(
                items: events,
                resetKey: widget.batch,
                row: (e) => Item(
                  icon: e['kind'] == 'exam' ? I.exams : (e['kind'] == 'due' ? I.checklist : I.live),
                  color: context.course(batchNo(widget.batch)),
                  title: '${e['title']}',
                  subtitle: '${fmtDateTime('${e['start']}')}${e['end'] is String ? ' – ${fmtTime(e['end'] as String)}' : ''}\n${e['meta'] ?? ''}',
                  trailing: Tag(t('teacher.synced'), kind: 'ok'),
                ),
              ),
            ],
          ),
      ],
    );
  });
}

const _kinds = ['video', 'pdf', 'task', 'quiz'];
CbIcon kindIcon(Object? kind) => switch (kind) {
  'video' => I.video,
  'pdf' => I.file,
  'quiz' => I.quiz,
  'exam' => I.exams,
  _ => I.editNote,
};
String kindLabel(String k) => t('kinds.$k');

/// The batch's chapters: add one, publish or hide it, delete it; add and delete the videos, PDFs, homework and quizzes inside.
/// Copy a chapter to another batch, and mark a video or PDF as a free preview.
/// shortcut: files are added by link only (no file picker in the app); written exams, rubrics and quiz settings are on the website.
class StudioScreen extends StatefulWidget {
  const StudioScreen({super.key, required this.batch});
  final String batch;
  @override
  State<StudioScreen> createState() => _StudioScreenState();
}

class _StudioScreenState extends State<StudioScreen> {
  final name = TextEditingController();

  @override
  void dispose() {
    name.dispose();
    super.dispose();
  }

  String about(Json it) => [
    it['kind'] == 'quiz' ? (rows(it['questions']).isNotEmpty ? t('teacher.questionsN', [rows(it['questions']).length]) : t('teacher.noQuestions')) : '${it['meta'] ?? ''}',
    if (it['points'] != null) t('teacher.marks', [it['points']]),
    if (it['dueDate'] is String) t('app.due', [fmtDate(it['dueDate'] as String)]),
  ].where((s) => s.isNotEmpty).join(' · ');

  @override
  Widget build(BuildContext context) => Live((context) {
    final color = context.course(batchNo(widget.batch)), modules = batchModules(widget.batch);
    bool published(Json m) => (m['published'] == true) != store.pending('toggleModulePublish', [m['id']]).isOdd; // flipped while on its way
    return Screen(
      title: t('teacher.courseStudio'),
      subtitle: widget.batch,
      color: color,
      children: [
        Box(
          children: [
            Semantics(
              container: true,
              child: TextField(
                controller: name,
                maxLength: 120,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(labelText: t('teacher.newModuleTitle'), hintText: t('teacher.newModulePh'), counterText: ''),
              ),
            ),
            Doing(
              label: t('teacher.createModule'),
              icon: I.plus,
              color: color,
              onPressed: name.text.trim().isEmpty
                  ? null
                  : () async {
                      final saved = await store.act('addModule', [name.text.trim(), widget.batch]);
                      name.clear();
                      if (context.mounted) toast(context, saved ? t('teacher.toast.moduleCreated') : t('app.sentLater'));
                    },
            ),
          ],
        ),
        if (modules.isEmpty) Muted(t('teacher.noChapters')),
        for (final m in modules)
          Box(
            title: '${m['title']}',
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  Doing(
                    label: t(published(m) ? 'teacher.published' : 'teacher.unpublished'),
                    soft: !published(m),
                    small: true,
                    color: color,
                    onPressed: () async {
                      final was = published(m);
                      if (await store.act('toggleModulePublish', [m['id']]) && context.mounted) toast(context, t(was ? 'teacher.toast.moduleHidden' : 'teacher.toast.modulePublished'));
                    },
                  ),
                  Doing(
                    label: t('teacher.addItem'),
                    icon: I.plus,
                    soft: true,
                    small: true,
                    color: color,
                    onPressed: () async => push(context, AddItemScreen(moduleId: m['id'] as int)),
                  ),
                  if (store.batches.length > 1)
                    PopupMenuButton<String>(
                      tooltip: t('centre.copyTo'),
                      onSelected: (b) async {
                        if (await store.act('copyModule', [m['id'], b]) && context.mounted) toast(context, t('centre.moduleCopied'));
                      },
                      itemBuilder: (_) => [
                        for (final b in store.batches.where((b) => b['name'] != m['batch'])) PopupMenuItem(value: '${b['name']}', child: Text('${b['name']}')),
                      ],
                      child: IgnorePointer(
                        child: Doing(label: t('centre.copyTo'), icon: I.copy, soft: true, small: true, color: color, onPressed: () async {}),
                      ),
                    ),
                  Doing(
                    label: t('teacher.deleteModule'),
                    icon: I.trash,
                    soft: true,
                    small: true,
                    danger: true,
                    onPressed: () async {
                      if (!await confirm(context, t('teacher.deleteModule'), t('teacher.confirmDeleteModule', ['${m['title']}']))) return;
                      if (await store.act('deleteModule', [m['id']]) && context.mounted) toast(context, t('teacher.toast.moduleRemoved'));
                    },
                  ),
                ],
              ),
              if (rows(m['items']).isEmpty) Muted(t('teacher.noItems')),
              for (final it in rows(m['items']))
                Item(
                  icon: kindIcon(it['kind']),
                  color: color,
                  title: '${it['title']}',
                  subtitle: about(it),
                  below: it['kind'] == 'video' || it['kind'] == 'pdf'
                      ? FilterChip(label: Text(t('courses.previewToggle')), selected: (it['preview'] == true) != store.pending('toggleItemPreview', [m['id'], it['id']]).isOdd, onSelected: (_) => store.act('toggleItemPreview', [m['id'], it['id']]))
                      : null,
                  trailing: IconButton(
                    tooltip: t('common.delete'),
                    icon: Ico(I.trash),
                    onPressed: () async {
                      if (!await confirm(context, t('common.delete'), t('teacher.confirmDeleteItem', ['${it['title']}']))) return;
                      if (await store.act('deleteModuleItem', [m['id'], it['id']]) && context.mounted) toast(context, t('teacher.toast.itemRemoved', ['${it['title']}']));
                    },
                  ),
                ),
            ],
          ),
      ],
    );
  });
}

/// Add a video or PDF (by link), homework (marks and a due date) or an MCQ quiz to a chapter, as the website's form does.
class AddItemScreen extends StatefulWidget {
  const AddItemScreen({super.key, required this.moduleId});
  final int moduleId;
  @override
  State<AddItemScreen> createState() => _AddItemScreenState();
}

class _AddItemScreenState extends State<AddItemScreen> {
  final title = TextEditingController(), meta = TextEditingController(), url = TextEditingController(), points = TextEditingController(text: '30'), questions = TextEditingController();
  var kind = 'video';
  var due = dayKey(DateTime.now().add(const Duration(days: 7)));
  String error = '';

  @override
  void dispose() {
    for (final c in [title, meta, url, points, questions]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> publish() async {
    final graded = kind == 'task' || kind == 'quiz', file = kind == 'video' || kind == 'pdf';
    List<Json>? qs;
    if (kind == 'quiz') {
      final p = parseQuiz(questions.text);
      if (p.bad != null) return setState(() => error = t('teacher.quizError', [p.bad]));
      if (p.questions.isEmpty) return setState(() => error = t('teacher.quizNeedsQuestions'));
      qs = p.questions;
    }
    final n = num.tryParse(points.text.trim());
    final name = title.text.trim(), link = url.text.trim();
    final saved = await store.act('addModuleItem', [
      widget.moduleId,
      {
        'kind': kind,
        'title': name,
        'meta': file ? meta.text.trim() : '',
        if (file && link.isNotEmpty) 'url': link,
        if (graded) 'points': n == null || n == 0 ? 30 : n, // the website's Number(x) || 30
        if (graded) 'dueDate': due,
        'questions': ?qs,
        'publishToExplore': false,
        'free': true,
      },
    ]);
    if (!mounted) return;
    toast(context, saved ? t('teacher.toast.itemPosted', [name]) : t('app.sentLater'));
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final file = kind == 'video' || kind == 'pdf';
    Widget field(TextEditingController c, String label, {String? hint, int lines = 1, TextInputType? type}) => Semantics(
      container: true,
      child: TextField(
        controller: c,
        minLines: lines,
        maxLines: lines == 1 ? 1 : 14,
        keyboardType: type,
        onChanged: (_) => setState(() => error = ''),
        decoration: InputDecoration(labelText: label, hintText: hint, alignLabelWithHint: lines > 1),
      ),
    );
    return Screen(
      title: t('teacher.addItem'),
      refresh: false,
      children: [
        Section(t('teacher.contentType')),
        Chips(value: kind, options: _kinds, labels: {for (final k in _kinds) k: kindLabel(k)}, onChanged: (v) => setState(() => kind = v)),
        field(title, t('teacher.itemTitle'), hint: t('teacher.titlePh.$kind')),
        if (file) field(meta, t(kind == 'video' ? 'teacher.duration' : 'teacher.pages')),
        if (file) field(url, t(kind == 'video' ? 'teacher.videoUrl' : 'teacher.pdfUrl'), hint: 'https://', type: TextInputType.url),
        if (!file) field(points, t('teacher.totalMarks'), type: TextInputType.number),
        if (!file)
          Doing(
            label: '${t('teacher.dueDate')}: ${fmtDate(due)}',
            icon: I.calendar,
            soft: true,
            onPressed: () async {
              final now = DateTime.now();
              final d = await showDatePicker(context: context, initialDate: toDate(due), firstDate: now.subtract(const Duration(days: 30)), lastDate: now.add(const Duration(days: 365)));
              if (d != null) setState(() => due = dayKey(d));
            },
          ),
        if (kind == 'quiz') ...[Muted(t('teacher.questionsHelp')), field(questions, t('teacher.questions'), hint: t('teacher.questionsPh'), lines: 8)],
        if (error.isNotEmpty)
          Text(
            error,
            style: TextStyle(color: context.colors.error, fontWeight: FontWeight.w700),
          ),
        Doing(label: t('teacher.publishItem'), icon: I.send, onPressed: title.text.trim().isEmpty ? null : publish),
      ],
    );
  }
}

/// How much of each of the batch's videos every student has really played, and who hasn't started (the website's Watch tool).
class WatchTimeScreen extends StatelessWidget {
  const WatchTimeScreen({super.key, required this.batch});
  final String batch;
  @override
  Widget build(BuildContext context) => Live((context) {
    final videos = [
      for (final m in batchModules(batch))
        for (final it in rows(m['items']))
          if (it['kind'] == 'video' && it['url'] != null) it,
    ];
    final kids = batchKids(batch);
    return Screen(
      title: t('app.watchTime'),
      subtitle: batch,
      color: context.course(batchNo(batch)),
      children: [
        Muted(t('watch.how')),
        if (videos.isEmpty) Box(children: [Muted(t('watch.none'))]),
        for (final v in videos)
          Builder(
            builder: (context) {
              final w = ((store.state?['watch'] as Map?)?['${v['id']}'] as Map?) ?? const {};
              int pct(Json k) {
                final x = w['${k['id']}'] as Map?, dur = (x?['dur'] as num?) ?? 0;
                return dur == 0 ? 0 : jsRound(((x!['sec'] as num) / dur * 100).clamp(0, 100));
              }

              final notStarted = kids.where((k) => pct(k) == 0).toList();
              return Box(
                title: '${v['title']}',
                children: [
                  Strong(t('watch.summary', [kids.where((k) => pct(k) >= 90).length, kids.length])),
                  if (notStarted.isNotEmpty) Muted('${t('watch.notStarted')}: ${notStarted.map((k) => k['name']).join(', ')}'),
                  for (final k in kids.where((k) => pct(k) > 0))
                    Row(
                      spacing: 10,
                      children: [
                        Expanded(flex: 2, child: Text('${k['name']}', maxLines: 1, overflow: TextOverflow.ellipsis)),
                        Expanded(flex: 3, child: MarkBar(pct(k), plain: true)),
                        SizedBox(
                          width: 44,
                          child: Text(
                            '${localNumber(pct(k), lang.code)}%',
                            textAlign: TextAlign.end,
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ],
                    ),
                ],
              );
            },
          ),
      ],
    );
  });
}

/// Positions in one marked test of the batch (src/lib/quiz.ts meritList), and showing them to students and guardians.
class MeritScreen extends StatefulWidget {
  const MeritScreen({super.key, required this.batch});
  final String batch;
  @override
  State<MeritScreen> createState() => _MeritScreenState();
}

class _MeritScreenState extends State<MeritScreen> {
  String? pick;

  @override
  Widget build(BuildContext context) => Live((context) {
    final tests = [
      for (final m in batchModules(widget.batch))
        for (final it in rows(m['items']))
          if (it['kind'] != 'video' && it['kind'] != 'pdf' && itemScores(it).isNotEmpty) (m: m, it: it, key: '${m['id']}:${it['id']}'),
    ];
    final sel = tests.where((x) => x.key == pick).firstOrNull ?? tests.firstOrNull;
    final color = context.course(batchNo(widget.batch));
    if (sel == null) {
      return Screen(
        title: t('merit.title', [widget.batch]),
        color: color,
        children: [
          Box(children: [Muted(t('merit.none'))]),
        ],
      );
    }
    // High to low; equal marks keep the website's order (by roll), and share the place of the first of them.
    final list = itemScores(sel.it).entries.toList()..sort((a, b) => a.value != b.value ? b.value.compareTo(a.value) : a.key - b.key);
    final n = list.length;
    final ranked = <({int id, num score, int rank, int pct})>[];
    for (var i = 0; i < n;) {
      var j = i + 1;
      while (j < n && list[j].value == list[i].value) {
        j++;
      }
      for (var k = i; k < j; k++) {
        ranked.add((id: list[k].key, score: list[k].value, rank: i + 1, pct: n > 1 ? jsRound((n - j) / (n - 1) * 100) : 100));
      }
      i = j;
    }
    final switches = (sel.it['tabSwitches'] as Map?) ?? const {};
    return Screen(
      title: t('merit.title', [widget.batch]),
      color: color,
      children: [
        Section(t('merit.pick')),
        DropdownButton<String>(
          value: sel.key,
          isExpanded: true,
          items: [
            for (final x in tests)
              DropdownMenuItem(
                value: x.key,
                child: Text('${x.it['title']}', overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: (v) => setState(() => pick = v),
        ),
        Group(
          children: [
            Item(
              title: t('merit.publish'),
              subtitle: t('merit.privacy'),
              trailing: Switch(value: sel.it['meritPublished'] == true, onChanged: (on) => store.act('setMeritPublished', [sel.m['id'], sel.it['id'], on])),
            ),
          ],
        ),
        Box(
          flush: true,
          children: [
            Paged(
              items: ranked,
              resetKey: sel.key,
              row: (r) => Item(
                leading: CircleAvatar(
                  radius: 20,
                  backgroundColor: r.rank <= 3 ? context.colors.tertiaryContainer : context.tone.tile,
                  child: Text(
                    localNumber(r.rank, lang.code),
                    style: TextStyle(fontWeight: FontWeight.w800, color: r.rank <= 3 ? context.colors.onTertiaryContainer : context.colors.onSurface),
                  ),
                ),
                title: '${store.student(r.id)?['name'] ?? '—'}',
                subtitle: [
                  '${t('app.roll')} ${r.id} · ${t('merit.beat', [r.pct])}',
                  if ((switches['${r.id}'] as num? ?? 0) > 0) '⚠ ${t('merit.tabSwitches', [switches['${r.id}']])}',
                ].join('\n'),
                trailing: Strong('${show(r.score)} / ${show(sel.it['points'] ?? 30)}'),
              ),
            ),
          ],
        ),
      ],
    );
  });
}

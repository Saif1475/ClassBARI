// More of the teacher's website tools in the app: QR attendance, voice notes for doubts, report card comments, class
// points and story, guardian meeting slots, the question bank, an Explore video, community moderation and the live room.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/services.dart' show HapticFeedback;
import 'package:just_audio/just_audio.dart';
import 'package:material_ui/material_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:record/record.dart';

import '../api.dart';
import '../icon.dart';
import '../icons.g.dart';
import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'guardian_more.dart' show Line;
import 'lesson.dart' show pickPhoto;
import 'student.dart' show attendanceOf;
import 'student_more.dart' show DataPicture;
import 'teacher.dart' show batchNo;
import 'teacher_more.dart';

// ---- QR attendance (src/components/teacher/QrAttendance.tsx) ------------------------------------------------------
const qrPrefix = 'edunest:student:'; // student/MyQr.tsx QR_PREFIX

/// The student id in a scanned code; null when it isn't a ClassBARI student code (-1: one that can't be read).
int? qrStudent(String? raw) => raw != null && raw.startsWith(qrPrefix) ? (int.tryParse(raw.substring(qrPrefix.length)) ?? -1) : null;

/// The camera: each student QR code scanned marks that student present on `day` (everyone was marked absent first).
class QrScanScreen extends StatefulWidget {
  const QrScanScreen({super.key, required this.batch, required this.day});
  final String batch, day;
  @override
  State<QrScanScreen> createState() => _QrScanScreenState();
}

class _QrScanScreenState extends State<QrScanScreen> {
  final seen = <int>[];
  late var msg = t('qr.scanning');

  void found(BarcodeCapture c) {
    for (final b in c.barcodes) {
      final id = qrStudent(b.rawValue);
      if (id == null) continue;
      final st = batchKids(widget.batch).where((k) => k['id'] == id).firstOrNull;
      if (st == null) {
        setState(() => msg = t('qr.unknown'));
      } else if (!seen.contains(id)) {
        seen.add(id);
        store.act('markPresent', [id, widget.day]);
        HapticFeedback.mediumImpact();
        setState(() => msg = t('qr.marked', [st['name']]));
      }
    }
  }

  @override
  Widget build(BuildContext context) => Screen(
    title: t('qr.scan'),
    subtitle: '${widget.batch} · ${fmtDate(widget.day)}',
    refresh: false,
    children: [
      AspectRatio(
        aspectRatio: 1,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: MobileScanner(
            onDetect: found,
            errorBuilder: (context, _) => ColoredBox(
              color: context.colors.errorContainer,
              child: Center(
                child: Padding(padding: const EdgeInsets.all(16), child: Text(t('qr.noCamera'), style: TextStyle(color: context.colors.onErrorContainer))),
              ),
            ),
          ),
        ),
      ),
      Semantics(liveRegion: true, child: Strong(msg)),
      Muted(t('qr.count', [seen.length, batchKids(widget.batch).length])),
      Doing(label: t('qr.done'), onPressed: () async => Navigator.pop(context)),
    ],
  );
}

// ---- voice notes (DoubtsTool.tsx VoiceNote) ------------------------------------------------------------------------
const maxVoiceSeconds = 60;

/// Record a short voice note (stops by itself after 60 s); gives back a data URL, as the website's recorder does.
class VoiceRecorder extends StatefulWidget {
  const VoiceRecorder({super.key, required this.onDone});
  final ValueChanged<String> onDone;
  @override
  State<VoiceRecorder> createState() => _VoiceRecorderState();
}

class _VoiceRecorderState extends State<VoiceRecorder> {
  AudioRecorder? rec;
  Timer? timer;
  String? path; // the recording, deleted if this closes mid-recording
  var on = false, noMic = false;

  Future<void> start() async {
    try {
      final r = rec ??= AudioRecorder();
      if (!await r.hasPermission()) return setState(() => noMic = true);
      await r.start(
        const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 24000, sampleRate: 22050, numChannels: 1), // ~24 kbps, as the website records
        path: path = '${Directory.systemTemp.path}/voice-${DateTime.now().millisecondsSinceEpoch}.m4a',
      );
      timer = Timer(const Duration(seconds: maxVoiceSeconds), stop);
      setState(() => on = true);
    } catch (_) {
      if (mounted) setState(() => noMic = true);
    }
  }

  Future<void> stop() async {
    timer?.cancel();
    final path = await rec?.stop();
    if (!mounted) return;
    setState(() => on = false);
    if (path == null) return;
    final f = File(path), bytes = await f.readAsBytes();
    f.delete().ignore();
    widget.onDone('data:audio/mp4;base64,${base64Encode(bytes)}');
  }

  @override
  void dispose() {
    timer?.cancel();
    final p = on ? path : null;
    rec?.dispose().whenComplete(() => p == null ? null : File(p).delete().ignore());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => noMic
      ? Text(t('doubts.noMic'), style: TextStyle(color: context.colors.error, fontSize: 13))
      : Doing(label: on ? t('doubts.stop') : t('doubts.voice'), soft: !on, danger: on, small: true, onPressed: on ? stop : start);
}

/// Play a voice note: a data URL (as the website saves them) or a stored file.
class VoicePlayer extends StatefulWidget {
  const VoicePlayer(this.src, {super.key});
  final String src;
  @override
  State<VoicePlayer> createState() => _VoicePlayerState();
}

class _VoicePlayerState extends State<VoicePlayer> {
  AudioPlayer? player; // made on the first tap, so a list of notes doesn't open a player each
  StreamSubscription<PlayerState>? sub;
  var playing = false, failed = false;
  File? file;

  Future<void> load(AudioPlayer p) async {
    final s = widget.src, comma = s.indexOf(',');
    if (s.startsWith('data:') && comma > 0) {
      final f = file = File('${Directory.systemTemp.path}/voice-${s.hashCode}.${s.startsWith('data:audio/webm') ? 'webm' : 'm4a'}');
      await f.writeAsBytes(base64Decode(s.substring(comma + 1)));
      await p.setFilePath(f.path);
    } else {
      final link = await fileLink(s);
      if (link == null) throw StateError('no link');
      await p.setUrl(link);
    }
  }

  Future<void> toggle() async {
    try {
      var p = player;
      if (p == null) {
        p = player = AudioPlayer();
        sub = p.playerStateStream.listen((s) {
          if (mounted) setState(() => playing = s.playing && s.processingState != ProcessingState.completed);
        });
        await load(p);
        if (failed && mounted) setState(() => failed = false);
      }
      if (playing) return await p.pause();
      if (p.processingState == ProcessingState.completed) await p.seek(Duration.zero);
      unawaited(p.play()); // finishes only when playback stops
    } catch (_) {
      // A failed load: the next tap ("Try again") makes a new player and loads again.
      sub?.cancel();
      player?.dispose();
      player = null;
      if (mounted) setState(() => failed = true);
    }
  }

  @override
  void dispose() {
    sub?.cancel();
    player?.dispose();
    file?.delete().ignore();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: Doing(label: failed ? t('app.tryAgain') : t('doubts.voice'), icon: playing ? I.pause : I.play, soft: true, small: true, onPressed: toggle),
  );
}

/// One doubt with its replies, as the website's DoubtThread: who asked, the batch, the photo and voice notes.
class TeacherDoubtCard extends StatelessWidget {
  const TeacherDoubtCard(this.d, {super.key, this.below});
  final Json d;
  final Widget? below;
  @override
  Widget build(BuildContext context) => Box(
    children: [
      Wrap(
        spacing: 8,
        runSpacing: 4,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Strong('${store.student(d['studentId'])?['name'] ?? '—'}'),
          Muted('${d['batch'] ?? ''}${d['at'] is String ? ' · ${fmtWhen(d['at'] as String)}' : ''}'),
          Tag(d['solved'] == true ? t('doubts.solved') : t('doubts.open'), kind: d['solved'] == true ? 'ok' : 'note'),
        ],
      ),
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
              if (r['audio'] is String) VoicePlayer(r['audio'] as String),
            ],
          ),
        ),
      ?below,
    ],
  );
}

// ---- report card (src/components/ReportCard.tsx, editable) --------------------------------------------------------
/// This month's report card for one student, with the teacher's comment to write (guardians read it).
class TeacherReportScreen extends StatefulWidget {
  const TeacherReportScreen({super.key, required this.studentId});
  final int studentId;
  @override
  State<TeacherReportScreen> createState() => _TeacherReportScreenState();
}

class _TeacherReportScreenState extends State<TeacherReportScreen> {
  late final comment = TextEditingController(text: '${(store.state?['reportComments'] as Map?)?['${widget.studentId}'] ?? ''}');

  @override
  void dispose() {
    comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final s = store.student(widget.studentId);
    if (s == null) return Screen(title: t('report.title'), children: [Muted(t('teacher.noMatch'))]);
    final id = widget.studentId, att = attendanceOf(s);
    final modules = store.modules.where((m) => m['batch'] == s['batch'] && m['published'] == true).toList();
    final quizzes = gradedResults(modules, id).where((r) => r.kind == 'quiz').toList();
    final tasks = [for (final m in modules) ...rows(m['items']).where((it) => it['kind'] == 'task' || it['kind'] == 'exam')];
    return Screen(
      title: t('report.title'),
      subtitle: '${s['name']} · ${t('app.roll')} $id · ${s['batch']} · ${fmtMonth(DateTime.now().toIso8601String())}',
      color: context.course(batchNo(s['batch'])),
      refresh: false,
      children: [
        Box(children: [Strong(t('report.attendance')), Line(att.held > 0 ? t('parent.classesOf', [att.present, att.held]) : t('parent.noClasses'), att.held > 0 ? '${localNumber(att.pct, lang.code)}%' : '—')]),
        Box(children: [Strong(t('report.quizzes')), if (quizzes.isEmpty) Muted(t('student.noQuizYet')), for (final q in quizzes) Line(q.title, '${show(q.score)}/${show(q.points)}')]),
        if (tasks.isNotEmpty)
          Box(
            children: [
              Strong(t('report.assignments')),
              for (final it in tasks)
                Builder(
                  builder: (context) {
                    final sub = ((it['submissions'] as Map?)?['$id']) as Map?;
                    return Line('${it['title']}', sub == null ? t('report.notSubmitted') : (sub['grade'] is num ? '${show(sub['grade'] as num)}/${show((it['points'] as num?) ?? 20)}' : t('sub.waiting')));
                  },
                ),
            ],
          ),
        Box(
          title: t('report.comment'),
          children: [
            Semantics(
              container: true,
              child: TextField(controller: comment, minLines: 3, maxLines: 8, maxLength: 2000, decoration: InputDecoration(labelText: t('report.comment'), counterText: '', alignLabelWithHint: true)),
            ),
            Doing(
              label: t('common.save'),
              icon: I.check,
              onPressed: () async {
                final saved = await store.act('setReportComment', [id, comment.text.trim()]);
                if (context.mounted) toast(context, saved ? t('settings.saved') : t('app.sentLater'));
              },
            ),
          ],
        ),
      ],
    );
  });
}

// ---- points, class story and student work (src/components/dojo/*) -------------------------------------------------
const pointKinds = {'helping': 1, 'participation': 1, 'homework': 1, 'teamwork': 1, 'lateHomework': -1, 'offTask': -1}; // mock-data.ts POINT_KINDS
int pointTotal(List<Json> points, Object? id) => points.where((p) => p['studentId'] == id).fold(0, (n, p) => n + (pointKinds[p['kind']] ?? 0));

/// The website's "Points & class story" section for one batch.
class DojoScreen extends StatefulWidget {
  const DojoScreen({super.key, required this.batch});
  final String batch;
  @override
  State<DojoScreen> createState() => _DojoScreenState();
}

class _DojoScreenState extends State<DojoScreen> {
  final text = TextEditingController();
  String? photo;

  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final kids = batchKids(widget.batch), ids = {for (final k in kids) k['id']};
    final points = rows(store.state?['points']);
    final recent = points.where((p) => ids.contains(p['studentId'])).take(6).toList();
    final story = rows(store.state?['story']).where((p) => p['batch'] == widget.batch).toList();
    final work = rows(store.state?['portfolio']).where((p) => ids.contains(p['studentId'])).toList();
    String name(Object? id) => '${store.student(id)?['name'] ?? ''}';
    return Screen(
      title: t('teacher.sections.dojo'),
      subtitle: widget.batch,
      color: context.course(batchNo(widget.batch)),
      children: [
        Section(t('dojo.points')),
        Box(
          flush: true,
          children: [
            Paged(
              items: kids,
              resetKey: widget.batch,
              row: (k) {
                final n = pointTotal(points, k['id']);
                return Item(
                  title: '${k['name']}',
                  trailing: Tag(n > 0 ? '+$n' : '$n', kind: n >= 0 ? 'ok' : 'bad'), // shortcut: dojo.total is left out of the app's words
                  below: Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final e in pointKinds.entries)
                        ActionChip(
                          label: Text('${e.value > 0 ? '+' : '−'} ${t('dojo.kinds.${e.key}')}', style: TextStyle(color: e.value > 0 ? context.colors.primary : context.colors.error, fontWeight: FontWeight.w700)),
                          onPressed: () {
                            store.act('addPoint', [k['id'], e.key]);
                            toast(context, t('dojo.given', [t('dojo.kinds.${e.key}'), k['name']]));
                          },
                        ),
                    ],
                  ),
                );
              },
            ),
          ],
        ),
        if (recent.isNotEmpty)
          Group(
            title: t('dojo.recent'),
            children: [
              for (final p in recent)
                Item(
                  title: t('dojo.given', [t('dojo.kinds.${p['kind']}'), name(p['studentId'])]),
                  trailing: TextButton(onPressed: () => store.act('removePoint', [p['id']]), child: Text(t('dojo.undo'))),
                ),
            ],
          ),
        Box(
          title: t('dojo.story'),
          children: [
            Semantics(
              container: true,
              child: TextField(controller: text, minLines: 2, maxLines: 6, maxLength: 2000, onChanged: (_) => setState(() {}), decoration: InputDecoration(hintText: t('dojo.storyPh'), counterText: '')),
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Doing(
                  label: photo == null ? t('dojo.photo') : t('doubts.photoAdded'),
                  icon: I.image,
                  soft: true,
                  small: true,
                  onPressed: () async {
                    final p = await pickPhoto(context, camera: false);
                    if (p != null && mounted) setState(() => photo = p.data);
                  },
                ),
                Doing(
                  label: t('dojo.post'),
                  icon: I.send,
                  small: true,
                  onPressed: text.text.trim().isEmpty
                      ? null
                      : () async {
                          final saved = await store.act('addStoryPost', [widget.batch, text.text.trim(), photo]); // no photo: null, as the website's undefined is sent
                          text.clear();
                          setState(() => photo = null);
                          if (context.mounted) toast(context, saved ? t('dojo.posted') : t('app.sentLater'));
                        },
                ),
              ],
            ),
            if (story.isEmpty) Muted(t('dojo.noStory')),
            for (final p in story)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: context.tone.tile, borderRadius: BorderRadius.circular(12)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  spacing: 6,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Strong('${p['author'] ?? ''}')),
                        if (p['at'] is String) Muted(fmtWhen(p['at'] as String)),
                        IconButton(
                          tooltip: t('common.remove'),
                          icon: Ico(I.trash, size: 18),
                          onPressed: () async {
                            if (await confirm(context, t('common.remove'), short('${p['text'] ?? ''}', 60))) await store.act('deleteStoryPost', [p['id']]);
                          },
                        ),
                      ],
                    ),
                    Text('${p['text'] ?? ''}'),
                    if (p['image'] is String) DataPicture(p['image'] as String),
                  ],
                ),
              ),
          ],
        ),
        Box(
          title: t('dojo.studentWork'),
          children: [
            if (work.isEmpty) Muted(t('dojo.noWork')),
            for (final p in work) ...[DataPicture('${p['image'] ?? ''}'), Muted('${p['title'] ?? ''} · ${name(p['studentId'])}')],
          ],
        ),
      ],
    );
  });
}

String short(String s, int n) => s.length <= n ? s : '${s.substring(0, n)}…';

// ---- meeting slots for guardians (MeetingsTool.tsx) ---------------------------------------------------------------
class MeetingsScreen extends StatefulWidget {
  const MeetingsScreen({super.key});
  @override
  State<MeetingsScreen> createState() => _MeetingsScreenState();
}

class _MeetingsScreenState extends State<MeetingsScreen> {
  late var day = DateTime.now().add(const Duration(days: 3)); // the website's defaults
  var from = const TimeOfDay(hour: 18, minute: 0);
  final count = TextEditingController(text: '4'), minutes = TextEditingController(text: '15');
  late var batch = '${store.myBatches.firstOrNull?['name'] ?? ''}';

  @override
  void dispose() {
    count.dispose();
    minutes.dispose();
    super.dispose();
  }

  /// The slots the website's form makes: n (1–20) back to back, each at least 5 minutes.
  List<Json> slots() {
    final first = DateTime(day.year, day.month, day.day, from.hour, from.minute);
    final c = int.tryParse(count.text.trim()) ?? 0, m = int.tryParse(minutes.text.trim()) ?? 0;
    final n = (c == 0 ? 1 : c).clamp(1, 20), mins = max(5, m == 0 ? 15 : m);
    return [
      for (var i = 0; i < n; i++) {'start': first.add(Duration(minutes: i * mins)).toUtc().toIso8601String(), 'minutes': mins, 'teacher': store.staffName, 'batch': batch},
    ];
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final names = [for (final b in store.myBatches) '${b['name']}'];
    final list = rows(store.state?['meetings']).where((m) => names.contains(m['batch'])).toList();
    Widget number(TextEditingController c, String label) => SizedBox(
      width: 140,
      child: TextField(controller: c, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: label)),
    );
    return Screen(
      title: t('meetings.slots'),
      children: [
        Box(
          title: t('meetings.open'),
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                Doing(
                  label: '${t('meetings.date')}: ${fmtDate(dayKey(day))}',
                  icon: I.calendar,
                  soft: true,
                  small: true,
                  onPressed: () async {
                    final now = DateTime.now();
                    final d = await showDatePicker(context: context, initialDate: day, firstDate: now.subtract(const Duration(days: 1)), lastDate: now.add(const Duration(days: 365)));
                    if (d != null) setState(() => day = d);
                  },
                ),
                Doing(
                  label: '${t('meetings.from')}: ${from.format(context)}',
                  soft: true,
                  small: true,
                  onPressed: () async {
                    final x = await showTimePicker(context: context, initialTime: from);
                    if (x != null) setState(() => from = x);
                  },
                ),
              ],
            ),
            Wrap(spacing: 8, runSpacing: 8, children: [number(count, t('meetings.count')), number(minutes, t('meetings.minutes'))]),
            if (names.length > 1) ...[Muted(t('meetings.batch')), Chips(value: batch, options: names, onChanged: (v) => setState(() => batch = v))],
            Doing(
              label: t('meetings.openBtn'),
              icon: I.plus,
              onPressed: batch.isEmpty
                  ? null
                  : () async {
                      final s = slots();
                      final saved = await store.act('addMeetingSlots', [s]);
                      if (context.mounted) toast(context, saved ? t('meetings.opened', [s.length]) : t('app.sentLater'));
                    },
            ),
          ],
        ),
        Section(t('meetings.slots')),
        if (list.isEmpty) Muted(t('meetings.none')),
        if (list.isNotEmpty)
          Box(
            flush: true,
            children: [
              Paged(
                items: list,
                row: (m) {
                  final child = m['bookedBy'] == null ? null : store.student(m['bookedBy']);
                  return Item(
                    icon: I.calendar,
                    color: context.course(batchNo(m['batch'])),
                    title: fmtDateTime('${m['start']}'),
                    subtitle: '${m['minutes']} min · ${m['batch']}\n${child != null ? t('meetings.bookedBy', [child['guardianName'], child['name']]) : t('meetings.free')}',
                    trailing: IconButton(tooltip: t('common.remove'), icon: Ico(I.trash), onPressed: () => store.act('removeMeeting', [m['id']])),
                  );
                },
              ),
            ],
          ),
      ],
    );
  });
}

// ---- question bank (BankTool.tsx) ---------------------------------------------------------------------------------
const subjects = ['Physics', 'Math', 'Chemistry', 'Biology', 'English']; // mock-data.ts
const levels = ['SSC', 'HSC', 'Admission prep'];
const _diffs = ['easy', 'medium', 'hard'];

/// The teacher's own questions plus every question from their tests; add more in the website's quiz text format.
/// shortcut: making a test from the bank, the filters and importing from Excel/Word/PDF are on the website only.
class BankScreen extends StatefulWidget {
  const BankScreen({super.key});
  @override
  State<BankScreen> createState() => _BankScreenState();
}

class _BankScreenState extends State<BankScreen> {
  final text = TextEditingController();
  var subject = subjects.first, diff = 'medium', error = '';

  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  Future<void> add() async {
    final r = parseQuiz(text.text);
    if (r.bad != null) return setState(() => error = t('teacher.quizError', [r.bad]));
    if (r.questions.isEmpty) return setState(() => error = t('teacher.quizNeedsQuestions'));
    final saved = await store.act('addBankQuestions', [
      [for (final q in r.questions) {...q, 'subject': subject, 'difficulty': diff}],
    ]);
    text.clear();
    setState(() => error = '');
    if (mounted) toast(context, saved ? t('bank.added', [r.questions.length]) : t('app.sentLater'));
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final names = {for (final b in store.myBatches) b['name']};
    final seen = <String>{};
    final pool = [
      for (final q in rows(store.state?['bank'])) (q: q, own: true),
      for (final m in store.modules.where((m) => names.contains(m['batch'])))
        for (final it in rows(m['items']))
          for (final q in rows(it['questions'])) (q: {...q, 'subject': '', 'difficulty': 'medium'}, own: false),
    ].where((x) => seen.add('${x.q['q']}')).toList();
    return Screen(
      title: t('bank.addTitle'),
      children: [
        Box(
          children: [
            Muted('${t('teacher.questionsHelp')} ${t('skills.tagHint')}'),
            Semantics(
              container: true,
              child: TextField(
                controller: text,
                minLines: 6,
                maxLines: 14,
                onChanged: (_) => setState(() => error = ''),
                decoration: InputDecoration(labelText: t('bank.addTitle'), hintText: t('teacher.questionsPh'), alignLabelWithHint: true),
              ),
            ),
            Muted(t('bank.subject')),
            Chips(value: subject, options: subjects, onChanged: (v) => setState(() => subject = v)),
            Muted(t('bank.difficulty')),
            Chips(value: diff, options: _diffs, labels: {for (final d in _diffs) d: t('bank.levels.$d')}, onChanged: (v) => setState(() => diff = v)),
            if (error.isNotEmpty) Text(error, style: TextStyle(color: context.colors.error, fontWeight: FontWeight.w700)),
            Doing(label: t('bank.add'), icon: I.plus, onPressed: text.text.trim().isEmpty ? null : add),
            Muted(t('bank.copyright')),
          ],
        ),
        Section(t('bank.list', [pool.length])),
        if (pool.isNotEmpty)
          Box(
            flush: true,
            children: [
              Paged(
                items: pool,
                row: (x) {
                  final q = x.q, options = (q['options'] as List?) ?? const [], a = q['answer'];
                  return Item(
                    title: '${q['q']}',
                    subtitle: '✓ ${a is int && a < options.length ? options[a] : ''} · ${[q['subject'], q['topic'], t('bank.levels.${q['difficulty']}')].where((s) => s != null && '$s'.isNotEmpty).join(' · ')}${x.own ? '' : ' · ${t('bank.fromTest')}'}',
                    trailing: x.own ? IconButton(tooltip: t('common.remove'), icon: Ico(I.trash), onPressed: () => store.act('deleteBankQuestion', [q['id']])) : null,
                  );
                },
              ),
            ],
          ),
      ],
    );
  });
}

// ---- a video for Explore and the course (TeacherApp.tsx handlePostExploreVideo) ------------------------------------
/// shortcut: by link only; uploading a video file is on the website.
class ExploreVideoScreen extends StatefulWidget {
  const ExploreVideoScreen({super.key, required this.batch});
  final String batch;
  @override
  State<ExploreVideoScreen> createState() => _ExploreVideoScreenState();
}

class _ExploreVideoScreenState extends State<ExploreVideoScreen> {
  final title = TextEditingController(), url = TextEditingController(), length = TextEditingController(text: '45:00');
  var subject = 'Physics', level = 'HSC', free = true;
  late Object? moduleId = batchModules(widget.batch).firstOrNull?['id'];

  @override
  void dispose() {
    for (final c in [title, url, length]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final modules = batchModules(widget.batch), link = url.text.trim();
    Widget field(TextEditingController c, String label, {String? hint, TextInputType? type}) => Semantics(
      container: true,
      child: TextField(controller: c, keyboardType: type, onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: label, hintText: hint)),
    );
    return Screen(
      title: t('teacher.vpTitle'),
      subtitle: widget.batch,
      color: context.course(batchNo(widget.batch)),
      refresh: false,
      children: [
        field(title, t('teacher.videoTitle'), hint: t('teacher.videoTitlePh')),
        field(url, t('teacher.videoUrl'), hint: 'https://youtu.be/…', type: TextInputType.url),
        Muted(t('teacher.subject')),
        Chips(value: subject, options: subjects, onChanged: (v) => setState(() => subject = v)),
        Muted(t('teacher.level')),
        Chips(value: level, options: levels, onChanged: (v) => setState(() => level = v)),
        field(length, t('teacher.duration'), hint: '48:20'),
        Muted(t('teacher.attachModule')),
        DropdownButton<Object?>(
          value: modules.any((m) => m['id'] == moduleId) ? moduleId : null,
          isExpanded: true,
          items: [
            const DropdownMenuItem(value: null, child: Text('—')),
            for (final m in modules) DropdownMenuItem(value: m['id'], child: Text('${m['title']}', overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) => setState(() => moduleId = v),
        ),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(t('teacher.makeFree')), value: free, onChanged: (v) => setState(() => free = v)),
        Doing(
          label: t('teacher.publishVideo'),
          icon: I.send,
          onPressed: title.text.trim().isEmpty
              ? null
              : () async {
                  final saved = await store.act('addExploreVideo', [
                    {
                      'title': title.text.trim(),
                      'subject': subject,
                      'level': level,
                      'length': length.text.isEmpty ? '45:00' : length.text,
                      'free': free,
                      if (link.isNotEmpty) 'url': link,
                      if (modules.any((m) => m['id'] == moduleId)) 'moduleId': moduleId,
                    },
                  ]);
                  if (!context.mounted) return;
                  toast(context, saved ? t('teacher.toast.videoPublished') : t('app.sentLater'));
                  Navigator.pop(context);
                },
        ),
      ],
    );
  }
}

// ---- community moderation (Community.tsx, staff) ------------------------------------------------------------------
/// Every community post, the held and reported ones first: approve, remove or restore, pin, or clear the reports.
class ModerateScreen extends StatelessWidget {
  const ModerateScreen({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    int rank(Json p) => p['held'] == true ? 0 : (((p['reports'] as List?)?.isNotEmpty ?? false) ? 1 : (p['pinned'] == true ? 2 : 3));
    final posts = rows(store.state?['community']).toList()..sort((a, b) => rank(a) != rank(b) ? rank(a) - rank(b) : '${b['at']}'.compareTo('${a['at']}'));
    final held = posts.where((p) => p['held'] == true).length;
    String who(Object? a) => a == 'teacher' ? '${store.state?['teacherName'] ?? ''}' : (a is int ? '${store.student(a)?['name'] ?? '—'}' : '$a');
    Future<void> mod(Object? id, Json patch) => store.act('moderatePost', [id, patch]);
    return Screen(
      title: t('community.title'),
      children: [
        if (held > 0) Muted(t('community.heldCount', [held])),
        if (posts.isEmpty) Muted(t('community.noPosts')),
        Paged(
          items: posts,
          row: (p) {
            final reports = ((p['reports'] as List?) ?? const []).length;
            final images = [for (final x in (p['images'] as List?) ?? [?p['image']]) '$x'];
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Box(
                children: [
                  Row(
                    spacing: 10,
                    children: [
                      Avatar(who(p['author'])),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [Strong(who(p['author'])), Muted([if (p['author'] is int) '${store.student(p['author'])?['batch'] ?? ''}', if (p['at'] is String) fmtWhen(p['at'] as String)].join(' · '))],
                        ),
                      ),
                    ],
                  ),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      if (p['held'] == true) Tag('⏳ ${t('community.heldStaff')}'),
                      if (p['hidden'] == true) Tag(t('community.removed'), kind: 'bad'),
                      if (p['pinned'] == true) Tag('📌 ${t('community.pinned')}', kind: 'ok'),
                      if (reports > 0) Tag('⚑ ${t('community.reportsN', [reports])}', kind: 'bad'),
                    ],
                  ),
                  if ('${p['text'] ?? ''}'.isNotEmpty) Text('${p['text']}'),
                  for (final src in images) DataPicture(src),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (p['held'] == true) Doing(label: t('community.approvePhoto'), small: true, onPressed: () => mod(p['id'], {'approve': true})),
                      Doing(label: p['hidden'] == true ? t('community.restore') : t('community.remove'), soft: true, danger: p['hidden'] != true, small: true, onPressed: () => mod(p['id'], {'hidden': p['hidden'] != true})),
                      Doing(label: p['pinned'] == true ? t('community.unpin') : t('community.pin'), soft: true, small: true, onPressed: () => mod(p['id'], {'pinned': p['pinned'] != true})),
                      if (reports > 0) Doing(label: t('community.looksFine'), soft: true, small: true, onPressed: () => mod(p['id'], {'clearReports': true})),
                    ],
                  ),
                ],
              ),
            );
          },
        ),
      ],
    );
  });
}

// ---- the live class room (LiveClassroom.tsx LiveControlRoom, /api/class and /api/poll) -----------------------------
const kJitsi = String.fromEnvironment('JITSI_DOMAIN', defaultValue: 'meet.jit.si'); // the website's NEXT_PUBLIC_JITSI_DOMAIN

/// The batch's video room, as the website's VideoRoom builds the link.
String jitsiUrl(String room, String batch, String topic, String userName, {bool audioOnly = false}) =>
    'https://$kJitsi/$room#userInfo.displayName=${Uri.encodeComponent(jsonEncode(userName))}&config.subject=${Uri.encodeComponent(jsonEncode('$batch · $topic'))}'
    '${audioOnly ? '&config.startAudioOnly=true&config.startWithVideoMuted=true' : ''}';

/// Start and end the class, open the video room, see who joined (and save it as attendance), raised hands, a quick poll.
/// shortcut: the room's Q&A, chat, board and lecture recorder are on the website only.
class LiveRoomScreen extends StatefulWidget {
  const LiveRoomScreen({super.key, required this.batch});
  final String batch;
  @override
  State<LiveRoomScreen> createState() => _LiveRoomScreenState();
}

class _LiveRoomScreenState extends State<LiveRoomScreen> {
  late final topic = TextEditingController(text: liveTopic(widget.batch) ?? '');
  final question = TextEditingController(), options = List.generate(4, (_) => TextEditingController());
  final voter = 'app-${Random.secure().nextInt(1 << 32).toRadixString(36)}${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}';
  var correct = 0, pollError = '';
  Json? v, poll;
  Timer? timer;

  String? get room => (store.state?['liveRooms'] as Map?)?[widget.batch] as String?;
  String get b => Uri.encodeComponent(widget.batch);

  @override
  void initState() {
    super.initState();
    if (room == null) store.act('ensureLiveRoom', [widget.batch]); // this batch's secret room, shared with students when the class starts
    load();
    timer = Timer.periodic(const Duration(seconds: 2), (_) => store.active ? load() : null); // none while the app is in the background
  }

  @override
  void dispose() {
    timer?.cancel();
    for (final c in [topic, question, ...options]) {
      c.dispose();
    }
    super.dispose();
  }

  var busy = false; // on slow internet the next ask waits for the last answer

  Future<void> load() async {
    if (busy) return;
    busy = true;
    try {
      final res = await Future.wait([api('/api/class?batch=$b&voter=$voter'), api('/api/poll?batch=$b')]);
      if (res.any((r) => r.statusCode != 200)) return; // an error answer keeps what is shown (a running class stays running)
      final c = jsonDecode(res[0].body) as Map, p = jsonDecode(res[1].body) as Map;
      if (!mounted) return;
      setState(() {
        v = c['live'] == true ? c.cast<String, dynamic>() : null;
        poll = (p['poll'] as Map?)?.cast<String, dynamic>();
      });
    } catch (_) {
      // offline: try again in 2 s
    } finally {
      busy = false;
    }
  }

  Future<bool> post(String path, Json body) async {
    try {
      final ok = (await api(path, body: body)).statusCode == 200;
      await load();
      return ok;
    } catch (_) {
      return false;
    }
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final color = context.course(batchNo(widget.batch)), live = v, roster = batchKids(widget.batch);
    if (live == null) {
      return Screen(
        title: t('liveRoom.startTitle'),
        subtitle: widget.batch,
        color: color,
        refresh: false,
        children: [
          Box(
            children: [
              Semantics(
                container: true,
                child: TextField(controller: topic, maxLength: 160, onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: t('liveRoom.topic'), counterText: '')),
              ),
              Doing(
                label: '● ${t('liveRoom.goLive')}',
                danger: true,
                onPressed: topic.text.trim().isEmpty || room == null
                    ? null
                    : () async {
                        final ok = await post('/api/class', {'action': 'start', 'batch': widget.batch, 'topic': topic.text, 'teacher': store.staffName, 'room': room});
                        if (!context.mounted) return;
                        if (!ok) return toast(context, t('liveRoom.startFailed'));
                        api('/api/push/send', body: {'batch': widget.batch, 'title': t('liveRoom.startedPush'), 'body': topic.text, 'url': '/student'}).ignore();
                        toast(context, t('liveRoom.started'));
                      },
              ),
              Muted(t('liveRoom.startHelp')),
            ],
          ),
        ],
      );
    }
    final joined = {for (final j in rows(live['joined'])) j['studentId']}..remove(null);
    final hands = rows(live['hands']);
    final secs = max(0, (DateTime.now().millisecondsSinceEpoch - ((live['startedAt'] as num?) ?? 0)) ~/ 1000);
    final r = '${live['room']}', top = '${live['topic']}';
    return Screen(
      title: t('liveRoom.liveNow', [top]),
      subtitle: widget.batch,
      color: color,
      refresh: false,
      children: [
        Box(
          color: context.colors.errorContainer,
          children: [
            Strong('${t('liveRoom.liveNow', [top])} · ${secs ~/ 60}:${'${secs % 60}'.padLeft(2, '0')}'),
            Muted(t('liveRoom.inClass', [live['joinedCount'], roster.length])),
            Doing(
              label: t('liveRoom.end'),
              danger: true,
              small: true,
              onPressed: () async {
                if (!await confirm(context, t('liveRoom.end'), t('liveRoom.endQ'))) return;
                await post('/api/class', {'action': 'end', 'batch': widget.batch});
                if (context.mounted) toast(context, t('liveRoom.ended'));
              },
            ),
          ],
        ),
        Box(
          children: [
            Muted(t('liveRoom.teacherHow')),
            Doing(label: '📹 ${t('liveRoom.join')}', color: color, onPressed: () => openLink(context, jitsiUrl(r, widget.batch, top, store.staffName))),
            Doing(label: '🎧 ${t('liveRoom.audioOnly')}', soft: true, onPressed: () => openLink(context, jitsiUrl(r, widget.batch, top, store.staffName, audioOnly: true))),
            Muted(t('liveRoom.privacy')),
          ],
        ),
        Box(
          title: '${t('liveRoom.attendance')} · ${joined.length}/${roster.length}',
          children: [
            Wrap(spacing: 6, runSpacing: 6, children: [for (final s in roster) Tag('${joined.contains(s['id']) ? '✓ ' : ''}${s['name']}', kind: joined.contains(s['id']) ? 'ok' : 'plain')]),
            Doing(
              label: t('liveRoom.saveAttendance'),
              small: true,
              onPressed: () async {
                final day = dayKey();
                store.act('markAllAbsent', [
                  [for (final s in roster) s['id']],
                  day,
                ]);
                for (final id in joined) {
                  store.act('markPresent', [id, day]);
                }
                toast(context, t('qr.count', [joined.length, roster.length])); // shortcut: liveRoom.attendanceSaved is left out of the app's words
              },
            ),
          ],
        ),
        Box(
          title: '✋ ${t('liveRoom.hands')} (${hands.length})',
          children: [
            if (hands.isEmpty) Muted(t('liveRoom.noHands')),
            for (final (i, h) in hands.indexed)
              Item(
                title: '${i + 1}. ${h['name']}',
                trailing: TextButton(onPressed: () => post('/api/class', {'action': 'lowerHand', 'batch': widget.batch, 'voter': h['voter']}), child: Text(t('liveRoom.lower'))),
              ),
          ],
        ),
        _poll(context),
      ],
    );
  });

  Widget _poll(BuildContext context) {
    final p = poll;
    if (p != null) {
      final counts = (p['counts'] as List?) ?? const [], total = (p['total'] as num?) ?? 0;
      return Box(
        title: t('poll.resultsTitle'),
        children: [
          Strong('${p['question']}'),
          Muted(t('poll.responses', [total])),
          for (final (i, o) in ((p['options'] as List?) ?? const []).indexed) ...[
            Line('${String.fromCharCode(65 + i)}. $o${i == p['correct'] ? ' ✓' : ''}', '${counts[i]} (${total == 0 ? 0 : jsRound((counts[i] as num) / total * 100)}%)'),
            MarkBar(total == 0 ? 0 : jsRound((counts[i] as num) / total * 100), plain: true),
          ],
          Doing(
            label: t('poll.end'),
            soft: true,
            danger: true,
            small: true,
            onPressed: () async {
              await post('/api/poll', {'action': 'end', 'batch': widget.batch});
              if (context.mounted) toast(context, t('poll.ended'));
            },
          ),
        ],
      );
    }
    return Box(
      title: t('poll.launchTitle'),
      children: [
        Muted(t('poll.launchSub')),
        TextField(controller: question, decoration: InputDecoration(labelText: t('poll.question'), hintText: t('poll.questionPh'))),
        RadioGroup<int>(
          groupValue: correct,
          onChanged: (x) => setState(() => correct = x ?? 0),
          child: Column(
            spacing: 6,
            children: [
              for (final (i, c) in options.indexed)
                Row(
                  children: [
                    Semantics(label: t('poll.markCorrect', [String.fromCharCode(65 + i)]), child: Radio<int>(value: i)),
                    Expanded(child: TextField(controller: c, decoration: InputDecoration(labelText: t('poll.option', [String.fromCharCode(65 + i)])))),
                  ],
                ),
            ],
          ),
        ),
        if (pollError.isNotEmpty) Text(pollError, style: TextStyle(color: context.colors.error, fontWeight: FontWeight.w700)),
        Doing(
          label: t('poll.launch'),
          onPressed: () async {
            final filled = [for (final (i, c) in options.indexed) if (c.text.trim().isNotEmpty) (o: c.text.trim(), i: i)];
            final right = filled.indexWhere((x) => x.i == correct);
            if (question.text.trim().isEmpty || options[0].text.trim().isEmpty || options[1].text.trim().isEmpty) return; // the website's required fields
            if (right < 0) return setState(() => pollError = t('poll.pickCorrect'));
            final ok = await post('/api/poll', {'action': 'start', 'batch': widget.batch, 'question': question.text, 'options': [for (final x in filled) x.o], 'correct': right});
            if (!mounted) return;
            if (!ok) return setState(() => pollError = t('poll.failed'));
            question.clear();
            for (final c in options) {
              c.clear();
            }
            setState(() => pollError = '');
            if (context.mounted) toast(context, t('poll.launched'));
          },
        ),
      ],
    );
  }
}

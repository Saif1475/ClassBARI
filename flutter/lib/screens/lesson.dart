import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';

import '../api.dart';
import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'pdf.dart';
import 'student.dart' show chapterNo, kindIcons;
import '../icon.dart';
import '../icons.g.dart';

const _fileMax = 8000000; // the server's limit for a photo sent as text

/// A photo from the camera or gallery, made small enough to send: (file name, the picture, the picture as a data: link).
Future<({String name, Uint8List bytes, String data})?> pickPhoto(BuildContext context, {required bool camera, double max = 1800}) async {
  try {
    final x = await ImagePicker().pickImage(source: camera ? ImageSource.camera : ImageSource.gallery, imageQuality: 60, maxWidth: max, maxHeight: max);
    if (x == null) return null;
    final bytes = await x.readAsBytes();
    final png = bytes.length > 3 && bytes[0] == 0x89 && bytes[1] == 0x50; // a PNG stays a PNG; everything else comes back as JPEG
    final data = 'data:image/${png ? 'png' : 'jpeg'};base64,${base64Encode(bytes)}';
    if (data.length > _fileMax) {
      if (context.mounted) toast(context, t('app.tooBig'));
      return null;
    }
    return (name: x.name.isEmpty ? 'photo.jpg' : x.name, bytes: bytes, data: data);
  } catch (_) {
    return null; // no camera, or permission refused
  }
}

/// A PDF from the phone as a data: link, as the website sends it (readAsDataUrl): at most 5 MB, the website's limit
/// (MAX_UPLOAD_BYTES; its data: link then stays under the server's 8 MB).
Future<({String name, String data})?> pickPdf(BuildContext context) async {
  try {
    final f = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: ['pdf']);
    if (f == null) return null;
    final size = await f.length() ?? 0;
    final data = size > 5 * 1024 * 1024 ? null : 'data:application/pdf;base64,${base64Encode(await f.readAsBytes())}';
    if (data == null || data.length > _fileMax) {
      if (context.mounted) toast(context, t('community.pdfTooBig'));
      return null;
    }
    return (name: f.name.length > 120 ? f.name.substring(0, 120) : f.name, data: data);
  } catch (_) {
    return null; // no file app, or permission refused
  }
}

/// One lesson: what it is, what it is worth, when it is due and whether it is done; then the lesson itself
/// (watch, read, take the quiz or hand in homework). The main button stays at the bottom of the page.
class LessonScreen extends StatelessWidget {
  const LessonScreen({super.key, required this.moduleId, required this.itemId});
  final int moduleId, itemId;
  @override
  Widget build(BuildContext context) => Live((context) {
    final m = store.modules.where((x) => x['id'] == moduleId).firstOrNull;
    final it = rows(m?['items']).where((x) => x['id'] == itemId).firstOrNull;
    final me = store.me?['id'] as int?;
    if (m == null || it == null || me == null) return Screen(title: '', children: [Muted(t('app.noChapters'))]);
    final color = context.course(chapterNo(moduleId));
    final kind = it['kind'], url = it['url'] as String?;
    final done = (it['done'] == true) != store.pending('toggleItemDone', [moduleId, itemId, me]).isOdd; // flipped while on its way
    final work = kind == 'quiz' || kind == 'task' || kind == 'exam';
    final sub = (it['submissions'] as Map?)?['$me'] as Map?;
    final Map? scores = it['scores'];
    final mark = (kind == 'quiz' ? scores : sub)?[kind == 'quiz' ? '$me' : 'grade']; // a quiz: its marks by student; else this student's hand-in
    final handedIn = kind == 'quiz' ? mark != null : sub != null;
    final late = !handedIn && it['dueDate'] is String && '${it['dueDate']}'.compareTo(dayKey()) < 0;
    return Screen(
      title: '${m['title']}',
      color: color,
      refresh: false,
      bottom: kind == 'video' || kind == 'pdf'
          ? Doing(label: done ? t('app.markNotDone') : t('app.markDone'), icon: done ? I.checkCircle : I.radioOff, soft: done, color: color, onPressed: () => store.act('toggleItemDone', [moduleId, itemId, me]))
          : null,
      children: [
        Box(
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 12,
              children: [
                Glyph(kindIcons[kind] ?? I.file, color: color),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 2,
                    children: [
                      Semantics(header: true, child: Text('${it['title']}', style: context.type.headlineSmall)),
                      if ('${it['meta'] ?? ''}'.isNotEmpty) Muted('${it['meta']}'),
                    ],
                  ),
                ),
              ],
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (work) Tag(mark != null ? t('app.gradedTag') : (handedIn ? t('app.submitted') : (late ? t('app.overdue') : t('app.notSubmitted'))), kind: handedIn ? 'ok' : (late ? 'bad' : 'plain')),
                if (!work && done) Tag(t('app.done'), kind: 'ok'),
                if (it['points'] is num) Tag(t('app.pts', [it['points']]), kind: 'plain'),
                if (it['dueDate'] is String) Tag(t('app.due', [fmtDate(it['dueDate'] as String)]), kind: 'plain'),
              ],
            ),
          ],
        ),
        if (kind == 'video') VideoBox(url, itemId: itemId),
        if (kind == 'pdf') OpenFile(url),
        if (kind == 'pdf' && url != null && url.startsWith('/api/files/'))
          Doing(
            label: '${t('pdfhl.open')} · ${t('pdfhl.ask')}',
            icon: I.sparkle,
            soft: true,
            color: color,
            onPressed: () async => push(context, PdfScreen(file: url, title: '${it['title']}')),
          ),
        if (kind == 'quiz') QuizBox(key: ValueKey(itemId), moduleId: moduleId, item: it, me: me),
        if (kind == 'task' || kind == 'exam') ...[if (it['paper'] is String) OpenFile(it['paper'] as String), Homework(moduleId: moduleId, item: it, me: me)],
      ],
    );
  });
}

class OpenFile extends StatelessWidget {
  const OpenFile(this.url, {super.key});
  final String? url;
  @override
  Widget build(BuildContext context) => url == null || url!.isEmpty ? Muted(t('app.noFile')) : Doing(label: t('app.open'), icon: I.external, onPressed: () => openLink(context, url!));
}

/// Stored videos play here; YouTube and other web links open in their own app or the browser.
class VideoBox extends StatefulWidget {
  const VideoBox(this.url, {super.key, this.itemId});
  final String? url;
  /// The lesson item: watched time is sent to the teacher's "who watched" list, as on the website.
  final int? itemId;
  @override
  State<VideoBox> createState() => _VideoBoxState();
}

class _VideoBoxState extends State<VideoBox> {
  VideoPlayerController? player;
  var failed = false;
  double last = 0, watched = 0, reported = 0; // seconds: where it was, how much was really watched, how much was sent
  bool get web => RegExp(r'youtube\.com|youtu\.be|vimeo\.com|drive\.google').hasMatch(widget.url ?? '');

  @override
  void initState() {
    super.initState();
    if (widget.url != null && widget.url!.isNotEmpty && !web) load();
  }

  Future<void> load() async {
    final link = await fileLink(widget.url!);
    if (!mounted) return;
    if (link == null) return setState(() => failed = true);
    final p = VideoPlayerController.networkUrl(Uri.parse(link));
    player = p;
    try {
      await p.initialize();
      p.addListener(() {
        progress(p);
        if (mounted) setState(() {});
      });
    } catch (_) {
      failed = true;
    }
    if (mounted) setState(() {});
  }

  /// Same rule as the website's player: only time actually played counts (no skipping ahead); sent every 5 seconds and at the end.
  void progress(VideoPlayerController p) {
    final at = p.value.position.inMilliseconds / 1000, dur = p.value.duration.inMilliseconds / 1000;
    final step = at - last;
    last = at;
    if (step > 0 && step < 2) watched += step;
    final ended = dur > 0 && at >= dur - 0.5;
    if (widget.itemId == null || dur <= 0 || store.status == Status.offline || (watched < reported + 5 && !(ended && watched > reported))) return;
    reported = watched;
    store.act('recordWatch', [widget.itemId, store.me?['id'], watched.clamp(0, dur), dur]);
  }

  @override
  void dispose() {
    player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final url = widget.url, p = player;
    if (url == null || url.isEmpty) return Muted(t('app.noFile'));
    if (web || failed) return OpenFile(url);
    if (p == null || !p.value.isInitialized) {
      return const AspectRatio(
        aspectRatio: 16 / 9,
        child: Center(child: CircularProgressIndicator()),
      );
    }
    final playing = p.value.isPlaying;
    return Column(
      spacing: 4,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: AspectRatio(aspectRatio: p.value.aspectRatio, child: VideoPlayer(p)),
        ),
        Row(
          children: [
            IconButton(tooltip: playing ? 'Pause' : 'Play', iconSize: 32, icon: Ico(playing ? I.pause : I.play), onPressed: () => playing ? p.pause() : p.play()),
            Expanded(child: VideoProgressIndicator(p, allowScrubbing: true, padding: const EdgeInsets.symmetric(vertical: 12))),
          ],
        ),
      ],
    );
  }
}

/// MCQ quiz, in the same order as on the website; the server marks it.
class QuizBox extends StatefulWidget {
  const QuizBox({super.key, required this.moduleId, required this.item, required this.me});
  final int moduleId, me;
  final Json item;
  @override
  State<QuizBox> createState() => _QuizBoxState();
}

class _QuizBoxState extends State<QuizBox> {
  late final qs = rows(widget.item['questions']);
  late final order = quizOrder(widget.item, widget.me);
  late final picks = List<int?>.filled(qs.length, null);
  var sent = false;
  num? get taken => (widget.item['scores'] as Map?)?['${widget.me}'] as num?;

  @override
  void initState() {
    super.initState();
    // Opening the quiz starts the clock on the server (the teacher sees if it took much longer than allowed).
    if (taken == null && store.pending('startQuiz', [widget.moduleId, widget.item['id'], widget.me]) == 0) Future.microtask(() => store.act('startQuiz', [widget.moduleId, widget.item['id'], widget.me])); // after this screen is drawn
  }

  Future<void> submit() async {
    final left = picks.where((p) => p == null).length;
    if (!await confirm(context, t('app.submitQuiz'), t('app.confirmSubmit', [left]))) return;
    setState(() => sent = true);
    final saved = await store.act('submitQuiz', [widget.moduleId, widget.item['id'], widget.me, 0, [], 0, picks]);
    if (!saved && mounted) {
      if (store.status == Status.offline) toast(context, t('app.sentLater'));
      if (store.syncFailed) setState(() => sent = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final points = (widget.item['points'] as num?) ?? qs.length;
    if (taken != null) {
      final marks = ((widget.item['answers'] as Map?)?['${widget.me}'] as List?) ?? const [];
      return Box(
        title: t('app.scored', [taken, points]),
        children: [MarkBar(points == 0 ? 0 : taken! / points * 100), if (marks.isNotEmpty) Muted('✓ ${localNumber(marks.where((x) => x == true).length, lang.code)} · ✗ ${localNumber(marks.where((x) => x != true).length, lang.code)}')],
      );
    }
    if (sent) {
      return Box(
        children: [
          Row(
            spacing: 12,
            children: [
              const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.5)),
              Expanded(child: Strong(t('quiz.checking'))),
            ],
          ),
        ],
      );
    }
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        for (final (n, qi) in order.questions.indexed)
          Box(
            children: [
              Muted(t('app.question', [n + 1, qs.length])),
              Strong('${qs[qi]['q']}'),
              for (final oi in order.options[qi])
                Semantics(
                  inMutuallyExclusiveGroup: true,
                  checked: picks[qi] == oi,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => setState(() => picks[qi] = oi),
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 48),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      alignment: Alignment.centerLeft,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(width: 2, color: picks[qi] == oi ? c.primary : c.outlineVariant),
                        color: picks[qi] == oi ? c.primaryContainer : null,
                      ),
                      child: Text('${(qs[qi]['options'] as List)[oi]}', style: TextStyle(color: picks[qi] == oi ? c.onPrimaryContainer : c.onSurface)),
                    ),
                  ),
                ),
            ],
          ),
        Doing(label: t('app.submitQuiz'), onPressed: submit),
      ],
    );
  }
}

/// Homework or a written exam: a photo from the camera or gallery, or a PDF, handed in once (until the teacher marks it).
class Homework extends StatefulWidget {
  const Homework({super.key, required this.moduleId, required this.item, required this.me});
  final int moduleId, me;
  final Json item;
  @override
  State<Homework> createState() => _HomeworkState();
}

class _HomeworkState extends State<Homework> {
  ({String name, Uint8List? bytes, String data})? photo; // bytes: a photo to show; null for a PDF

  Future<void> pdf() async {
    final p = await pickPdf(context);
    if (p != null && mounted) setState(() => photo = (name: p.name, bytes: null, data: p.data));
  }

  Future<void> pick(bool camera) async {
    final p = await pickPhoto(context, camera: camera);
    if (p != null && mounted) setState(() => photo = p);
  }

  Future<void> send() async {
    final saved = await store.act('submitAssignment', [
      widget.moduleId,
      widget.item['id'],
      widget.me,
      {'fileName': photo!.name, 'file': photo!.data},
    ]);
    if (!saved && mounted && store.status == Status.offline) toast(context, t('app.sentLater'));
  }

  @override
  Widget build(BuildContext context) {
    final sub = (widget.item['submissions'] as Map?)?['${widget.me}'] as Map?;
    if (sub != null) {
      return Box(
        title: sub['grade'] != null ? t('app.marked', [sub['grade'], (widget.item['points'] as num?) ?? 20]) : t('app.handedIn'),
        children: [Muted('${sub['fileName'] ?? ''}'), if ('${sub['comment'] ?? ''}'.isNotEmpty) Text('${sub['comment']}')],
      );
    }
    return Box(
      children: [
        if (photo?.bytes case final bytes?)
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Image.memory(bytes, height: 320, fit: BoxFit.contain, semanticLabel: photo!.name),
          )
        else if (photo != null)
          Item(icon: I.file, title: photo!.name),
        Row(
          spacing: 8,
          children: [
            Expanded(
              child: OutlinedButton.icon(onPressed: () => pick(true), icon: Ico(I.camera), label: Text(t('app.takePhoto'))),
            ),
            Expanded(
              child: OutlinedButton.icon(onPressed: () => pick(false), icon: Ico(I.image), label: Text(t('app.choosePhoto'))),
            ),
          ],
        ),
        OutlinedButton.icon(onPressed: pdf, icon: Ico(I.file), label: Text(t('community.addPdf'))),
        Doing(label: t('app.handIn'), icon: I.upload, onPressed: photo == null || store.pending('submitAssignment', [widget.moduleId, widget.item['id'], widget.me]) > 0 ? null : send), // not twice while waiting for internet
      ],
    );
  }
}

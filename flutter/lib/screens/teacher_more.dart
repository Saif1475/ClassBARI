// The teacher app's extra pages, the same as on the website: answering students' doubts (more follow).
import 'package:material_ui/material_ui.dart';

import '../icons.g.dart';
import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'lesson.dart' show pickPhoto;
import 'student_more.dart' show DoubtCard;

/// The doubts of this person's batches that still wait for an answer.
List<Json> openDoubts() {
  final names = {for (final b in store.myBatches) b['name']};
  return rows(store.state?['doubts']).where((d) => d['solved'] != true && (store.runsAll || names.contains(d['batch']))).toList();
}

/// Students' doubts: waiting or solved; answer with text and a photo, and mark solved.
/// shortcut: voice-note answers are recorded on the website only (no recording package in the app yet).
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
        for (final d in list) DoubtCard(d, below: _Reply(key: ValueKey(d['id']), doubtId: d['id'])),
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
  String? photo;

  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  Future<void> send(bool solved) async {
    final saved = await store.act('replyDoubt', [
      widget.doubtId,
      {'by': store.staffName, 'text': text.text.trim(), 'image': ?photo},
      solved,
    ]);
    text.clear();
    setState(() => photo = null);
    if (mounted) toast(context, saved ? t('doubts.replied') : t('app.sentLater'));
  }

  @override
  Widget build(BuildContext context) {
    final can = text.text.trim().isNotEmpty || photo != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        TextField(controller: text, minLines: 2, maxLines: 6, maxLength: 2000, onChanged: (_) => setState(() {}), decoration: InputDecoration(hintText: t('doubts.replyPh'), counterText: '')),
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
            Doing(label: t('doubts.sendSolved'), icon: I.checkCircle, small: true, onPressed: can ? () => send(true) : null),
            Doing(label: t('doubts.send'), icon: I.send, soft: true, small: true, onPressed: can ? () => send(false) : null),
          ],
        ),
      ],
    );
  }
}

import 'package:material_ui/material_ui.dart';

import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'pdf.dart' show Bubble;
import 'student.dart';

class GuardianApp extends StatelessWidget {
  const GuardianApp({super.key});
  @override
  Widget build(BuildContext context) => Live(
    (context) => Tabs([
      (icon: Icons.home_outlined, label: t('app.tabs.home'), page: const GuardianHome()),
      (icon: Icons.insights_outlined, label: t('app.tabs2.results'), page: const GuardianResults()),
      (icon: Icons.chat_bubble_outline, label: t('app.tabs2.messages'), page: const GuardianMessages()),
      (icon: Icons.person_outline, label: t('app.tabs.profile'), page: const GuardianProfile()),
    ]),
  );
}

/// Guardians with several children pick one; every tab then shows that child.
class ChildChips extends StatelessWidget {
  const ChildChips({super.key});
  @override
  Widget build(BuildContext context) {
    final kids = store.children;
    if (kids.length < 2) return const SizedBox.shrink();
    return Chips(value: '${store.child?['id']}', options: [for (final k in kids) '${k['id']}'], labels: {for (final k in kids) '${k['id']}': '${k['name']}'.split(' ').first}, onChanged: (id) => store.pickedChild = int.parse(id));
  }
}

class GuardianHome extends StatelessWidget {
  const GuardianHome({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final child = store.child;
    if (child == null) return Screen(children: [Muted(t('auth.notEnrolled'))]);
    final id = child['id'] as int;
    final due = (child['feeDue'] as num?) ?? 0;
    final last = gradedResults(store.modules, id).reversed.take(3).toList();
    final batch = store.batches.where((b) => b['name'] == child['batch']).firstOrNull;
    final att = monthAttendance((store.state?['attendance'] as Map?) ?? const {}, id, batch?['classDays'] as List?);
    final live = liveFor(child['batch']);
    final notices = noticesFor(child['batch']).take(3).toList();
    final slots = rows(store.state?['meetings']).where((m) => m['batch'] == child['batch'] && m['start'] is String && toDate(m['start'] as String).isAfter(DateTime.now())).toList();
    Future<void> tapSlot(Json m) async {
      if (m['bookedBy'] == id) {
        await store.act('cancelMeeting', [m['id']]);
      } else if (m['bookedBy'] == null) {
        await store.act('bookMeeting', [m['id'], id]);
      } else {
        toast(context, t('app.taken'));
      }
    }

    Widget fact(IconData icon, String text) => Line(
      child: Row(
        spacing: 12,
        children: [
          Icon(icon),
          Expanded(child: Strong(text)),
        ],
      ),
    );
    return Screen(
      children: [
        if (store.children.length > 1) const ChildChips(),
        H1('${child['name']}', kicker: '${child['batch']}'),
        // The green card: this month at a glance, as on the website's parent page.
        Box(
          hero: true,
          title: t('glance.title'),
          children: [
            fact(Icons.event_available_outlined, att.held > 0 ? t('glance.attended', [att.present, att.held]) : t('parent.noClasses')),
            fact(Icons.payments_outlined, due > 0 ? t('glance.feeDue', [taka(due)]) : t('glance.feePaid')),
            if (last.isNotEmpty) fact(Icons.insights_outlined, t('glance.lastTest', ['${show(last.first.score)}/${show(last.first.points)}'])),
          ],
        ),
        if (due > 0) Box(color: context.colors.tertiaryContainer, children: [Muted(t('auth.payAtInstitute'))]),
        if (live != null) LiveBox(live),
        Box(
          title: t('app.results'),
          children: [
            if (last.isEmpty) Muted(t('app.noResults')),
            for (final r in last) Line(child: Pair(r.title, '${show(r.score)}/${show(r.points)}')),
          ],
        ),
        if (notices.isNotEmpty) NoticeLines(notices),
        Box(
          title: t('app.meetings'),
          children: [
            if (slots.isEmpty) Muted(t('app.noMeetings')),
            for (final m in slots)
              Line(
                onTap: () => tapSlot(m),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Strong(fmtDateTime(m['start'] as String)),
                    Muted('${m['teacher'] ?? ''} · ${m['minutes'] ?? ''} min'),
                    Strong(m['bookedBy'] == id ? t('app.booked') : (m['bookedBy'] == null ? t('app.book') : t('app.taken')), color: m['bookedBy'] == null || m['bookedBy'] == id ? context.colors.primary : context.colors.onSurfaceVariant),
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  });
}

class GuardianResults extends StatelessWidget {
  const GuardianResults({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final child = store.child;
    if (child == null) return const Loading();
    final note = '${(store.state?['reportComments'] as Map?)?['${child['id']}'] ?? ''}';
    return Screen(
      children: [
        if (store.children.length > 1) const ChildChips(),
        H1(t('app.tabs2.results')),
        if (note.isNotEmpty) Box(children: [Text(note)]),
        Box(children: [ResultLines(child['id'] as int)]),
      ],
    );
  });
}

/// A guardian ↔ teacher thread (`parent-<child id>`). In the Guardian app "mine" means the guardian wrote it; the
/// Teacher app shows the same thread from the other side.
class ChatThread extends StatefulWidget {
  const ChatThread({super.key, required this.threadId, required this.guardian});
  final String threadId;
  final bool guardian;
  @override
  State<ChatThread> createState() => _ChatThreadState();
}

class _ChatThreadState extends State<ChatThread> {
  final text = TextEditingController();

  @override
  void initState() {
    super.initState();
    if (!widget.guardian && ((thread?['unread'] as num?) ?? 0) > 0) Future.microtask(() => store.act('markChatRead', [widget.threadId])); // after this screen is drawn
  }

  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  Json? get thread => rows(store.state?['chats']).where((c) => c['id'] == widget.threadId).firstOrNull;

  Future<void> send() async {
    final msg = text.text.trim();
    if (msg.isEmpty) return;
    text.clear();
    setState(() {});
    final saved = widget.guardian
        ? await store.act('sendParentMessage', [int.parse(widget.threadId.replaceFirst('parent-', '')), msg])
        : await store.act('sendChatMessage', [widget.threadId, store.state?['teacherLogin'] ?? store.state?['teacherName'] ?? '', msg, false]);
    if (!saved && mounted && store.status == Status.offline) toast(context, t('app.sentLater'));
  }

  @override
  Widget build(BuildContext context) {
    final messages = rows(thread?['messages']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 10,
      children: [
        if (messages.isEmpty) Muted(t('app.noMessages')),
        for (final m in messages) Bubble(text: '${m['text']}', mine: widget.guardian ? m['mine'] == true : m['mine'] != true, sender: '${m['sender'] ?? ''}', when: m['at'] is String ? fmtWhen(m['at'] as String) : null),
        Box(
          children: [
            Semantics(
              container: true,
              child: TextField(
                controller: text,
                minLines: 1,
                maxLines: 5,
                maxLength: 2000,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(hintText: t(widget.guardian ? 'app.writeTeacher' : 'app.writeGuardian'), labelText: t('app.tabs2.messages'), counterText: '', fillColor: context.colors.surface),
              ),
            ),
            Doing(label: t('app.send'), icon: Icons.send, onPressed: text.text.trim().isEmpty ? null : send),
          ],
        ),
      ],
    );
  }
}

class GuardianMessages extends StatelessWidget {
  const GuardianMessages({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final child = store.child;
    return Screen(
      children: [
        if (store.children.length > 1) const ChildChips(),
        H1(t('app.tabs2.messages')),
        if (child != null) ChatThread(key: ValueKey(child['id']), threadId: 'parent-${child['id']}', guardian: true),
      ],
    );
  });
}

class GuardianProfile extends StatelessWidget {
  const GuardianProfile({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final kids = store.children, g = kids.firstOrNull;
    return Profile(note: t('settings.askInstitute'), rows: [(t('settings.yourName'), '${g?['guardianName'] ?? ''}'), (t('settings.phone'), '${g?['phone'] ?? ''}'), for (final k in kids) (t('app.child'), '${k['name']} · ${k['batch']}')]);
  });
}

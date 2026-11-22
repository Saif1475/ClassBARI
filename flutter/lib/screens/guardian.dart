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
  Widget build(BuildContext context) => Live((context) {
    final kids = store.children, g = kids.firstOrNull;
    return Tabs(
      [
        AppTab(Icons.space_dashboard_outlined, t('app.tabs.home'), const GuardianHome()),
        AppTab(Icons.insights_rounded, t('app.tabs2.results'), const GuardianResults()),
        AppTab(Icons.notifications_none_rounded, t('app.notices'), const GuardianNotices()),
        AppTab(Icons.chat_bubble_outline_rounded, t('app.tabs2.messages'), const GuardianMessages()),
      ],
      note: t('settings.askInstitute'),
      details: [(t('settings.yourName'), '${g?['guardianName'] ?? ''}'), (t('settings.phone'), '${g?['phone'] ?? ''}'), for (final k in kids) (t('app.child'), '${k['name']} · ${k['batch']}')],
    );
  });
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
    final att = attendanceOf(child);
    final live = liveFor(child['batch']);
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

    return Screen(
      children: [
        if (store.children.length > 1) const ChildChips(),
        Row(
          spacing: 14,
          children: [
            Avatar('${child['name']}', size: 52, color: context.course(1)),
            Expanded(child: H1('${child['name']}', kicker: '${child['batch']}')),
          ],
        ),
        // The coloured card: this month at a glance.
        Box(
          hero: true,
          flush: true,
          children: [
            Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 4), child: H2(t('glance.title'))),
            Item(icon: Icons.event_available_rounded, title: att.held > 0 ? t('glance.attended', [att.present, att.held]) : t('parent.noClasses')),
            const Divider(indent: 14, endIndent: 14),
            Item(icon: Icons.payments_outlined, title: due > 0 ? t('glance.feeDue', [taka(due)]) : t('glance.feePaid')),
            if (last.isNotEmpty) ...[
              const Divider(indent: 14, endIndent: 14),
              Item(icon: Icons.insights_rounded, title: t('glance.lastTest', ['${show(last.first.score)}/${show(last.first.points)}']), subtitle: last.first.title),
            ],
            const SizedBox(height: 6),
          ],
        ),
        if (due > 0)
          Box(
            color: context.colors.tertiaryContainer,
            children: [Text(t('auth.payAtInstitute'), style: context.type.bodySmall?.copyWith(color: context.colors.onTertiaryContainer))],
          ),
        if (live != null) LiveBox(live),
        Group(
          title: t('app.results'),
          children: [
            if (last.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Muted(t('app.noResults'))),
            for (final r in last) Item(icon: kindIcons[r.kind], color: r.pct >= 60 ? context.colors.primary : context.colors.error, title: r.title, trailing: Strong('${show(r.score)}/${show(r.points)}')),
          ],
        ),
        Group(
          title: t('app.meetings'),
          children: [
            if (slots.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Muted(t('app.noMeetings'))),
            for (final m in slots)
              Item(
                icon: Icons.handshake_outlined,
                color: context.course(4),
                title: fmtDateTime(m['start'] as String),
                subtitle: ['${m['teacher'] ?? ''} · ${m['minutes'] ?? ''} min', if (m['bookedBy'] == id) t('app.booked')].join('\n'),
                trailing: m['bookedBy'] == id ? Icon(Icons.check_circle_rounded, color: context.colors.primary) : Tag(m['bookedBy'] == null ? t('app.book') : t('app.taken'), kind: m['bookedBy'] == null ? 'note' : 'plain'),
                onTap: () => tapSlot(m),
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
    final id = child['id'] as int;
    final note = '${(store.state?['reportComments'] as Map?)?['$id'] ?? ''}';
    final att = attendanceOf(child), avg = averageOf(id);
    return Screen(
      children: [
        if (store.children.length > 1) const ChildChips(),
        CardGrid([
          Stat(
            icon: Icons.event_available_rounded,
            label: t('app.attendance'),
            value: att.held > 0 ? '${localNumber(att.pct, lang.code)}%' : '—',
            pct: att.held > 0 ? att.pct : null,
            note: att.held > 0 ? t('app.attended', [att.present, att.held]) : t('parent.noClasses'),
          ),
          Stat(icon: Icons.grade_rounded, color: context.course(1), label: t('app.average'), value: avg == null ? '—' : '${localNumber(avg, lang.code)}%', pct: avg, note: avg == null ? t('app.noResults') : null),
        ]),
        if (note.isNotEmpty) Box(children: [Text(note)]),
        Section(t('app.results')),
        Box(flush: true, children: [ResultLines(id)]),
      ],
    );
  });
}

class GuardianNotices extends StatelessWidget {
  const GuardianNotices({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final batch = store.child?['batch'];
    final live = liveFor(batch);
    final list = noticesFor(batch);
    return Screen(
      children: [
        if (store.children.length > 1) const ChildChips(),
        if (live != null) LiveBox(live),
        if (list.isEmpty && live == null) Box(children: [Muted(t('app.noNotices'))]),
        if (list.isNotEmpty) NoticeCards(list),
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
        if (child != null) ChatThread(key: ValueKey(child['id']), threadId: 'parent-${child['id']}', guardian: true),
      ],
    );
  });
}

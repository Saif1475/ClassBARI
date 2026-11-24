import 'package:material_ui/material_ui.dart';

import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'chat.dart';
import 'student.dart';
import 'student_more.dart' show boxScreen, calendarFor, CalendarScreen, MasteryBox, StoryBox;
import 'guardian_more.dart';
import 'teacher.dart' show absentOn;
import '../icon.dart';
import '../icons.g.dart';

class GuardianApp extends StatelessWidget {
  const GuardianApp({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final kids = store.children, g = kids.firstOrNull;
    return Tabs(
      [
        AppTab(I.dashboard, t('app.tabs.home'), const GuardianHome()),
        AppTab(I.insights, t('app.tabs2.results'), const GuardianResults(), screen: 'results'),
        AppTab(I.bell, t('app.notices'), const GuardianNotices(), screen: 'notices'),
        AppTab(I.message, t('app.tabs2.messages'), const GuardianMessages(), screen: 'messages'),
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
    return Chips(value: '${store.child?['id']}', options: [for (final k in kids) '${k['id']}'], labels: {for (final k in kids) '${k['id']}': '${k['name']}'}, onChanged: (id) => store.pickedChild = int.parse(id));
  }
}

class GuardianHome extends StatelessWidget {
  const GuardianHome({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final child = store.child;
    if (child == null) return Screen(children: [Muted(t('auth.notEnrolled'))]);
    final id = child['id'] as int;
    final due = feeDueOf(child);
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
            Item(icon: I.eventOk, title: att.held > 0 ? t('glance.attended', [att.present, att.held]) : t('parent.noClasses')),
            const Divider(indent: 14, endIndent: 14),
            Item(icon: I.fees, title: due > 0 ? t('glance.feeDue', [taka(due)]) : t('glance.feePaid')),
            if (last.isNotEmpty) ...[
              const Divider(indent: 14, endIndent: 14),
              Item(icon: I.insights, title: t('glance.lastTest', ['${show(last.first.score)}/${show(last.first.points)}']), subtitle: last.first.title),
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
        Builder(builder: (context) {
          final teacher = teacherToCall(child);
          final soon = calendarFor(child['batch']).where((e) => toDate(e['start'] as String).isAfter(DateTime.now().subtract(const Duration(minutes: 90)))).take(3).toList();
          return Group(
            title: t('app.moreForYou'),
            children: [
              for (final e in soon) Item(icon: I.calendar, title: '${e['title']}', subtitle: e['allDay'] == true ? fmtDate(e['start'] as String) : fmtDateTime(e['start'] as String), onTap: () => push(context, CalendarScreen(batch: child['batch']))),
              Item(icon: I.fees, title: t('parent.paymentsTitle'), subtitle: due > 0 ? t('glance.feeDue', [taka(due)]) : t('glance.feePaid'), onTap: () => push(context, const PaymentsScreen())),
              Item(icon: I.exams, title: t('report.title'), onTap: () => push(context, const ReportCardScreen())),
              Item(icon: I.star, title: t('dojo.points'), onTap: () => push(context, const ChildPointsScreen())),
              Item(icon: I.megaphone, title: t('dojo.story'), onTap: () => push(context, boxScreen(t('dojo.story'), () => [StoryBox(store.child?['batch'])]))),
              Item(icon: I.insights, title: t('skills.title'), subtitle: t('skills.sub'), onTap: () => push(context, boxScreen(t('skills.title'), () => [MasteryBox(childModules(), store.child?['id'])]))),
              if (teacher != null) Item(icon: I.support, title: t('glance.call', [teacher.name]), subtitle: teacher.phone, onTap: () => callTeacher(teacher.phone)),
            ],
          );
        }),
        Group(
          title: t('app.meetings'),
          children: [
            if (slots.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Muted(t('app.noMeetings'))),
            for (final m in slots)
              Item(
                icon: I.handshake,
                color: context.course(4),
                title: fmtDateTime(m['start'] as String),
                subtitle: ['${m['teacher'] ?? ''} · ${m['minutes'] ?? ''} min', if (m['bookedBy'] == id) t('app.booked')].join('\n'),
                trailing: m['bookedBy'] == id ? Ico(I.checkCircle, color: context.colors.primary) : Tag(m['bookedBy'] == null ? t('app.book') : t('app.taken'), kind: m['bookedBy'] == null ? 'note' : 'plain'),
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
            icon: I.eventOk,
            label: t('app.attendance'),
            value: att.held > 0 ? '${localNumber(att.pct, lang.code)}%' : '—',
            pct: att.held > 0 ? att.pct : null,
            note: att.held > 0 ? t('app.attended', [att.present, att.held]) : t('parent.noClasses'),
          ),
          Stat(icon: I.star, color: context.course(1), label: t('app.average'), value: avg == null ? '—' : '${localNumber(avg, lang.code)}%', pct: avg, note: avg == null ? t('app.noResults') : null),
        ]),
        Fact('🔥', t('streak.days', [streak(((store.state?['xp'] as Map?)?['$id'] as Map?) ?? const {}).days])),
        if (note.isNotEmpty) Box(children: [Text(note)]),
        Section(t('app.results')),
        Box(flush: true, children: [ResultLines(id)]),
        // Every class day this month, present or absent (the website's attendance log).
        Section(t('parent.attendanceLog')),
        Builder(builder: (context) {
          final month = dayKey(DateTime.now()).substring(0, 7);
          final classDays = (store.batches.where((b) => b['name'] == child['batch']).firstOrNull?['classDays'] as List?)?.cast<num>();
          final days = ((store.state?['attendance'] as Map?) ?? const {}).keys.cast<String>().where((d) => d.startsWith(month) && (classDays == null || classDays.contains(toDate(d).weekday % 7))).toList()..sort();
          if (days.isEmpty) return Muted(t('parent.noClasses'));
          final c = context.colors;
          return Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final d in days)
                Builder(builder: (context) {
                  final absent = absentOn(d).contains(id);
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(color: absent ? c.errorContainer : c.secondaryContainer, borderRadius: BorderRadius.circular(12)),
                    child: Text('${fmtDate(d)} · ${absent ? t('app.absent') : t('app.present')}', style: TextStyle(color: absent ? c.onErrorContainer : c.onSecondaryContainer, fontWeight: FontWeight.w700)),
                  );
                }),
            ],
          );
        }),
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

class GuardianMessages extends StatelessWidget {
  const GuardianMessages({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final child = store.child;
    final header = [if (store.children.length > 1) const ChildChips()];
    if (child == null) return Screen(children: header);
    final teacher = rows(store.state?['batches']).where((b) => b['name'] == child['batch']).firstOrNull?['teacher'] ?? store.state?['teacherName'] ?? '';
    return ChatRoom(key: ValueKey(child['id']), threadId: 'parent-${child['id']}', family: true, subtitle: '$teacher · ${child['batch'] ?? ''}', header: header, hint: t('app.writeTeacher'));
  });
}

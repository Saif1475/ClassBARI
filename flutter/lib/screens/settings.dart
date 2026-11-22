// Settings, one page for all five apps; each app sees the parts that apply to it. It offers what the website's
// Settings page offers (details, look, text size, language, institute code, password, help), and for the AI app the
// chat settings the website's AI chat has (pack and allowance, model, how the AI answers, clearing the chats).
import 'dart:convert';

import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:material_ui/material_ui.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show AuthException, UserAttributes;
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../config.dart';
import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'login.dart' show PasswordField;
import 'pay.dart';
import 'pdf.dart' show clock;
import '../icons.g.dart';

/// What the AI app hands to Settings: its models and pack, what is left of the allowance, and a way to clear the chats.
class AiSettings {
  const AiSettings({required this.models, required this.pack, required this.left, required this.resetsAt, required this.chats, required this.onDeleteAll});
  final List<Json> models;
  final int? pack;
  final num? left;
  final String? resetsAt;
  final int Function() chats; // asked each time, so the count is right after the chats are cleared
  final VoidCallback onDeleteAll;
}

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key, this.details = const [], this.note, this.ai});
  final List<(String, String)> details;
  final String? note;
  final AiSettings? ai;

  @override
  Widget build(BuildContext context) => Live((context) {
    final staff = kApp == 'teacher' || kApp == 'institute';
    final shown = kApp == 'institute' ? const <(String, String)>[] : details.where((d) => d.$2.isNotEmpty && !(staff && d.$1 == t('settings.yourName'))).toList();
    Widget choice(String label, Widget chips) => Column(crossAxisAlignment: CrossAxisAlignment.start, spacing: 8, children: [Muted(label), chips]);
    return Screen(
      title: t('settings.title'),
      refresh: false,
      children: [
        // Who is logged in.
        Row(
          spacing: 14,
          children: [
            Avatar(myName, size: 56),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(myName.isEmpty ? kAppName : myName, style: context.type.headlineSmall),
                  Muted(store.email ?? ''),
                ],
              ),
            ),
          ],
        ),
        if (staff) const StaffProfile(),
        if (kApp == 'institute') const InstituteCode(),
        // Read-only details. Staff change their name in the form above, and the owner the institute's name too.
        if (shown.isNotEmpty) Box(title: t(staff ? 'settings.account' : 'settings.profile'), children: [for (final (label, value) in shown) Pair(label, value), if (note != null) Muted(note!)]),

        // The AI app: the pack, the allowance, the model and how the AI answers.
        if (ai != null) ...[
          if (ai!.pack != null || ai!.left != null) // nothing to show without a pack, or while offline
            Group(
              title: t('aichat.yourPack'),
              children: [
                if (ai!.pack != null) Item(icon: I.sparkle, title: ai!.pack == 0 ? t('aichat.freePlan') : '${taka(ai!.pack!)}${t('aichat.perMonth')}', subtitle: t('aichat.packNote.${ai!.pack}')),
                Item(
                  icon: I.addCard,
                  color: context.course(2),
                  title: t('pay.buyPack'),
                  onTap: () => push(context, Screen(title: t('pay.buyPack'), children: const [PayForm()])),
                ),
                if (ai!.left != null && ai!.resetsAt != null)
                  Item(icon: I.hourglass, color: context.course(1), title: t('aichat.usage'), subtitle: t('aichat.usageLeft', [ai!.left, clock(ai!.resetsAt)]), below: MarkBar(ai!.left!, plain: true)),
              ],
            ),
          if (ai!.models.any((m) => m['locked'] != true && m['soon'] != true))
            Box(
              title: t('aichat.defaultModel'),
              children: [
                Builder(
                  builder: (context) {
                    final ready = ai!.models.where((m) => m['locked'] != true && m['soon'] != true).toList();
                    final mine = ready.any((m) => m['id'] == store.aiModel) ? store.aiModel! : '${ready.first['id']}';
                    return Chips(value: mine, options: [for (final m in ready) '${m['id']}'], labels: {for (final m in ready) '${m['id']}': '${m['label']}'}, onChanged: (id) => store.setting('classbari-ai-model', id));
                  },
                ),
              ],
            ),
          Box(
            title: t('aichat.answers'),
            children: [
              choice(
                t('aichat.answerLang'),
                Chips(
                  value: '${store.aiPrefs['lang'] ?? 'auto'}',
                  options: const ['auto', 'bn', 'en'],
                  labels: {'auto': t('aichat.langAuto'), 'bn': t('aichat.langBn'), 'en': t('aichat.langEn')},
                  onChanged: (v) => store.setting('classbari-ai-prefs', {...store.aiPrefs..remove('lang'), if (v != 'auto') 'lang': v}),
                ),
              ),
              choice(
                t('aichat.answerLength'),
                Chips(
                  value: '${store.aiPrefs['length'] ?? 'normal'}',
                  options: const ['normal', 'short', 'long'],
                  labels: {'normal': t('aichat.lenNormal'), 'short': t('aichat.lenShort'), 'long': t('aichat.lenLong')},
                  onChanged: (v) => store.setting('classbari-ai-prefs', {...store.aiPrefs..remove('length'), if (v != 'normal') 'length': v}),
                ),
              ),
            ],
          ),
          AiChats(ai!),
        ],

        // The look: the same four choices as on the website.
        Box(
          title: t('settings.appearance'),
          children: [
            choice(
              t('settings.colours'),
              Chips(value: store.sky ? 'sky' : 'green', options: const ['green', 'sky'], labels: {'green': t('settings.toneGreen'), 'sky': t('settings.toneSky')}, onChanged: (v) => store.setting('classbari-tone', v)),
            ),
            choice(
              t('settings.theme'),
              Chips(
                value: store.themeMode,
                options: const ['light', 'dark', 'system'],
                labels: {'light': t('settings.light'), 'dark': t('settings.dark'), 'system': t('settings.system')},
                onChanged: (v) => store.setting('classbari-theme', v == 'system' ? null : v),
              ),
            ),
            // A slider from 90% to 130%, as on the website's Settings page; the page follows it while it moves.
            choice(
              '${t('common.textSize')} · ${localNumber((store.textSize * 1000).round() / 10, lang.code)}%',
              Row(
                children: [
                  const ExcludeSemantics(
                    child: Text(
                      'A',
                      textScaler: TextScaler.noScaling,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                    ),
                  ),
                  Expanded(
                    child: Slider(
                      value: store.textSize.clamp(0.9, 1.3),
                      min: 0.9,
                      max: 1.3,
                      divisions: 8,
                      semanticFormatterCallback: (v) => '${(v * 100).round()}%',
                      // Whole steps of 5%, so 100% is exactly 1 (and is then not kept at all: the default).
                      onChanged: (v) => store.setting('classbari-text-size', (v * 20).round() == 20 ? null : (v * 20).round() / 20),
                    ),
                  ),
                  const ExcludeSemantics(
                    child: Text(
                      'A',
                      textScaler: TextScaler.noScaling,
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
            ),
            choice(t('app.language'), Chips(value: lang.code, options: const ['en', 'bn'], labels: const {'en': 'English', 'bn': 'বাংলা'}, onChanged: store.setLang)),
          ],
        ),
        if (staff)
          Box(
            title: t('settings.lists'),
            children: [
              choice(
                t('pager.perPage'),
                Chips(value: '${store.pageSize}', options: [for (final n in pageSizes) '$n'], labels: {for (final n in pageSizes) '$n': localNumber(n, lang.code)}, onChanged: (v) => store.setting('classbari-page-size', int.parse(v))),
              ),
            ],
          ),
        const NotifySwitches(),
        const ChangePassword(),
        Group(
          title: t('settings.help'),
          children: [
            for (final (path, key, icon) in const [('/support', 'support.link', I.support), ('/privacy', 'landing.privacy', I.privacy), ('/terms', 'landing.terms', I.file)])
              Item(
                icon: icon,
                title: t(key),
                onTap: () => launchUrl(Uri.parse('$kApiUrl$path'), mode: LaunchMode.externalApplication),
              ),
            Item(icon: I.info, title: kAppName, subtitle: t('settings.appVersion', [kVersion])),
          ],
        ),
        Doing(label: t('app.logOut'), icon: I.logout, soft: true, danger: true, onPressed: store.signOut),
      ],
    );
  });
}

/// The AI app's chats: how many this phone holds, and clearing them all.
class AiChats extends StatefulWidget {
  const AiChats(this.ai, {super.key});
  final AiSettings ai;
  @override
  State<AiChats> createState() => _AiChatsState();
}

class _AiChatsState extends State<AiChats> {
  @override
  Widget build(BuildContext context) {
    final n = widget.ai.chats();
    return Group(
      title: t('aichat.chats'),
      children: [
        Item(icon: I.message, title: t('aichat.chatsOnDevice', [n]), subtitle: t('aichat.saved')),
        if (n > 0)
          Item(
            icon: I.trash,
            color: context.colors.error,
            title: t('aichat.deleteAll'),
            onTap: () async {
              if (!await confirm(context, t('aichat.deleteAll'), t('aichat.confirmDeleteAll'), yes: t('aichat.deleteAll'))) return;
              widget.ai.onDeleteAll();
              if (mounted) setState(() {});
            },
          ),
      ],
    );
  }
}

/// Which notifications this person gets: one switch per kind, kept on the server, so the website shows the same.
class NotifySwitches extends StatefulWidget {
  const NotifySwitches({super.key});
  @override
  State<NotifySwitches> createState() => _NotifySwitchesState();
}

class _NotifySwitchesState extends State<NotifySwitches> {
  List<String> groups = const [];
  Set<String> off = {};

  @override
  void initState() {
    super.initState();
    () async {
      try {
        final res = await api('/api/notify');
        if (res.statusCode == 200 && mounted) {
          final d = jsonDecode(res.body) as Json;
          setState(() {
            groups = [for (final g in d['groups'] as List) '$g'];
            off = {for (final g in d['off'] as List) '$g'};
          });
        }
      } catch (_) {
        // offline: the switches are not shown
      }
    }();
  }

  Future<void> flip(String g, bool on) async {
    final was = off;
    setState(() => off = on ? (off.toSet()..remove(g)) : {...off, g});
    try {
      final res = await api('/api/notify', body: {'off': off.toList()});
      if (res.statusCode != 200) throw Exception();
    } catch (_) {
      if (mounted) setState(() => off = was); // not saved: show it as it was
    }
  }

  @override
  Widget build(BuildContext context) => groups.isEmpty
      ? const SizedBox.shrink()
      : Box(
          title: t('notify.title'),
          children: [
            Muted(t('notify.help')),
            for (final g in groups)
              Semantics(
                container: true,
                child: SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: !off.contains(g),
                  onChanged: (on) => flip(g, on),
                  title: Text(t('notify.groups.$g'), style: context.type.titleMedium),
                ),
              ),
          ],
        );
}

/// Teachers and owners change their own name and mobile here; owners also the institute's name and bKash number.
class StaffProfile extends StatefulWidget {
  const StaffProfile({super.key});
  @override
  State<StaffProfile> createState() => _StaffProfileState();
}

class _StaffProfileState extends State<StaffProfile> {
  late final name = TextEditingController(text: store.staffName);
  late final phone = TextEditingController(text: '${rows(store.state?['staff']).where((s) => s['name'] == store.staffName).firstOrNull?['phone'] ?? ''}');
  late final inst = TextEditingController(text: '${store.state?['instituteName'] ?? ''}');
  late final bkash = TextEditingController(text: '${(store.state?['site'] as Map?)?['bkash'] ?? ''}');
  String? problem;
  var saved = false;

  @override
  void dispose() {
    for (final c in [name, phone, inst, bkash]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> save() async {
    final owner = kApp == 'institute';
    // The website's rule: a mobile number, if given, must be a real one. (An empty name keeps the old name.)
    final bad = (phone.text.trim().isNotEmpty && !isBdMobile(phone.text.trim())) || (owner && bkash.text.trim().isNotEmpty && !isBdMobile(bkash.text.trim()));
    setState(() {
      problem = bad ? t('teacher.phoneInvalid') : null;
      saved = false;
    });
    if (bad) return;
    // The name as it is now (not as it was when this page opened): the server changes only "my own" profile.
    var ok = await store.act('updateStaffProfile', [store.staffName, name.text.trim(), phone.text.trim()]);
    if (ok && owner) {
      ok =
          (inst.text.trim().isEmpty || await store.act('setInstituteName', [inst.text.trim()])) && // an institute is never left without a name
          await store.act('updateSite', [
            {'bkash': bkash.text.trim()},
          ]);
    }
    if (!mounted) return;
    setState(() {
      saved = ok;
      problem = ok ? null : (store.status == Status.offline ? t('app.sentLater') : t('auth.syncFailed'));
    });
  }

  @override
  Widget build(BuildContext context) {
    Widget field(TextEditingController c, String label, {TextInputType? keyboard, String? hint}) => Semantics(
      container: true,
      child: TextField(
        controller: c,
        keyboardType: keyboard,
        onChanged: (_) => setState(() => saved = false),
        decoration: InputDecoration(labelText: label, hintText: hint, fillColor: context.colors.surface),
      ),
    );
    return Box(
      title: t('settings.profile'),
      children: [
        field(name, t('settings.yourName'), keyboard: TextInputType.name),
        field(phone, t('settings.phone'), keyboard: TextInputType.phone, hint: '01XXXXXXXXX'),
        Muted(t('settings.phoneHelpReal')),
        if (kApp == 'institute') ...[field(inst, t('settings.instituteName')), Muted(t('settings.instituteHelp')), field(bkash, t('settings.bkash'), keyboard: TextInputType.phone, hint: '01XXXXXXXXX')],
        if (problem != null) Semantics(liveRegion: true, child: Strong(problem!, color: context.colors.error)),
        Doing(label: saved ? '${t('settings.saved')} ✓' : t('settings.save'), onPressed: save),
      ],
    );
  }
}

/// The owner's institute code (families type it on the login screen) and whether the institute shows in the search.
class InstituteCode extends StatefulWidget {
  const InstituteCode({super.key});
  @override
  State<InstituteCode> createState() => _InstituteCodeState();
}

class _InstituteCodeState extends State<InstituteCode> {
  Json? card;
  var copied = false;

  @override
  void initState() {
    super.initState();
    ask(null);
  }

  /// Reads the card, or (with `listed`) changes whether the institute shows in the search.
  Future<void> ask(bool? listed) async {
    try {
      final res = listed == null ? await api('/api/institutes?mine=1') : await api('/api/institutes', body: {'listed': listed});
      if (res.statusCode == 200 && mounted) setState(() => card = jsonDecode(res.body) as Json);
    } catch (_) {
      // offline: the code is simply not shown
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = card;
    if (c == null) return const SizedBox.shrink();
    return Box(
      title: t('settings.code'),
      children: [
        Row(
          spacing: 12,
          children: [
            Expanded(child: SelectableText('${c['code']}', style: context.type.headlineSmall?.copyWith(letterSpacing: 3))),
            Doing(
              label: t(copied ? 'settings.copied' : 'settings.copy'),
              icon: I.copy,
              small: true,
              soft: true,
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: '${c['code']}'));
                if (mounted) setState(() => copied = true);
              },
            ),
          ],
        ),
        Muted(t('auth.instituteCodeHelp')),
        Semantics(
          container: true,
          child: SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: c['listed'] != false,
            onChanged: ask,
            title: Text(t('auth.listedLabel'), style: context.type.titleMedium),
            subtitle: Muted(t('auth.listedHelp')),
          ),
        ),
      ],
    );
  }
}

/// Change the password while logged in (the same rule as when it was first chosen).
class ChangePassword extends StatefulWidget {
  const ChangePassword({super.key});
  @override
  State<ChangePassword> createState() => _ChangePasswordState();
}

class _ChangePasswordState extends State<ChangePassword> {
  final password = TextEditingController(), again = TextEditingController();
  (bool ok, String text)? msg;

  @override
  void dispose() {
    password.dispose();
    again.dispose();
    super.dispose();
  }

  Future<void> change() async {
    if (!strongPassword(password.text)) return setState(() => msg = (false, t('auth.passwordRule')));
    if (password.text != again.text) return setState(() => msg = (false, t('auth.passwordsDiffer')));
    String? problem;
    try {
      await auth.updateUser(UserAttributes(password: password.text));
    } on AuthException catch (e) {
      // The password they already have is fine; a project set to ask for a fresh login first sends them to "Forgot password?".
      if (e.code != 'same_password') problem = e.code == 'weak_password' ? t('auth.passwordRule') : (e.code == 'reauthentication_needed' ? t('settings.passwordAgainLogin') : t('auth.resendSoon'));
    } catch (_) {
      problem = t('aichat.error');
    }
    if (!mounted) return;
    setState(() => msg = problem == null ? (true, t('settings.passwordChanged')) : (false, problem));
    if (problem == null) {
      password.clear();
      again.clear();
    }
  }

  @override
  Widget build(BuildContext context) => Box(
    title: t('settings.password'),
    children: [
      Muted('${t('settings.passwordHelp')} ${t('auth.passwordRule')}'),
      PasswordField(controller: password, label: t('auth.password'), fresh: true),
      PasswordField(controller: again, label: t('auth.passwordAgain'), fresh: true),
      if (msg != null) Semantics(liveRegion: true, child: Strong(msg!.$2, color: msg!.$1 ? context.colors.primary : context.colors.error)),
      Doing(label: t('settings.changePassword'), icon: I.lockReset, onPressed: change),
    ],
  );
}

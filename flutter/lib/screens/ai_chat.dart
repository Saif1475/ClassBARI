// The ClassBARI AI app: the student's AI chat (their AI pack decides the models and the allowance).
// Chats are kept on this phone only; answers arrive piece by piece from /api/ai/assistant, as on the website.
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:http/http.dart' as http;
import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'lesson.dart' show pickPhoto;
import 'pdf.dart' show clock;
import 'settings.dart';

const _trailer = '\u001e'; // ends the streamed answer; after it comes JSON: allowance left, declined, cut, error
const _keep = 50; // chats kept on the phone (the most recently used)
const _topicIcons = {'physics': '⚛️', 'chemistry': '🧪', 'math': '📐', 'biology': '🧬', 'ict': '💻', 'english': '🔤', 'bangla': 'অ', 'business': '📊', 'plans': '🗓️', 'other': '💬'};

class AiChatApp extends StatefulWidget {
  const AiChatApp({super.key});
  @override
  State<AiChatApp> createState() => _AiChatAppState();
}

class _AiChatAppState extends State<AiChatApp> {
  final q = TextEditingController(), scroll = ScrollController();
  final frame = GlobalKey<ScaffoldState>(); // to open the chat list from the top bar
  List<Json> chats = [];
  var openId = 0; // 0: a new chat not started yet
  List<Json> models = [];
  var pick = '', access = 'loading'; // loading, ok, pack (no AI pack), soon (not set up), offline
  num? left; // % of the allowance left, and when it refills (shown in Settings)
  String? resetsAt;

  /// The model picked last time (kept in Settings); until then the one the server suggests.
  String get model => store.aiModel ?? pick;
  ({Uint8List bytes, String data})? photo;
  var busy = false, note = '', find = '';
  int? pack; // the student's AI pack, for the side panel
  final unfolded = <String>{}; // topic folders opened in the side panel
  var copied = -1;
  http.Client? stream;
  int get meId => store.me?['id'] as int? ?? 0;
  String get storeKey => 'classbari-ai-chats-$meId';
  Json? get chat => chats.where((c) => c['id'] == openId).firstOrNull;
  List<Json> get msgs => rows(chat?['msgs']);
  Json? get chosen => models.where((m) => m['id'] == model && m['locked'] != true && m['soon'] != true).firstOrNull ?? models.where((m) => m['locked'] != true && m['soon'] != true).firstOrNull;

  @override
  void initState() {
    super.initState();
    try {
      chats = rows(jsonDecode(store.prefs.getString(storeKey) ?? '[]'));
    } catch (_) {
      // unreadable: start with no chats
    }
    loadModels();
  }

  @override
  void dispose() {
    stream?.close();
    q.dispose();
    scroll.dispose();
    super.dispose();
  }

  /// Every model for the picker: the ones a bigger pack unlocks come back marked as locked.
  Future<void> loadModels() async {
    var next = 'offline';
    try {
      final res = await api('/api/ai/assistant');
      if (res.statusCode == 200) {
        final d = jsonDecode(res.body) as Json;
        models = rows(d['models']);
        pack = (d['pack'] as num?)?.toInt();
        pick = '${d['pick'] ?? ''}';
        left = d['left'] as num?;
        resetsAt = d['resetsAt'] as String?;
        next = 'ok';
      } else if (res.statusCode == 402) {
        next = 'pack';
      } else if (res.statusCode == 404) {
        next = 'soon';
      }
    } catch (_) {
      // offline: old chats can still be read
    }
    if (mounted) setState(() => access = next);
  }

  void save(List<Json> next, {bool keepNow = true}) {
    setState(() => chats = next);
    if (keepNow) store.prefs.setString(storeKey, jsonEncode(next.take(_keep).toList()));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (scroll.hasClients) scroll.jumpTo(scroll.position.maxScrollExtent); // follow the answer as it grows
    });
  }

  void open(int id) => setState(() {
    openId = id;
    photo = null;
    note = '';
  });

  Future<void> ask(String question, List<Json> before, {String image = '', bool fresh = false}) async {
    final id = openId == 0 ? DateTime.now().millisecondsSinceEpoch : openId;
    final asked = <Json>[
      ...before,
      {'role': 'user', 'content': question, if (image.isNotEmpty) 'photo': true},
    ];
    // Its folder: picked from the first question; a chat still in "Other" moves once a later question shows its topic.
    final old = chats.where((c) => c['id'] == id).firstOrNull;
    final topic = old != null && old['topic'] != null && old['topic'] != 'other' ? old['topic'] : topics.of(question);
    var list = <Json>[
      {...?old, 'id': id, 'title': old?['title'] ?? (question.length > 60 ? question.substring(0, 60) : question), 'msgs': asked, 'topic': topic, 'at': DateTime.now().millisecondsSinceEpoch},
      ...chats.where((c) => c['id'] != id),
    ];
    // While an answer streams in, the screen follows every piece, but the chats are written to the phone at most once a second.
    var kept = DateTime.now();
    void put(List<Json> m, {bool streaming = false}) {
      final keepNow = !streaming || DateTime.now().difference(kept).inMilliseconds > 1000;
      if (keepNow) kept = DateTime.now();
      list = [
        for (final c in list) c['id'] == id ? {...c, 'msgs': m} : c,
      ];
      if (mounted) save(list, keepNow: keepNow);
    }

    // Nothing came back: take the question out again (and a chat that never started out of the list).
    void undo() {
      if (!mounted) return;
      if (before.isNotEmpty) {
        put(before);
      } else {
        save(list = list.where((c) => c['id'] != id).toList());
        openId = 0;
      }
      q.text = question;
    }

    save(list);
    setState(() {
      openId = id;
      q.clear();
      photo = null;
      note = '';
      busy = true;
    });
    final client = stream = http.Client();
    var answer = '', stopped = false;
    try {
      final res = await apiStream(client, '/api/ai/assistant', {
        'messages': [
          for (final m in asked.length > 10 ? asked.sublist(asked.length - 10) : asked) {'role': m['role'], 'content': m['content']},
        ],
        if (image.isNotEmpty) 'image': image,
        if (chosen != null) 'model': chosen!['id'],
        if (fresh) 'fresh': true,
        if (store.aiPrefs.isNotEmpty) 'prefs': store.aiPrefs, // answer language and length from Settings
      });
      if (res.statusCode != 200) {
        Json d = const {};
        try {
          d = jsonDecode(await res.stream.bytesToString()) as Json;
        } catch (_) {
          // not JSON: the plain error line
        }
        note = res.statusCode == 429 && d['resetsAt'] != null
            ? t('aichat.limit', [clock(d['resetsAt'])])
            : (d['error'] == 'paused' ? t('aichat.paused') : (res.statusCode == 404 || d['error'] == 'soon' ? t('aichat.soon') : t('aichat.error')));
        undo();
        return;
      }
      await for (final piece in res.stream.transform(utf8.decoder)) {
        answer += piece;
        put([
          ...asked,
          {'role': 'assistant', 'content': answer.split(_trailer).first},
        ], streaming: true);
      }
      final parts = answer.split(_trailer);
      Json info = const {'error': true};
      try {
        if (parts.length > 1) info = jsonDecode(parts[1]) as Json;
      } catch (_) {
        // cut off before the end: counts as an error
      }
      final text = parts.first.trim();
      put([
        ...asked,
        {'role': 'assistant', 'content': info['declined'] == true ? t('aichat.declined') : '${text.isEmpty ? t('aichat.error') : text}${info['cut'] == true ? '\n\n${t('aichat.cut')}' : ''}'},
      ]);
      if (info['left'] is num) left = info['left'] as num;
      note = info['error'] == true ? t('aichat.error') : (info['left'] is num ? t('aichat.left', [info['left']]) : '');
    } catch (_) {
      // Stopped by the student, or the connection dropped: keep what arrived.
      stopped = stream == null;
      if (answer.isNotEmpty) {
        put([
          ...asked,
          {'role': 'assistant', 'content': answer.split(_trailer).first},
        ]);
      } else {
        undo();
        if (!stopped) note = t('aichat.error');
      }
    } finally {
      client.close();
      stream = null;
      if (mounted) setState(() => busy = false);
    }
  }

  void send() {
    final text = q.text.trim();
    if (text.isNotEmpty && !busy) ask(text, msgs, image: photo?.data ?? '');
  }

  void stop() {
    final c = stream;
    stream = null; // tells ask() this ending was asked for
    c?.close();
  }

  void retry() {
    final at = msgs.lastIndexWhere((m) => m['role'] == 'user');
    if (at >= 0 && !busy) ask('${msgs[at]['content']}', msgs.sublist(0, at), fresh: true); // "try again" always asks the AI afresh
  }

  Future<void> attach() async {
    final camera = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(leading: const Icon(Icons.photo_camera_outlined), title: Text(t('app.takePhoto')), onTap: () => Navigator.pop(context, true)),
            ListTile(leading: const Icon(Icons.image_outlined), title: Text(t('app.choosePhoto')), subtitle: Text(t('aichat.fileKinds.image.hint')), onTap: () => Navigator.pop(context, false)),
          ],
        ),
      ),
    );
    if (camera == null || !mounted) return;
    final p = await pickPhoto(context, camera: camera);
    if (p != null && mounted) setState(() => photo = (bytes: p.bytes, data: p.data));
  }

  /// The models: the student's own to choose from, the bigger packs' shown locked so they see what they would get.
  void pickModel() => showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (context) => SafeArea(
      child: ListView(
        shrinkWrap: true,
        children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), child: H2(t('aichat.model'))),
          for (final m in models)
            ListTile(
              enabled: m['locked'] != true && m['soon'] != true,
              selected: m['id'] == chosen?['id'],
              leading: Icon(m['locked'] == true ? Icons.lock_outline : (m['id'] == chosen?['id'] ? Icons.radio_button_checked : Icons.radio_button_unchecked)),
              title: Text('${m['label']}'),
              subtitle: Text(m['locked'] == true ? t('aichat.unlockWith', [taka(m['pack'] as num)]) : (m['soon'] == true ? t('aichat.modelSoon') : t('aichat.inPack', [taka(m['pack'] as num)]))),
              onTap: () {
                store.setting('classbari-ai-model', '${m['id']}');
                Navigator.pop(context);
              },
            ),
        ],
      ),
    ),
  );

  /// Settings → "Delete all chats" (asked "are you sure?" there).
  void deleteAll() {
    openId = 0;
    save(const []);
  }

  Future<void> remove(Json c) async {
    if (!await confirm(context, t('aichat.deleteChat'), t('aichat.confirmDelete'), yes: t('aichat.deleteChat'))) return;
    if (openId == c['id']) openId = 0;
    save(chats.where((x) => x['id'] != c['id']).toList());
  }

  // ---- the page: a quiet chat page, the model's name in the top bar, a rounded box to write in ----------------------
  @override
  Widget build(BuildContext context) => Live((context) {
    final c = context.colors;
    final list = msgs;
    return Scaffold(
      key: frame,
      drawer: Drawer(child: SafeArea(child: _side(context))),
      body: Column(
        children: [
          SafeArea(
            bottom: false,
            child: SizedBox(
              height: 60,
              child: Row(
                children: [
                  const SizedBox(width: 6),
                  IconButton(tooltip: t('aichat.chats'), icon: const Icon(Icons.menu_rounded), onPressed: () => frame.currentState?.openDrawer()),
                  Expanded(
                    child: Center(
                      // The model in use; pressing it shows them all (the ones a bigger pack unlocks are shown locked).
                      child: models.isEmpty
                          ? Text(t('aichat.title'), style: context.type.titleLarge)
                          : Semantics(
                              container: true,
                              button: true,
                              label: '${t('aichat.model')}: ${chosen?['label'] ?? ''}',
                              excludeSemantics: true,
                              child: InkWell(
                                borderRadius: BorderRadius.circular(14),
                                onTap: busy ? null : pickModel,
                                child: Container(
                                  constraints: const BoxConstraints(minHeight: 48),
                                  padding: const EdgeInsets.symmetric(horizontal: 12),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    spacing: 4,
                                    children: [
                                      Flexible(
                                        child: Text('${chosen?['label'] ?? t('aichat.model')}', overflow: TextOverflow.ellipsis, style: context.type.titleMedium),
                                      ),
                                      Icon(Icons.expand_more_rounded, color: c.onSurfaceVariant),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                    ),
                  ),
                  IconButton(tooltip: t('aichat.newChat'), icon: const Icon(Icons.edit_square), onPressed: busy ? null : () => open(0)),
                  const SizedBox(width: 6),
                ],
              ),
            ),
          ),
          Expanded(
            child: access == 'loading'
                ? const Center(child: CircularProgressIndicator())
                : access == 'pack' && list.isEmpty
                ? _locked(context)
                : ListView(
                    controller: scroll,
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    children: [
                      if (list.isEmpty) ..._welcome(context),
                      for (final (i, m) in list.indexed)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 14),
                          child: m['role'] == 'user' ? _mine(context, '${m['content']}', m['photo'] == true) : _answer(context, '${m['content']}', i, last: i == list.length - 1),
                        ),
                      if (busy && (list.isEmpty || list.last['role'] == 'user')) Muted(t('aichat.thinking')),
                      if (note.isNotEmpty) Semantics(liveRegion: true, child: Muted(note)),
                    ],
                  ),
          ),
          if (access != 'loading' && !(access == 'pack' && list.isEmpty)) _composer(context),
        ],
      ),
    );
  });

  /// A new chat: a greeting in the middle, the student's topic folders, and a few things to ask.
  List<Widget> _welcome(BuildContext context) {
    final name = '${store.me?['name'] ?? ''}'.split(' ').first;
    final mine = [for (final topic in topics.all) (topic, chats.where((x) => (x['topic'] ?? 'other') == topic).length)].where((x) => x.$2 > 0).toList();
    return [
      const SizedBox(height: 28),
      Center(
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Image.asset('assets/icons/chatbot.png', width: 56, height: 56, semanticLabel: ''),
        ),
      ),
      const SizedBox(height: 16),
      Semantics(
        header: true,
        child: Text(t('aichat.hello', [name]), textAlign: TextAlign.center, style: context.type.headlineMedium),
      ),
      const SizedBox(height: 22),
      if (mine.isNotEmpty) ...[
        Section(t('app.topics')),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final (topic, n) in mine)
              Semantics(
                container: true,
                button: true,
                child: Material(
                  color: context.colors.surfaceContainerLowest,
                  shape: StadiumBorder(side: BorderSide(color: context.colors.outlineVariant)),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => push(context, TopicScreen(topic: topic, chats: chats.where((x) => (x['topic'] ?? 'other') == topic).toList(), onOpen: open)),
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 48),
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        spacing: 8,
                        children: [
                          ExcludeSemantics(child: Text(_topicIcons[topic] ?? '💬', style: const TextStyle(fontSize: 16))),
                          Text(t('aichat.topics.$topic'), style: context.type.bodyMedium?.copyWith(fontWeight: FontWeight.w700)),
                          Tag(localNumber(n, lang.code), kind: 'plain'),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 18),
      ],
      Group(
        children: [for (final idea in lang.list('aichat.ideas')) Item(icon: Icons.lightbulb_outline_rounded, color: context.colors.tertiary, title: idea, onTap: busy || access != 'ok' ? null : () => ask(idea, const []))],
      ),
      const SizedBox(height: 10),
      Center(child: Muted(t('aichat.saved'))),
    ];
  }

  /// The student's own message: a soft rounded bubble on the right.
  Widget _mine(BuildContext context, String text, bool photo) => Align(
    alignment: Alignment.centerRight,
    child: Container(
      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.82),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: context.tone.tile,
        borderRadius: const BorderRadius.only(topLeft: Radius.circular(20), topRight: Radius.circular(20), bottomLeft: Radius.circular(20), bottomRight: Radius.circular(6)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 4,
        children: [
          if (photo) Muted(t('aichat.photo')),
          SelectableText(text, style: context.type.bodyLarge),
        ],
      ),
    ),
  );

  /// One answer: written straight on the page, with small Copy and Try again buttons under it.
  Widget _answer(BuildContext context, String text, int i, {required bool last}) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: 6,
    children: [
      ...rich(context, text),
      if (!busy || !last)
        Row(
          children: [
            IconButton(
              tooltip: t(copied == i ? 'aichat.copied' : 'aichat.copy'),
              icon: Icon(copied == i ? Icons.check_rounded : Icons.copy_rounded, size: 20),
              onPressed: () {
                Clipboard.setData(ClipboardData(text: text));
                setState(() => copied = i);
                Timer(const Duration(milliseconds: 1500), () => mounted ? setState(() => copied = -1) : null);
              },
            ),
            if (last && access == 'ok') IconButton(tooltip: t('aichat.retry'), icon: const Icon(Icons.refresh_rounded, size: 20), onPressed: retry),
          ],
        ),
    ],
  );

  /// The box to write in: the words on top, the add-photo button and the send button underneath.
  Widget _composer(BuildContext context) {
    final c = context.colors;
    final can = access == 'ok';
    return Padding(
      padding: EdgeInsets.fromLTRB(12, 0, 12, 8 + MediaQuery.paddingOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        spacing: 6,
        children: [
          Container(
            decoration: BoxDecoration(
              color: c.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: c.outlineVariant),
              boxShadow: context.tone.lift,
            ),
            padding: const EdgeInsets.fromLTRB(6, 4, 6, 4),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (photo != null)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Stack(
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(8),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: Image.memory(photo!.bytes, width: 72, height: 72, fit: BoxFit.cover, semanticLabel: t('aichat.photo')),
                          ),
                        ),
                        Positioned(
                          right: -6,
                          top: -6,
                          child: IconButton(tooltip: t('aichat.removePhoto'), icon: const Icon(Icons.cancel), onPressed: () => setState(() => photo = null)),
                        ),
                      ],
                    ),
                  ),
                Semantics(
                  container: true,
                  child: TextField(
                    controller: q,
                    enabled: can,
                    minLines: 1,
                    maxLines: 6,
                    maxLength: 1000,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      hintText: t('aichat.placeholder'),
                      counterText: '',
                      filled: false,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      disabledBorder: InputBorder.none,
                      contentPadding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
                    ),
                  ),
                ),
                Row(
                  children: [
                    IconButton(tooltip: t('aichat.attach'), icon: const Icon(Icons.add_rounded), onPressed: can && !busy ? attach : null),
                    const Spacer(),
                    busy
                        ? IconButton.filled(tooltip: t('aichat.stop'), icon: const Icon(Icons.stop_rounded), onPressed: stop)
                        : IconButton.filled(tooltip: t('aichat.send'), icon: const Icon(Icons.arrow_upward_rounded), onPressed: can && q.text.trim().isNotEmpty ? send : null),
                  ],
                ),
              ],
            ),
          ),
          Text(
            access == 'soon' || (access == 'ok' && chosen == null) /* no AI key set up on the server yet */ ? t('aichat.soon') : (access == 'offline' ? t('aichat.error') : t('aichat.disclaimer')),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11.5, color: c.onSurfaceVariant),
          ),
        ],
      ),
    );
  }

  /// No AI pack yet: what the packs are, and who to ask.
  Widget _locked(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      Icon(Icons.lock_outline_rounded, size: 44, color: context.colors.tertiary),
      const SizedBox(height: 12),
      Text(t('aichat.lockedTitle'), textAlign: TextAlign.center, style: context.type.headlineSmall),
      const SizedBox(height: 8),
      Text(t('aichat.lockedBody'), textAlign: TextAlign.center),
      const SizedBox(height: 16),
      Group(
        title: t('aichat.packLabel'),
        children: [for (final p in packs) Item(icon: Icons.auto_awesome, title: '${taka(p)}${t('aichat.perMonth')}', subtitle: t('aichat.packNote.$p'))],
      ),
    ],
  );

  /// The side panel. Its special part: every chat is filed under its topic by itself, so a student finds "that
  /// physics question from last week" in the Physics folder. Below the folders, the latest chats; a search box on top.
  Widget _side(BuildContext context) {
    final needle = find.trim().toLowerCase();
    final shown = chats.where((x) => needle.isEmpty || '${x['title']}'.toLowerCase().contains(needle) || rows(x['msgs']).any((m) => '${m['content']}'.toLowerCase().contains(needle))).toList();
    Widget chatRow(Json x, {bool withTopic = false}) => Item(
      title: '${x['title']}',
      subtitle: withTopic ? '${_topicIcons[x['topic'] ?? 'other']}  ${t('aichat.topics.${x['topic'] ?? 'other'}')}' : null,
      trailing: IconButton(tooltip: t('aichat.deleteChat'), icon: const Icon(Icons.delete_outline_rounded, size: 20), onPressed: () => remove(x)),
      onTap: busy
          ? null
          : () {
              Navigator.pop(context);
              open(x['id'] as int);
            },
    );
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Column(
            spacing: 12,
            children: [
              Row(
                spacing: 10,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.asset('assets/icons/chatbot.png', width: 34, height: 34, semanticLabel: ''),
                  ),
                  Expanded(child: Text(t('aichat.title'), style: context.type.titleLarge)),
                ],
              ),
              Doing(
                label: t('aichat.newChat'),
                icon: Icons.add_rounded,
                onPressed: () async {
                  Navigator.pop(context);
                  open(0);
                },
              ),
              Semantics(
                container: true,
                child: TextField(
                  onChanged: (v) => setState(() => find = v),
                  decoration: InputDecoration(labelText: t('aichat.searchChats'), prefixIcon: const Icon(Icons.search_rounded), isDense: true, fillColor: context.colors.surface),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(8, 0, 8, 12),
            children: [
              if (chats.isEmpty) Padding(padding: const EdgeInsets.all(12), child: Muted(t('aichat.noChats'))),
              if (chats.isNotEmpty && shown.isEmpty) Padding(padding: const EdgeInsets.all(12), child: Muted(t('aichat.noMatch'))),
              // Searching: the matches as one list. Otherwise: the topic folders, then the latest chats.
              if (needle.isNotEmpty)
                for (final x in shown) chatRow(x, withTopic: true)
              else if (chats.isNotEmpty) ...[
                Padding(padding: const EdgeInsets.fromLTRB(8, 4, 8, 0), child: Section(t('app.topics'))),
                Padding(padding: const EdgeInsets.fromLTRB(12, 2, 12, 4), child: Muted(t('app.topicsHelp'))),
                for (final topic in topics.all)
                  if (chats.any((x) => (x['topic'] ?? 'other') == topic)) ...[
                    Semantics(
                      container: true,
                      button: true,
                      expanded: unfolded.contains(topic),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () => setState(() => unfolded.contains(topic) ? unfolded.remove(topic) : unfolded.add(topic)),
                        child: Container(
                          constraints: const BoxConstraints(minHeight: 52),
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: Row(
                            spacing: 12,
                            children: [
                              ExcludeSemantics(child: Text(_topicIcons[topic] ?? '💬', style: const TextStyle(fontSize: 20))),
                              Expanded(child: Text(t('aichat.topics.$topic'), style: context.type.titleMedium)),
                              Tag(localNumber(chats.where((x) => (x['topic'] ?? 'other') == topic).length, lang.code), kind: 'plain'),
                              Icon(unfolded.contains(topic) ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: context.colors.onSurfaceVariant),
                            ],
                          ),
                        ),
                      ),
                    ),
                    if (unfolded.contains(topic))
                      for (final x in chats.where((x) => (x['topic'] ?? 'other') == topic)) Padding(padding: const EdgeInsets.only(left: 20), child: chatRow(x)),
                  ],
                Padding(padding: const EdgeInsets.fromLTRB(8, 12, 8, 0), child: Section(t('app.recents'))),
                for (final x in chats.take(6)) chatRow(x, withTopic: true),
              ],
            ],
          ),
        ),
        const Divider(),
        // Who is logged in, with their pack; the gear opens Settings.
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 6, 8),
          child: Row(
            spacing: 12,
            children: [
              Avatar('${store.me?['name'] ?? ''}'),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${store.me?['name'] ?? ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.titleMedium),
                    Muted(pack == null ? (store.email ?? '') : '${t('aichat.packLabel')} · ${taka(pack!)}${t('aichat.perMonth')}', lines: 1),
                  ],
                ),
              ),
              IconButton(tooltip: t('settings.title'), icon: const Icon(Icons.settings_outlined), onPressed: () => _settings(context)),
            ],
          ),
        ),
      ],
    );
  }

  /// The gear: Settings, with this app's own part (pack, allowance, model, how the AI answers, clearing the chats).
  void _settings(BuildContext context) {
    Navigator.pop(context); // close the chat list first
    push(
      context,
      SettingsScreen(
        details: [(t('settings.yourName'), myName), (t('settings.instituteName'), '${store.state?['instituteName'] ?? ''}')],
        ai: AiSettings(models: models, pack: pack, left: left, resetsAt: resetsAt, chats: () => chats.length, onDeleteAll: deleteAll),
      ),
    );
  }
}

/// The start of a message as one short line: no line breaks, no formatting marks.
String _snippet(String text) {
  final flat = text.replaceAll(RegExp(r'[*`#]+'), '').replaceAll(RegExp(r'\s+'), ' ').trim();
  return flat.length > 90 ? '${flat.substring(0, 90)}…' : flat;
}

/// One topic's chats on their own page (opened from the topic chips of a new chat).
class TopicScreen extends StatelessWidget {
  const TopicScreen({super.key, required this.topic, required this.chats, required this.onOpen});
  final String topic;
  final List<Json> chats;
  final void Function(int id) onOpen;
  @override
  Widget build(BuildContext context) => Screen(
    title: '${_topicIcons[topic] ?? ''}  ${t('aichat.topics.$topic')}',
    subtitle: t('app.chatsN', [chats.length]),
    color: context.course(topics.all.indexOf(topic)),
    refresh: false,
    children: [
      if (chats.isEmpty) Box(children: [Muted(t('app.noTopicChats'))]),
      if (chats.isNotEmpty)
        Box(
          flush: true,
          children: [
            Paged(
              items: chats,
              row: (x) => Item(
                icon: Icons.chat_bubble_outline_rounded,
                color: context.course(topics.all.indexOf(topic)),
                title: '${x['title']}',
                subtitle: _snippet('${rows(x['msgs']).lastOrNull?['content'] ?? ''}'),
                onTap: () {
                  Navigator.pop(context);
                  onOpen(x['id'] as int);
                },
              ),
            ),
          ],
        ),
    ],
  );
}

/// Pack prices (৳ a month), as the server has them (checked in test/views_test.dart).
const packs = [150, 400, 800, 1500];

/// The model's light formatting: fenced code, headings, lists and **bold**; everything else as written.
List<Widget> rich(BuildContext context, String text) {
  final c = context.colors, base = context.type.bodyMedium!;
  TextSpan inline(String line) => TextSpan(
    children: [
      for (final part in line.splitMapJoin(RegExp(r'\*\*[^*]+\*\*|`[^`]+`'), onMatch: (m) => '\u0000${m[0]}\u0000', onNonMatch: (s) => s).split('\u0000'))
        if (part.startsWith('**') && part.length > 4)
          TextSpan(
            text: part.substring(2, part.length - 2),
            style: const TextStyle(fontWeight: FontWeight.w700),
          )
        else if (part.startsWith('`') && part.length > 2)
          TextSpan(
            text: part.substring(1, part.length - 1),
            style: TextStyle(fontFamily: 'monospace', backgroundColor: c.surfaceContainerHighest),
          )
        else
          TextSpan(text: part),
    ],
  );
  final out = <Widget>[];
  final blocks = text.split(RegExp(r'```\w*\n?'));
  for (var i = 0; i < blocks.length; i++) {
    if (i.isOdd) {
      out.add(
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: const Color(0xFF0C2A1D), borderRadius: BorderRadius.circular(10)),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SelectableText(
              blocks[i].trimRight(),
              textDirection: TextDirection.ltr,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 13, color: Colors.white),
            ),
          ),
        ),
      );
      continue;
    }
    for (final line in blocks[i].split('\n')) {
      final h = RegExp(r'^#{1,4}\s+(.*)').firstMatch(line), li = RegExp(r'^\s*([-*•]|\d+[.)])\s+(.*)').firstMatch(line);
      if (h != null) {
        out.add(SelectableText.rich(inline(h[1]!), style: base.copyWith(fontWeight: FontWeight.w700)));
      } else if (li != null) {
        out.add(
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 6,
            children: [
              Text(RegExp(r'^\d').hasMatch(li[1]!) ? li[1]! : '•', style: base),
              Expanded(child: SelectableText.rich(inline(li[2]!), style: base)),
            ],
          ),
        );
      } else if (line.trim().isNotEmpty) {
        out.add(SelectableText.rich(inline(line), style: base));
      }
    }
  }
  return out.isEmpty ? [const SizedBox.shrink()] : out;
}

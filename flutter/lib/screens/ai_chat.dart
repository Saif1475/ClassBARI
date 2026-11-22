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
import 'pdf.dart' show Bubble, clock;

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
  List<Json> chats = [];
  var openId = 0; // 0: a new chat not started yet
  List<Json> models = [];
  var model = '', access = 'loading'; // loading, ok, pack (no AI pack), soon (not set up), offline
  ({Uint8List bytes, String data})? photo;
  var busy = false, note = '', find = '';
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
        model = '${d['pick'] ?? ''}';
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
                setState(() => model = '${m['id']}');
                Navigator.pop(context);
              },
            ),
        ],
      ),
    ),
  );

  Future<void> remove(Json c) async {
    if (!await confirm(context, t('aichat.deleteChat'), t('aichat.confirmDelete'), yes: t('aichat.deleteChat'))) return;
    if (openId == c['id']) openId = 0;
    save(chats.where((x) => x['id'] != c['id']).toList());
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final c = context.colors;
    final name = '${store.me?['name'] ?? ''}'.split(' ').first;
    final list = msgs;
    return Scaffold(
      appBar: AppBar(
        title: Text(t('aichat.title')),
        actions: [IconButton(tooltip: t('aichat.newChat'), icon: const Icon(Icons.add_comment_outlined), onPressed: busy ? null : () => open(0))],
      ),
      drawer: Drawer(child: SafeArea(child: _side(context))),
      body: SafeArea(
        child: access == 'loading'
            ? const Center(child: CircularProgressIndicator())
            : access == 'pack' && list.isEmpty
            ? _locked(context)
            : Column(
                children: [
                  Expanded(
                    child: ListView(
                      controller: scroll,
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                      children: [
                        if (list.isEmpty) ...[
                          const SizedBox(height: 24),
                          H1(t('aichat.hello', [name])),
                          const SizedBox(height: 12),
                          for (final idea in lang.list('aichat.ideas'))
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Box(
                                onTap: busy || access != 'ok' ? null : () => ask(idea, const []),
                                children: [
                                  Row(
                                    spacing: 10,
                                    children: [
                                      Icon(Icons.lightbulb_outline, color: c.tertiary),
                                      Expanded(child: Text(idea)),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          Muted(t('aichat.saved')),
                        ],
                        for (final (i, m) in list.indexed)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: m['role'] == 'user' ? Bubble(text: '${m['photo'] == true ? '${t('aichat.photo')}\n' : ''}${m['content']}', mine: true) : _answer(context, '${m['content']}', i, last: i == list.length - 1),
                          ),
                        if (busy && (list.isEmpty || list.last['role'] == 'user')) Muted(t('aichat.thinking')),
                        if (note.isNotEmpty) Semantics(liveRegion: true, child: Muted(note)),
                      ],
                    ),
                  ),
                  _composer(context),
                ],
              ),
      ),
    );
  });

  /// One answer in its own rounded box, with Copy and (under the last one) Try again.
  Widget _answer(BuildContext context, String text, int i, {required bool last}) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Box(children: rich(context, text)),
      if (!busy || !last)
        Wrap(
          children: [
            TextButton.icon(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: text));
                setState(() => copied = i);
                Timer(const Duration(milliseconds: 1500), () => mounted ? setState(() => copied = -1) : null);
              },
              icon: Icon(copied == i ? Icons.check : Icons.copy, size: 18),
              label: Text(t(copied == i ? 'aichat.copied' : 'aichat.copy')),
            ),
            if (last && access == 'ok') TextButton.icon(onPressed: retry, icon: const Icon(Icons.refresh, size: 18), label: Text(t('aichat.retry'))),
          ],
        ),
    ],
  );

  Widget _composer(BuildContext context) {
    final c = context.colors;
    final can = access == 'ok';
    return Material(
      color: c.surfaceContainerLowest,
      elevation: 8,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          spacing: 4,
          children: [
            if (photo != null)
              Align(
                alignment: Alignment.centerLeft,
                child: Stack(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(6),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.memory(photo!.bytes, width: 72, height: 72, fit: BoxFit.cover, semanticLabel: t('aichat.photo')),
                      ),
                    ),
                    Positioned(
                      right: -8,
                      top: -8,
                      child: IconButton(tooltip: t('aichat.removePhoto'), icon: const Icon(Icons.cancel), onPressed: () => setState(() => photo = null)),
                    ),
                  ],
                ),
              ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                IconButton(tooltip: t('aichat.attach'), icon: const Icon(Icons.add_photo_alternate_outlined), onPressed: can && !busy ? attach : null),
                Expanded(
                  child: Semantics(
                    container: true,
                    child: TextField(
                      controller: q,
                      enabled: can,
                      minLines: 1,
                      maxLines: 5,
                      maxLength: 1000,
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(hintText: t('aichat.placeholder'), counterText: '', fillColor: c.surface),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                busy
                    ? IconButton.filled(tooltip: t('aichat.stop'), icon: const Icon(Icons.stop), onPressed: stop)
                    : IconButton.filled(tooltip: t('aichat.send'), icon: const Icon(Icons.arrow_upward), onPressed: can && q.text.trim().isNotEmpty ? send : null),
              ],
            ),
            Row(
              children: [
                if (models.isNotEmpty)
                  TextButton.icon(
                    onPressed: busy ? null : pickModel,
                    icon: const Icon(Icons.memory, size: 18),
                    label: Text('${chosen?['label'] ?? t('aichat.model')}'),
                    style: TextButton.styleFrom(minimumSize: const Size(48, 36)),
                  ),
                Expanded(
                  child: Text(
                    access == 'soon' || (access == 'ok' && chosen == null) /* no AI key set up on the server yet */ ? t('aichat.soon') : (access == 'offline' ? t('aichat.error') : t('aichat.disclaimer')),
                    textAlign: TextAlign.end,
                    style: TextStyle(fontSize: 11, color: c.onSurfaceVariant),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// No AI pack yet: what the packs are, and who to ask.
  Widget _locked(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      Icon(Icons.lock_outline, size: 44, color: context.colors.tertiary),
      const SizedBox(height: 12),
      H1(t('aichat.lockedTitle')),
      const SizedBox(height: 8),
      Text(t('aichat.lockedBody')),
      const SizedBox(height: 16),
      Box(
        title: t('aichat.packLabel'),
        children: [
          for (final (i, p) in packs.indexed)
            Line(
              first: i == 0,
              child: Row(
                spacing: 12,
                children: [
                  Strong('${taka(p)}${t('aichat.perMonth')}', color: context.colors.primary),
                  Expanded(child: Text(t('aichat.packNote.$p'))),
                ],
              ),
            ),
        ],
      ),
    ],
  );

  /// The side panel: chats in topic folders, with a search box; language and log out at the bottom.
  Widget _side(BuildContext context) {
    final needle = find.trim().toLowerCase();
    final shown = chats.where((c) => needle.isEmpty || '${c['title']}'.toLowerCase().contains(needle) || rows(c['msgs']).any((m) => '${m['content']}'.toLowerCase().contains(needle))).toList();
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            spacing: 10,
            children: [
              Doing(
                label: t('aichat.newChat'),
                icon: Icons.add,
                onPressed: () async {
                  Navigator.pop(context);
                  open(0);
                },
              ),
              Semantics(
                container: true,
                child: TextField(
                  onChanged: (v) => setState(() => find = v),
                  decoration: InputDecoration(labelText: t('aichat.searchChats'), prefixIcon: const Icon(Icons.search), isDense: true),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView(
            children: [
              if (chats.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Muted(t('aichat.noChats'))),
              if (chats.isNotEmpty && shown.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Muted(t('aichat.noMatch'))),
              for (final topic in topics.all)
                if (shown.any((c) => (c['topic'] ?? 'other') == topic)) ...[
                  Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 4), child: Strong('${_topicIcons[topic]}  ${t('aichat.topics.$topic')}')),
                  for (final c in shown.where((c) => (c['topic'] ?? 'other') == topic))
                    ListTile(
                      dense: true,
                      selected: c['id'] == openId,
                      title: Text('${c['title']}', maxLines: 1, overflow: TextOverflow.ellipsis),
                      trailing: IconButton(tooltip: t('aichat.deleteChat'), icon: const Icon(Icons.delete_outline), onPressed: () => remove(c)),
                      onTap: busy
                          ? null
                          : () {
                              Navigator.pop(context);
                              open(c['id'] as int);
                            },
                    ),
                ],
            ],
          ),
        ),
        const Divider(),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 8,
            children: [
              Muted('${store.me?['name'] ?? ''} · ${store.email ?? ''}'),
              Chips(value: lang.code, options: const ['en', 'bn'], labels: const {'en': 'English', 'bn': 'বাংলা'}, onChanged: store.setLang),
              Doing(label: t('app.logOut'), icon: Icons.logout, soft: true, onPressed: store.signOut),
            ],
          ),
        ),
      ],
    );
  }
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

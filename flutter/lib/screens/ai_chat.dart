// The ClassBARI AI app: the student's AI chat (their AI pack decides the models and the allowance).
// Chats are kept on this phone only; answers arrive piece by piece from /api/ai/assistant, as on the website.
import 'dart:async';
import 'dart:convert';
import 'dart:io' show ZLibDecoder;
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
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
import 'pay.dart';
import 'settings.dart';
import '../icon.dart';
import '../icons.g.dart';

const _trailer = '\u001e'; // ends the streamed answer; after it comes JSON: allowance left, declined, cut, error
const _keep = 50; // chats kept on the phone (the most recently used)
/// The server calls this screen makes (tests put stand-ins here).
var aiApi = api;
var aiStream = apiStream;
var aiPdf = apiPdf;

/// The Tools menu: Create PDF and Highlight (both may be on; each chat remembers its own).
const toolKeys = ['pdf', 'highlight'];

/// A PDF sent to be highlighted: HIGHLIGHT_MAX_BYTES in src/lib/chat-tools.ts.
const highlightMaxBytes = 8 * 1024 * 1024;
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
  num? left; // % of today's allowance left, and when it refills (shown in Settings)
  String? resetsAt;
  num? credit; // extra credit left (৳), and the student's own credit history (shown in Settings)
  List<Json> creditLog = [];
  var limitHit = false; // today's limit reached with no credit: offer to buy some

  /// The model picked last time (kept in Settings); until then the one the server suggests.
  String get model => store.aiModel ?? pick;
  ({Uint8List bytes, String data})? photo;
  Json? doc; // the file attached to the open chat: {name, text}; its text goes with every question
  var reading = false;
  Json tools = {}; // the open chat's tools: {'pdf': true, 'highlight': true}
  ({Uint8List bytes, String name})? pdfFile; // a PDF picked with Highlight on: sent to be highlighted
  final made = <int, Uint8List>{}; // highlighted PDFs made while the app is open, by their message's 'at'
  var highlighting = false;
  var busy = false, note = '', find = '';
  int? pack; // the student's AI pack, for the side panel
  final unfolded = <String>{}; // topic folders opened in the side panel
  var copied = -1;
  http.Client? stream;
  int get meId => store.me?['id'] as int? ?? 0;
  String get storeKey => 'classbari-ai-chats-$meId';
  Json? get chat => chats.where((c) => c['id'] == openId).firstOrNull;
  var pdfBusy = false;

  /// The whole chat (or, with Create PDF, one answer `at` and its question) as a PDF, made by the server (the same file
  /// the website gives) and saved where the student picks.
  Future<void> downloadPdf([int at = -1]) async {
    final c = chat;
    if (c == null || pdfBusy) return;
    setState(() => pdfBusy = true);
    final turns = at < 0 ? msgs : msgs.sublist(at > 0 ? at - 1 : 0, at + 1);
    final heading = at < 0 ? null : RegExp(r'^#\s+(.+)', multiLine: true).firstMatch('${msgs[at]['content']}')?[1]?.replaceAll(RegExp(r'[*=`]'), '').trim();
    final title = at < 0 ? '${c['title'] ?? ''}' : (heading == null || heading.isEmpty ? '${turns.first['content']}' : heading);
    try {
      final res = await aiApi(
        '/api/ai/pdf',
        body: {
          'title': title.length > 120 ? title.substring(0, 120) : title,
          'lang': lang.code,
          'messages': [
            for (final m in turns) {'role': m['role'], 'content': '${m['content'] ?? ''}', if (m['photo'] == true) 'photo': true},
          ],
        },
      );
      if (res.statusCode != 200) throw Exception();
      await savePdf(title, res.bodyBytes);
    } catch (_) {
      if (mounted) toast(context, t('aichat.pdfFailed'));
    }
    if (mounted) setState(() => pdfBusy = false);
  }

  Future<void> savePdf(String title, Uint8List bytes) async {
    final name = title.replaceAll(RegExp(r'[\\/:*?"<>|\n]'), '').trim();
    await FilePicker.saveFile(fileName: '${name.isEmpty ? 'chat' : (name.length > 60 ? name.substring(0, 60) : name)}.pdf', bytes: bytes, mimeType: 'application/pdf');
  }

  /// A tool on or off; an open chat remembers it on this phone (in the chat's Json).
  void toggleTool(String k) {
    final next = {...tools};
    if (next.remove(k) == null) next[k] = true;
    setState(() => tools = next);
    if (chat == null) return;
    save([
      for (final c in chats) c['id'] == openId ? {...c, 'tools': next} : c,
    ]);
  }

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
      final res = await aiApi('/api/ai/assistant');
      if (res.statusCode == 200) {
        final d = jsonDecode(res.body) as Json;
        models = rows(d['models']);
        pack = (d['pack'] as num?)?.toInt();
        pick = '${d['pick'] ?? ''}';
        left = d['left'] as num?;
        resetsAt = d['resetsAt'] as String?;
        credit = d['credit'] as num?;
        creditLog = rows(d['creditLog']);
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
    doc = chats.where((c) => c['id'] == id).firstOrNull?['file'] as Json?;
    tools = {...?chats.where((c) => c['id'] == id).firstOrNull?['tools'] as Json?};
    pdfFile = null;
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
    final topic = old != null && old['topic'] != null && old['topic'] != 'other' ? old['topic'] : topics.of('$question ${doc?['name'] ?? ''}');
    final file = doc;
    var list = <Json>[
      {...?old, 'id': id, 'title': old?['title'] ?? (question.length > 60 ? question.substring(0, 60) : question), 'msgs': asked, 'file': file, 'topic': topic, 'at': DateTime.now().millisecondsSinceEpoch, 'tools': tools}
        ..removeWhere((k, v) => k == 'file' && v == null),
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
      final tools = this.tools;
      final res = await aiStream(client, '/api/ai/assistant', {
        'messages': [
          for (final m in asked.length > 10 ? asked.sublist(asked.length - 10) : asked) {'role': m['role'], 'content': m['content']},
        ],
        if (image.isNotEmpty) 'image': image,
        'file': ?file,
        if (chosen != null) 'model': chosen!['id'],
        if (fresh) 'fresh': true,
        if (store.aiPrefs.isNotEmpty) 'prefs': store.aiPrefs, // answer language and length from Settings
        if (tools.isNotEmpty) 'tools': tools, // Create PDF / Highlight
      });
      if (res.statusCode != 200) {
        Json d = const {};
        try {
          d = jsonDecode(await res.stream.bytesToString()) as Json;
        } catch (_) {
          // not JSON: the plain error line
        }
        limitHit = res.statusCode == 429;
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
        {
          'role': 'assistant',
          'content': info['declined'] == true ? t('aichat.declined') : '${text.isEmpty ? t('aichat.error') : text}${info['cut'] == true ? '\n\n${t('aichat.cut')}' : ''}',
          if (tools['pdf'] == true && info['declined'] != true && info['error'] != true && text.isNotEmpty) 'pdf': true, // the Download PDF card
        },
      ]);
      if (info['left'] is num) left = info['left'] as num;
      if (info['credit'] is num) credit = info['credit'] as num;
      note = info['error'] == true ? t('aichat.error') : (info['credit'] is num ? t('aichat.creditLeft', [taka(info['credit'] as num)]) : (info['left'] is num ? t('aichat.left', [info['left']]) : ''));
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
    final text = q.text.trim(), file = pdfFile;
    if (busy) return;
    if (tools['highlight'] == true && file != null) {
      highlight(text.isEmpty ? t('aichat.highlightAsk', [file.name]) : text, file);
    } else if (text.isNotEmpty) {
      ask(text, msgs, image: photo?.data ?? '');
    }
  }

  /// Highlight with a PDF picked: the PDF goes to the server and comes back highlighted, as a card to save.
  Future<void> highlight(String question, ({Uint8List bytes, String name}) file) async {
    final id = openId == 0 ? DateTime.now().millisecondsSinceEpoch : openId, before = msgs;
    final asked = <Json>[
      ...before,
      {'role': 'user', 'content': question},
    ];
    final old = chats.where((c) => c['id'] == id).firstOrNull;
    final topic = old != null && old['topic'] != null && old['topic'] != 'other' ? old['topic'] : topics.of('$question ${file.name}');
    var list = <Json>[
      {...?old, 'id': id, 'title': old?['title'] ?? (question.length > 60 ? question.substring(0, 60) : question), 'msgs': asked, 'topic': topic, 'at': DateTime.now().millisecondsSinceEpoch, 'tools': tools},
      ...chats.where((c) => c['id'] != id),
    ];
    void put(List<Json> m) => mounted
        ? save(
            list = [
              for (final c in list) c['id'] == id ? {...c, 'msgs': m} : c,
            ],
          )
        : null;
    save(list);
    setState(() {
      openId = id;
      q.clear();
      note = '';
      pdfFile = null;
      busy = highlighting = true;
    });
    try {
      final res = await aiPdf('/api/ai/highlight', file.bytes);
      if (res.statusCode != 200) {
        Json d = const {};
        try {
          d = jsonDecode(res.body) as Json;
        } catch (_) {
          // not JSON
        }
        limitHit = res.statusCode == 429;
        throw res.statusCode == 429 && d['resetsAt'] != null
            ? t('aichat.limit', [clock(d['resetsAt'])])
            : (d['error'] == 'paused' ? t('aichat.paused') : (res.statusCode == 404 ? t('aichat.soon') : (res.statusCode == 413 ? t('aichat.highlightTooBig') : t('aichat.highlightFailed'))));
      }
      final at = DateTime.now().millisecondsSinceEpoch;
      made[at] = res.bodyBytes;
      put([
        ...asked,
        {
          'role': 'assistant',
          'content': t('aichat.highlightDone', [file.name, int.tryParse(res.headers['x-highlights'] ?? '') ?? 0]),
          'hl': {'name': file.name, 'at': at},
        },
      ]);
      final l = num.tryParse(res.headers['x-left'] ?? '');
      if (l != null) {
        left = l;
        note = t('aichat.left', [l]);
      }
      final paid = num.tryParse(res.headers['x-credit'] ?? '');
      if (paid != null) {
        credit = paid;
        note = t('aichat.creditLeft', [taka(paid)]);
      }
    } catch (e) {
      // Nothing came back: the question out again, the PDF back in the box.
      if (mounted) {
        if (before.isNotEmpty) {
          put(before);
        } else {
          save(list = list.where((c) => c['id'] != id).toList());
          openId = 0;
        }
        q.text = question == t('aichat.highlightAsk', [file.name]) ? '' : question;
        pdfFile = file;
        note = e is String ? e : t('aichat.highlightFailed');
      }
    } finally {
      if (mounted) setState(() => busy = highlighting = false);
    }
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
    final pick = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(leading: Ico(I.camera), title: Text(t('app.takePhoto')), onTap: () => Navigator.pop(context, 'camera')),
            ListTile(leading: Ico(I.image), title: Text(t('app.choosePhoto')), subtitle: Text(t('aichat.fileKinds.image.hint')), onTap: () => Navigator.pop(context, 'image')),
            for (final k in fileKinds.keys) ListTile(leading: Ico(I.file), title: Text(t('aichat.fileKinds.$k.label')), subtitle: Text(t('aichat.fileKinds.$k.hint')), onTap: () => Navigator.pop(context, k)),
          ],
        ),
      ),
    );
    if (pick == null || !mounted) return;
    if (fileKinds.containsKey(pick)) return pickFile(pick);
    final p = await pickPhoto(context, camera: pick == 'camera');
    if (p != null && mounted) setState(() => photo = (bytes: p.bytes, data: p.data));
  }

  /// A Word, Excel, CSV or text file is read here on the phone and its text goes with the chat, as on the website.
  /// A PDF only goes with Highlight on (to be highlighted on the server).
  /// shortcut: a PDF's text is not read in the app (the website reads it with pdf.js; no server route reads text).
  Future<void> pickFile(String kind) async {
    final f = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: fileKinds[kind]!).catchError((_) => null);
    if (f == null || !mounted) return;
    if (f.name.toLowerCase().endsWith('.pdf')) {
      if (tools['highlight'] != true) return setState(() => note = t('aichat.pdfNeedsHighlight'));
      final bytes = await f.readAsBytes();
      if (!mounted) return;
      return setState(() {
        note = bytes.length > highlightMaxBytes ? t('aichat.highlightTooBig') : '';
        pdfFile = bytes.length > highlightMaxBytes ? null : (bytes: bytes, name: f.name.length > 120 ? f.name.substring(0, 120) : f.name);
      });
    }
    setState(() {
      note = '';
      reading = true;
    });
    try {
      final text = fileText(f.name, await f.readAsBytes());
      if (text == null) return setState(() => note = t('aichat.fileType'));
      if (text.isEmpty) return setState(() => note = t('aichat.fileEmpty'));
      setState(() {
        doc = {'name': f.name.length > 120 ? f.name.substring(0, 120) : f.name, 'text': text.length > fileTextMax ? text.substring(0, fileTextMax) : text};
        if (text.length > fileTextMax) note = t('aichat.fileCut');
      });
    } catch (_) {
      if (mounted) setState(() => note = t('aichat.fileFailed'));
    } finally {
      if (mounted) setState(() => reading = false);
    }
  }

  /// The Tools menu (as Gemini's): Create PDF and Highlight, each a switch; both may be on.
  void pickTools() => showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true, // big letters on a small phone: the sheet grows, then scrolls
    builder: (context) => StatefulBuilder(
      builder: (context, redraw) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), child: H2(t('aichat.tools'))),
            for (final k in toolKeys)
              SwitchListTile(
                secondary: Ico(k == 'pdf' ? I.file : I.editNote),
                title: Text(t(k == 'pdf' ? 'aichat.toolPdf' : 'aichat.toolHighlight')),
                subtitle: Text(t(k == 'pdf' ? 'aichat.toolPdfHint' : 'aichat.toolHighlightHint')),
                value: tools[k] == true,
                onChanged: (_) {
                  toggleTool(k);
                  redraw(() {});
                },
              ),
          ],
        ),
      ),
    ),
  );

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
              leading: Ico(m['locked'] == true ? I.lock : (m['id'] == chosen?['id'] ? I.radioOn : I.radioOff)),
              title: Text('${m['label']}'),
              subtitle: Text(m['locked'] == true ? t('aichat.unlockWith', [taka(m['pack'] as num)]) : (m['soon'] == true ? t('aichat.modelSoon') : (m['pack'] == 0 ? t('aichat.free') : t('aichat.inPack', [taka(m['pack'] as num)])))),
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
                  IconButton(tooltip: t('aichat.chats'), icon: Ico(I.menu), onPressed: () => frame.currentState?.openDrawer()),
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
                                      Ico(I.chevronDown, color: c.onSurfaceVariant),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                    ),
                  ),
                  IconButton(tooltip: t('aichat.newChat'), icon: Ico(I.edit), onPressed: busy ? null : () => open(0)),
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
                          child: m['role'] == 'user' ? _mine(context, '${m['content']}', m['photo'] == true) : _answer(context, m, i, last: i == list.length - 1),
                        ),
                      if (busy && (list.isEmpty || list.last['role'] == 'user')) Muted(t(highlighting ? 'aichat.highlighting' : 'aichat.thinking')),
                      if (note.isNotEmpty) Semantics(liveRegion: true, child: Muted(note)),
                      if (limitHit)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Doing(
                            label: t('aichat.buyCredit'),
                            small: true,
                            onPressed: () async => push(
                              context,
                              Screen(
                                title: t('pay.buyCredit'),
                                children: const [PayForm(kind: 'ai_credit')],
                              ),
                            ),
                          ),
                        ),
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
        children: [for (final idea in lang.list('aichat.ideas')) Item(icon: I.idea, color: context.colors.tertiary, title: idea, onTap: busy || access != 'ok' ? null : () => ask(idea, const []))],
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

  /// One answer: written straight on the page, with small Copy and Try again buttons under it, and the PDF card when a
  /// tool made one (Create PDF: this answer; Highlight: the student's PDF, highlighted).
  Widget _answer(BuildContext context, Json m, int i, {required bool last}) {
    final text = '${m['content']}', hl = m['hl'] as Map?, ready = hl != null && made.containsKey(hl['at']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 6,
      children: [
        ...rich(context, text),
        if ((m['pdf'] == true || hl != null) && (!busy || !last))
          Container(
            padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
            decoration: BoxDecoration(
              color: context.colors.primaryContainer,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: context.colors.primary),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 10,
              children: [
                Ico(hl != null ? I.editNote : I.file, color: context.colors.onPrimaryContainer),
                Expanded(
                  // The button under the words: "Download highlighted PDF" doesn't fit beside them on a small phone.
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 2,
                    children: [
                      Text(t(hl != null ? 'aichat.highlightReady' : 'aichat.pdfReady'), style: context.type.titleSmall?.copyWith(color: context.colors.onPrimaryContainer)),
                      Text(
                        hl != null ? (ready ? '${hl['name']}' : t('aichat.highlightGone')) : t('aichat.pdfReadyHint'),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: context.type.bodySmall?.copyWith(color: context.colors.onPrimaryContainer),
                      ),
                      const SizedBox(height: 6),
                      if (m['pdf'] == true) FilledButton(onPressed: pdfBusy ? null : () => downloadPdf(i), child: Text(t(pdfBusy ? 'aichat.pdfMaking' : 'aichat.pdfCard'))),
                      if (ready)
                        FilledButton(
                          onPressed: () async {
                            try {
                              await savePdf('${'${hl['name']}'.replaceAll(RegExp(r'\.pdf$', caseSensitive: false), '')}-highlighted', made[hl['at']]!);
                            } catch (_) {
                              if (context.mounted) toast(context, t('aichat.highlightFailed'));
                            }
                          },
                          child: Text(t('aichat.downloadHighlighted')),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        if (!busy || !last)
          Row(
            children: [
              IconButton(
                tooltip: t(copied == i ? 'aichat.copied' : 'aichat.copy'),
                icon: Ico(copied == i ? I.check : I.copy, size: 20),
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: text));
                  setState(() => copied = i);
                  Timer(const Duration(milliseconds: 1500), () => mounted ? setState(() => copied = -1) : null);
                },
              ),
              if (last && access == 'ok') IconButton(tooltip: t('aichat.retry'), icon: Ico(I.refresh, size: 20), onPressed: retry),
              if (last)
                IconButton(
                  tooltip: t(pdfBusy ? 'aichat.pdfMaking' : 'aichat.downloadPdf'),
                  icon: pdfBusy ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Ico(I.file, size: 20),
                  onPressed: pdfBusy ? null : downloadPdf,
                ),
            ],
          ),
      ],
    );
  }

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
                if (tools.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 6, 8, 0),
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final k in toolKeys)
                          if (tools[k] == true)
                            InputChip(
                              avatar: Ico(k == 'pdf' ? I.file : I.editNote, size: 18),
                              label: Text(t(k == 'pdf' ? 'aichat.toolPdf' : 'aichat.toolHighlight')),
                              deleteButtonTooltipMessage: t('aichat.removeTool', [t(k == 'pdf' ? 'aichat.toolPdf' : 'aichat.toolHighlight')]),
                              onDeleted: busy ? null : () => toggleTool(k),
                            ),
                      ],
                    ),
                  ),
                if (pdfFile != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 6, 0, 0),
                    child: Row(
                      spacing: 4,
                      children: [
                        Flexible(
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(color: context.tone.tile, borderRadius: BorderRadius.circular(10)),
                            child: Text(
                              '📕 ${pdfFile!.name}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ),
                        ),
                        TextButton(
                          onPressed: () => setState(() => pdfFile = null),
                          child: Text(t('aichat.removeFile'), style: TextStyle(color: c.error)),
                        ),
                      ],
                    ),
                  ),
                if (pdfFile != null && tools['highlight'] == true) Padding(padding: const EdgeInsets.fromLTRB(12, 4, 12, 0), child: Muted(t('aichat.highlightWillSend'))),
                if (doc != null || reading)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 6, 0, 0),
                    child: Row(
                      spacing: 4,
                      children: [
                        Flexible(
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(color: context.tone.tile, borderRadius: BorderRadius.circular(10)),
                            child: Text(
                              '📄 ${reading ? t('aichat.fileReading') : doc!['name']}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ),
                        ),
                        if (doc != null)
                          TextButton(
                            onPressed: () => setState(() => doc = null),
                            child: Text(t('aichat.removeFile'), style: TextStyle(color: c.error)),
                          ),
                      ],
                    ),
                  ),
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
                          child: IconButton(tooltip: t('aichat.removePhoto'), icon: Ico(I.cancelCircle), onPressed: () => setState(() => photo = null)),
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
                    IconButton(tooltip: t('aichat.attach'), icon: Ico(I.plus), onPressed: can && !busy ? attach : null),
                    IconButton(tooltip: t('aichat.tools'), icon: Ico(I.tool), onPressed: can && !busy ? pickTools : null),
                    const Spacer(),
                    busy
                        ? IconButton.filled(tooltip: t('aichat.stop'), icon: Ico(I.stop), onPressed: highlighting ? null : stop)
                        : IconButton.filled(tooltip: t('aichat.send'), icon: Ico(I.arrowUp), onPressed: can && (q.text.trim().isNotEmpty || (tools['highlight'] == true && pdfFile != null)) ? send : null),
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
      Ico(I.lock, size: 44, color: context.colors.tertiary),
      const SizedBox(height: 12),
      Text(t('aichat.lockedTitle'), textAlign: TextAlign.center, style: context.type.headlineSmall),
      const SizedBox(height: 8),
      Text(t('aichat.lockedBody'), textAlign: TextAlign.center),
      const SizedBox(height: 16),
      Group(
        title: t('aichat.packLabel'),
        children: [for (final p in packs) Item(icon: I.sparkle, title: '${taka(p)}${t('aichat.perMonth')}', subtitle: t('aichat.packNote.$p'))],
      ),
      const SizedBox(height: 16),
      const PayForm(),
    ],
  );

  /// The side panel. Its special part: every chat is filed under its topic by itself, so a student finds "that
  /// physics question from last week" in the Physics folder. Below the folders, the latest chats; a search box on top.
  Widget _side(BuildContext context) {
    final needle = find.trim().toLowerCase();
    final shown = chats
        .where(
          (x) => needle.isEmpty || '${x['title']}'.toLowerCase().contains(needle) || rows(x['msgs']).any((m) => '${m['content']}'.toLowerCase().contains(needle)) || '${(x['file'] as Map?)?['name'] ?? ''}'.toLowerCase().contains(needle),
        )
        .toList();
    Widget chatRow(Json x, {bool withTopic = false}) => Item(
      title: '${x['title']}',
      subtitle: withTopic ? '${_topicIcons[x['topic'] ?? 'other']}  ${t('aichat.topics.${x['topic'] ?? 'other'}')}' : null,
      trailing: IconButton(tooltip: t('aichat.deleteChat'), icon: Ico(I.trash, size: 20), onPressed: () => remove(x)),
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
                icon: I.plus,
                onPressed: () async {
                  Navigator.pop(context);
                  open(0);
                },
              ),
              Semantics(
                container: true,
                child: TextField(
                  onChanged: (v) => setState(() => find = v),
                  decoration: InputDecoration(labelText: t('aichat.searchChats'), prefixIcon: Ico(I.search), isDense: true, fillColor: context.colors.surface),
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
                              Ico(unfolded.contains(topic) ? I.chevronUp : I.chevronDown, color: context.colors.onSurfaceVariant),
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
                    Muted(pack == null ? (store.email ?? '') : (pack == 0 ? t('aichat.freePlan') : '${t('aichat.packLabel')} · ${taka(pack!)}${t('aichat.perMonth')}'), lines: 1),
                  ],
                ),
              ),
              IconButton(tooltip: t('settings.title'), icon: Ico(I.settings), onPressed: () => _settings(context)),
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
        ai: AiSettings(models: models, pack: pack, left: left, resetsAt: resetsAt, credit: credit, creditLog: creditLog, chats: () => chats.length, onDeleteAll: deleteAll),
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
                icon: I.message,
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

/// How much of an attached file's text goes with a chat: FILE_TEXT_MAX in src/lib/ai-chat.ts.
const fileTextMax = 30000;

/// The files the "Add file" menu offers, as the website's FILE_KINDS (a PDF only with Highlight: see pickFile).
const fileKinds = {
  'pdf': ['pdf'],
  'word': ['docx'],
  'sheet': ['xlsx', 'csv'],
  'text': ['txt', 'md', 'csv', 'json', 'html', 'xml', 'py', 'js', 'ts', 'c', 'cpp', 'java'],
};

/// A file's text, as the website reads it (src/lib/sheet.ts for Word and Excel); null for a kind it can't read.
String? fileText(String name, Uint8List bytes) {
  final ext = name.toLowerCase().split('.').last;
  final String text;
  if (ext == 'docx') {
    final xml = unzip(bytes, (n) => n == 'word/document.xml')['word/document.xml'];
    if (xml == null) throw const FormatException('not a Word file');
    text = [
      for (final p in xml.split('</w:p>')) [for (final m in RegExp(r'<w:t(?:\s[^>]*)?>([\s\S]*?)</w:t>|<w:(tab|br)/>').allMatches(p)) m[2] == 'tab' ? '\t' : (m[2] == 'br' ? '\n' : _unescape(m[1]!))].join(),
    ].join('\n');
  } else if (ext == 'xlsx') {
    text = [for (final r in readXlsx(bytes)) r.join('\t')].join('\n');
  } else if (fileKinds['text']!.contains(ext)) {
    text = utf8.decode(bytes, allowMalformed: true);
  } else {
    return null;
  }
  return text.replaceAll('\u0000', '').trim();
}

/// Files inside a zip, by name (src/lib/sheet.ts unzip): only the ones asked for are unpacked.
Map<String, String> unzip(Uint8List buf, bool Function(String name) want) {
  final v = ByteData.sublistView(buf);
  int u16(int at) => v.getUint16(at, Endian.little);
  int u32(int at) => v.getUint32(at, Endian.little);
  var eocd = buf.length - 22;
  while (eocd >= 0 && u32(eocd) != 0x06054b50) {
    eocd--;
  }
  if (eocd < 0) throw const FormatException('not a zip');
  final out = <String, String>{};
  var p = u32(eocd + 16);
  for (var i = 0, count = u16(eocd + 10); i < count; i++) {
    final method = u16(p + 10), size = u32(p + 20), nameLen = u16(p + 28), local = u32(p + 42);
    final name = utf8.decode(buf.sublist(p + 46, p + 46 + nameLen), allowMalformed: true);
    p += 46 + nameLen + u16(p + 30) + u16(p + 32);
    if (!want(name)) continue;
    final start = local + 30 + u16(local + 26) + u16(local + 28);
    final raw = buf.sublist(start, start + size);
    out[name] = utf8.decode(method == 8 ? ZLibDecoder(raw: true).convert(raw) : raw, allowMalformed: true);
  }
  return out;
}

String _unescape(String s) => s.replaceAllMapped(RegExp(r'&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);', caseSensitive: false), (m) {
  final e = m[1]!;
  if (e.startsWith('#')) return String.fromCharCode(e[1] == 'x' || e[1] == 'X' ? int.parse(e.substring(2), radix: 16) : int.parse(e.substring(1)));
  return const {'lt': '<', 'gt': '>', 'quot': '"', 'apos': "'", 'amp': '&'}[e.toLowerCase()]!;
});

String _texts(String xml) => [for (final m in RegExp(r'<t(?:\s[^>]*)?>([\s\S]*?)</t>').allMatches(xml)) _unescape(m[1]!)].join();

/// The first sheet of an Excel file as rows of text (src/lib/sheet.ts readXlsx).
List<List<String>> readXlsx(Uint8List bytes) {
  final files = unzip(bytes, (n) => n == 'xl/sharedStrings.xml' || n == 'xl/worksheets/sheet1.xml');
  final shared = [for (final m in RegExp(r'<si>([\s\S]*?)</si>').allMatches(files['xl/sharedStrings.xml'] ?? '')) _texts(m[1]!)];
  final sheet = files['xl/worksheets/sheet1.xml'];
  if (sheet == null) throw const FormatException('no sheet');
  return [
    for (final row in RegExp(r'<row[^>]*>([\s\S]*?)</row>').allMatches(sheet))
      () {
        final cells = <int, String>{};
        for (final c in RegExp(r'<c\s([^>]*?)(?:/>|>([\s\S]*?)</c>)').allMatches(row[1]!)) {
          final attrs = c[1]!, body = c[2] ?? '';
          final ref = RegExp(r'r="([A-Z]+)\d+"').firstMatch(attrs)?[1];
          final type = RegExp(r't="(\w+)"').firstMatch(attrs)?[1];
          final v = RegExp(r'<v>([\s\S]*?)</v>').firstMatch(body)?[1] ?? '';
          final value = type == 's' ? shared.elementAtOrNull(int.tryParse(v)?.abs() ?? shared.length) ?? '' : (type == 'inlineStr' ? _texts(body) : _unescape(v));
          cells[ref == null ? cells.length : ref.codeUnits.fold(0, (n, ch) => n * 26 + ch - 64) - 1] = value.trim();
        }
        final width = cells.isEmpty ? 0 : cells.keys.reduce((a, b) => a > b ? a : b) + 1;
        return [for (var i = 0; i < width; i++) cells[i] ?? ''];
      }(),
  ];
}

/// Pack prices (৳ a month), as the server has them (checked in test/views_test.dart).
const packs = [150, 400, 800, 1500];

/// The answer's inline marks: **bold**, ==highlight== and `code` (INLINE in src/lib/chat-tools.ts). ==x== only when it
/// hugs its words, so "a == b" in a sum is left alone.
final inlineMarks = RegExp(r'\*\*[^*]+\*\*|==[^=\s](?:(?:(?!==).)*?[^=\s])?==|`[^`]+`');

/// The highlighter colour for ==text==: pen yellow, darker in dark mode so the light words stay readable.
Color markColor(BuildContext context) => context.dark ? const Color(0xFF7A6200) : const Color(0xFFFFE066);

/// The model's light formatting: fenced code, headings, lists, **bold** and ==highlight==; everything else as written.
List<Widget> rich(BuildContext context, String text) {
  final c = context.colors, base = context.type.bodyMedium!;
  TextSpan inline(String line) {
    final parts = <TextSpan>[];
    line.splitMapJoin(
      inlineMarks,
      onMatch: (m) {
        final p = m[0]!;
        parts.add(
          p.startsWith('**')
              ? TextSpan(
                  text: p.substring(2, p.length - 2),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                )
              : p.startsWith('==')
              ? TextSpan(
                  text: p.substring(2, p.length - 2),
                  style: TextStyle(backgroundColor: markColor(context)),
                )
              : TextSpan(
                  text: p.substring(1, p.length - 1),
                  style: TextStyle(fontFamily: 'monospace', backgroundColor: c.surfaceContainerHighest),
                ),
        );
        return '';
      },
      onNonMatch: (s) {
        if (s.isNotEmpty) parts.add(TextSpan(text: s));
        return '';
      },
    );
    return TextSpan(children: parts);
  }

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

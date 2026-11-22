import 'dart:async';
import 'dart:convert';

import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../strings.dart';
import '../theme.dart';
import '../ui.dart';
import '../views.dart';

/// Premium: a PDF lesson's highlights, page by page, and "Ask AI" about it.
/// shortcut: highlights are listed, not drawn on the page; draw them when an in-app PDF viewer is added.
class PdfScreen extends StatefulWidget {
  const PdfScreen({super.key, required this.file, required this.title});
  final String file, title;
  @override
  State<PdfScreen> createState() => _PdfScreenState();
}

class _PdfScreenState extends State<PdfScreen> {
  var state = 'loading'; // loading, none, locked, preparing, failed, ready
  Json? data;
  var tab = 'highlights';
  Timer? again;

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    again?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    String next;
    try {
      final res = await api('/api/pdf-insights?file=${Uri.encodeQueryComponent(widget.file)}');
      if (const [401, 403, 404].contains(res.statusCode)) {
        next = 'none';
      } else if (res.statusCode == 402) {
        next = 'locked';
      } else {
        final d = jsonDecode(res.body) as Json;
        next = d['status'] == 'ready' ? 'ready' : (d['status'] == 'failed' ? 'failed' : 'preparing');
        if (next == 'ready') data = d;
      }
    } catch (_) {
      next = 'none';
    }
    if (!mounted) return;
    setState(() => state = next);
    // Reading a new PDF takes a little while; the basic highlights show at once and the AI's replace them.
    if (next == 'preparing' || (next == 'ready' && data?['improving'] == true)) again = Timer(const Duration(seconds: 5), load);
  }

  @override
  Widget build(BuildContext context) => Live(
    (context) => Screen(
      title: widget.title,
      refresh: false,
      children: [
        Doing(label: t('app.open'), icon: Icons.open_in_new, soft: true, onPressed: () => openLink(context, widget.file)),
        if (state == 'loading') const Center(child: CircularProgressIndicator()),
        if (state == 'none' || state == 'failed') Muted(t('pdfhl.failed')),
        if (state == 'locked') Box(color: context.colors.tertiaryContainer, children: [Strong(t('pdfhl.locked'))]),
        if (state == 'preparing')
          Row(
            spacing: 12,
            children: [
              const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.5)),
              Expanded(child: Muted(t('pdfhl.preparing'))),
            ],
          ),
        if (state == 'ready') ...[
          Chips(value: tab, options: const ['highlights', 'chat'], labels: {'highlights': t('pdfhl.list'), 'chat': t('pdfhl.ask')}, onChanged: (v) => setState(() => tab = v)),
          if (tab == 'highlights') Highlights(file: widget.file, data: data!) else AskAi(file: widget.file),
        ],
      ],
    ),
  );
}

class Highlights extends StatefulWidget {
  const Highlights({super.key, required this.file, required this.data});
  final String file;
  final Json data;
  @override
  State<Highlights> createState() => _HighlightsState();
}

class _HighlightsState extends State<Highlights> {
  late final list = [
    for (final h in rows(widget.data['highlights'])) {...h},
  ];

  /// Teachers hide a highlight that is wrong; students then don't see it.
  Future<void> toggle(Json h) async {
    final hide = h['hidden'] != true;
    try {
      final res = await api('/api/pdf-insights', body: {'file': widget.file, 'index': h['i'], 'hidden': hide});
      if (res.statusCode == 200 && mounted) setState(() => h['hidden'] = hide);
    } catch (_) {
      // offline: nothing changed
    }
  }

  @override
  Widget build(BuildContext context) {
    final canEdit = widget.data['canEdit'] == true;
    final pages = {for (final h in list) h['page'] as int}.toList()..sort();
    const ink = Color(0xFF171D19); // dark text on the highlight colours, in both themes
    Widget tag(String type) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: highlightColors[type], borderRadius: BorderRadius.circular(6)),
      child: Text(
        t('pdfhl.types.$type'),
        style: const TextStyle(color: ink, fontSize: 12, fontWeight: FontWeight.w700),
      ),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        Wrap(spacing: 6, runSpacing: 6, children: [for (final type in highlightColors.keys) tag(type)]),
        if (widget.data['source'] == 'basic') Muted(t('pdfhl.basic')),
        if (canEdit) Muted(t('pdfhl.teacherHint')),
        for (final n in pages)
          Box(
            title: t('pdfhl.page', [n]),
            children: [
              for (final h in list.where((h) => h['page'] == n))
                Opacity(
                  opacity: h['hidden'] == true ? 0.45 : 1,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 4,
                    children: [
                      tag('${h['type']}'),
                      Text('${h['text']}'),
                      if (canEdit) TextButton(onPressed: () => toggle(h), child: Text(t(h['hidden'] == true ? 'pdfhl.show' : 'pdfhl.hide'))),
                    ],
                  ),
                ),
              for (final s in rows(widget.data['scanned']).where((s) => s['n'] == n)) ...[Muted(t('pdfhl.readFromImage')), Text.rich(marked('${s['text']}', list.where((h) => h['page'] == n && h['hidden'] != true).toList(), ink))],
            ],
          ),
      ],
    );
  }
}

/// Text read from a scanned page, with its highlights marked in their colours.
TextSpan marked(String text, List<Json> marks, Color ink) {
  final found = [
    for (final m in marks)
      if (findInText(text, '${m['text']}') case final at?) (at: at, type: '${m['type']}'),
  ]..sort((a, b) => a.at.$1 - b.at.$1);
  final parts = <TextSpan>[];
  var pos = 0;
  for (final f in found) {
    if (f.at.$1 < pos) continue; // overlaps the one before
    parts.add(TextSpan(text: text.substring(pos, f.at.$1)));
    parts.add(
      TextSpan(
        text: text.substring(f.at.$1, f.at.$2),
        style: TextStyle(backgroundColor: highlightColors[f.type], color: ink),
      ),
    );
    pos = f.at.$2;
  }
  parts.add(TextSpan(text: text.substring(pos)));
  return TextSpan(children: parts);
}

/// A clock time in the reader's language, for "refills at …".
String clock(Object? iso) => iso is String ? (lang.code == 'bn' ? DateFormat.jm('bn') : DateFormat.jm('en_GB')).format(toDate(iso)) : '';

class AskAi extends StatefulWidget {
  const AskAi({super.key, required this.file});
  final String file;
  @override
  State<AskAi> createState() => _AskAiState();
}

class _AskAiState extends State<AskAi> {
  final msgs = <Json>[];
  final q = TextEditingController();
  var busy = false, note = '';

  @override
  void dispose() {
    q.dispose();
    super.dispose();
  }

  Future<void> send() async {
    final question = q.text.trim();
    if (question.isEmpty || busy) return;
    setState(() {
      msgs.add({'role': 'user', 'content': question});
      q.clear();
      busy = true;
      note = '';
    });
    int? code;
    Json d = const {};
    try {
      final res = await api('/api/ai/chat', body: {'file': widget.file, 'messages': msgs});
      code = res.statusCode;
      d = (jsonDecode(res.body) as Json?) ?? const {};
    } catch (_) {
      // no connection, or not an answer we can read
    }
    if (!mounted) return;
    setState(() {
      busy = false;
      if (code != 200) {
        msgs.removeLast(); // nothing came back: the question goes back in the box
        q.text = question;
        note = code == 429 ? t('pdfhl.limit', [clock(d['resetsAt'])]) : (code == 409 ? t('pdfhl.preparing') : (code == 503 && d['error'] == 'paused' ? t('pdfhl.paused') : t('pdfhl.error')));
        return;
      }
      msgs.add({'role': 'assistant', 'content': d['declined'] == true ? t('pdfhl.declined') : ('${d['answer'] ?? ''}'.isEmpty ? t('pdfhl.noAnswer') : '${d['answer']}')});
      note = d['source'] == 'basic' ? t('pdfhl.basicChat') : (d['left'] is num ? t('pdfhl.left', [d['left']]) : '');
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 10,
      children: [
        if (msgs.isEmpty) Muted(t('pdfhl.askHelp')),
        for (final m in msgs) Bubble(text: '${m['content']}', mine: m['role'] == 'user'),
        if (busy) Muted(t('pdfhl.thinking')),
        if (note.isNotEmpty) Semantics(liveRegion: true, child: Muted(note)),
        Box(
          children: [
            Semantics(
              container: true,
              child: TextField(
                controller: q,
                maxLength: 1000,
                minLines: 1,
                maxLines: 5,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(hintText: t('pdfhl.askPh'), labelText: t('pdfhl.ask'), counterText: '', fillColor: c.surface),
              ),
            ),
            Doing(label: t('pdfhl.send'), icon: Icons.send, onPressed: busy || q.text.trim().isEmpty ? null : send),
          ],
        ),
      ],
    );
  }
}

/// A chat bubble: mine on the right in the app's colour, theirs on the left.
class Bubble extends StatelessWidget {
  const Bubble({super.key, required this.text, required this.mine, this.sender, this.when});
  final String text;
  final bool mine;
  final String? sender, when;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.82),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: mine ? c.primary : c.surfaceContainerLowest,
          borderRadius: BorderRadius.circular(14),
          border: mine ? null : Border.all(color: c.outlineVariant),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 4, offset: const Offset(0, 2))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 4,
          children: [
            if (!mine && sender != null)
              Text(
                sender!,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: c.onSurfaceVariant),
              ),
            SelectableText(text, style: TextStyle(fontSize: 15, height: 1.4, color: mine ? c.onPrimary : c.onSurface)),
            if (when != null) Text(when!, style: TextStyle(fontSize: 11, color: (mine ? c.onPrimary : c.onSurfaceVariant).withValues(alpha: 0.8))),
          ],
        ),
      ),
    );
  }
}

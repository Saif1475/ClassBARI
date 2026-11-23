import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../icon.dart';
import '../icons.g.dart';
import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'lesson.dart' show pickPhoto;

// One chat (guardian ↔ teacher, student ↔ teacher), WhatsApp-style, the same as the website's (src/lib/chat.ts and
// components/chat/ChatRoom.tsx): bubbles with time and ticks, day dividers, replies, photos, reactions, edit, delete
// for everyone, search, and chat settings (wallpaper, Enter is send, read receipts).

const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const editMinutes = 15, deleteHours = 48, textMax = 2000;
const walls = {'plain': Color(0xFFF4F4F2), 'mint': Color(0xFFE3F1E7), 'sky': Color(0xFFE3EEF8), 'sand': Color(0xFFF5ECDC), 'night': Color(0xFF1E2A2F)};

String sideOf(Json m) => m['mine'] == true ? 'family' : 'staff';
Duration _age(Json m) => DateTime.now().difference(DateTime.tryParse('${m['at']}') ?? DateTime.now());
bool canEdit(Json m) => m['deleted'] != true && m['photo'] == null && _age(m) < const Duration(minutes: editMinutes);
bool canDelete(Json m) => m['deleted'] != true && _age(m) < const Duration(hours: deleteHours);

/// Blue ticks: the other side opened the chat after this message.
bool seen(Json t, Json m) {
  final read = sideOf(m) == 'family' ? t['readStaff'] : t['readFamily'];
  return read is String && read.compareTo('${m['at']}') >= 0;
}

/// Messages from the other side not opened yet (the teacher's side keeps its own count).
int unreadFor(Json t, String side) => side == 'staff'
    ? ((t['unread'] as num?) ?? 0).toInt()
    : rows(t['messages']).where((m) => sideOf(m) == 'staff' && m['deleted'] != true && (t['readFamily'] == null || '${m['at']}'.compareTo('${t['readFamily']}') > 0)).length;

String preview(Json? m) => m == null
    ? ''
    : m['deleted'] == true
    ? t('chat.deleted')
    : m['photo'] != null
    ? '📷 ${'${m['text'] ?? ''}'.isEmpty ? t('chat.photo') : m['text']}'
    : '${m['text'] ?? ''}';

/// This phone's chat settings.
String get chatWall => walls.containsKey(store.prefs.getString('classbari-chat-wall')) ? store.prefs.getString('classbari-chat-wall')! : 'plain';
bool get chatEnter => store.prefs.getBool('classbari-chat-enter') ?? false; // a phone keyboard's Enter starts a new line, as in WhatsApp
bool get chatReceipts => store.prefs.getBool('classbari-chat-receipts') ?? true;

/// The whole chat page. `family`: the guardian's or student's side (their messages are "mine"); else the teacher's.
class ChatRoom extends StatefulWidget {
  const ChatRoom({super.key, required this.threadId, required this.family, this.title, this.subtitle, this.header = const [], required this.hint});
  final String threadId;
  final bool family;
  final String? title, subtitle;
  final List<Widget> header; // above the messages: the child picker, a note
  final String hint;
  @override
  State<ChatRoom> createState() => _ChatRoomState();
}

class _ChatRoomState extends State<ChatRoom> {
  final text = TextEditingController();
  final scroll = ScrollController();
  final find = TextEditingController();
  bool searching = false;
  Json? replyTo, editing;
  ({Uint8List bytes, String data})? photo;
  var shownCount = -1;
  String lastRead = '';

  String get side => widget.family ? 'family' : 'staff';
  Json? get thread => rows(store.state?['chats']).where((c) => c['id'] == widget.threadId).firstOrNull;

  @override
  void dispose() {
    text.dispose();
    scroll.dispose();
    find.dispose();
    super.dispose();
  }

  /// Opened, or something new came in: read (the teacher's count to 0; with read receipts on, the other side's blue ticks).
  void _read(Json th) {
    final other = rows(th['messages']).lastWhere((m) => sideOf(m) != side, orElse: () => const {})['at'] as String? ?? '';
    final readAt = th[widget.family ? 'readFamily' : 'readStaff'] as String?;
    final needsCount = !widget.family && ((th['unread'] as num?) ?? 0) > 0;
    final needsTick = chatReceipts && other.isNotEmpty && (readAt == null || readAt.compareTo(other) < 0);
    if ((needsCount || needsTick) && lastRead != '${widget.threadId}|$other') {
      lastRead = '${widget.threadId}|$other'; // once per new message, while the save is on its way
      Future.microtask(() => store.act('markChatRead', [widget.threadId, side, chatReceipts]));
    }
  }

  Future<void> send() async {
    final msg = text.text.trim();
    if (editing != null) {
      final e = editing!;
      setState(() => editing = null);
      text.clear();
      if (msg.isNotEmpty && msg != e['text']) await store.act('editChatMessage', [widget.threadId, e['id'], msg]);
      return;
    }
    if (msg.isEmpty && photo == null) return;
    final extra = {if (replyTo != null) 'reply': replyTo!['id'], if (photo != null) 'photo': photo!.data};
    text.clear();
    setState(() => (replyTo = null, photo = null));
    final id = int.parse(widget.threadId.replaceFirst(RegExp(r'^(parent|student)-'), ''));
    final saved = widget.family
        ? await store.act(widget.threadId.startsWith('student-') ? 'sendStudentMessage' : 'sendParentMessage', [id, msg, if (extra.isNotEmpty) extra])
        : await store.act('sendChatMessage', [widget.threadId, store.state?['teacherLogin'] ?? store.state?['teacherName'] ?? '', msg, false, if (extra.isNotEmpty) extra]);
    if (!saved && mounted && store.status == Status.offline) toast(context, t('app.sentLater'));
  }

  Future<void> attach() async {
    final pick = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(leading: Ico(I.camera), title: Text(t('app.takePhoto')), onTap: () => Navigator.pop(context, true)),
            ListTile(leading: Ico(I.image), title: Text(t('app.choosePhoto')), onTap: () => Navigator.pop(context, false)),
          ],
        ),
      ),
    );
    if (pick == null || !mounted) return;
    final p = await pickPhoto(context, camera: pick, max: 1280);
    if (p != null && mounted) setState(() => photo = (bytes: p.bytes, data: p.data));
  }

  /// Long press on a message: react, reply, copy, edit, delete for everyone.
  Future<void> options(Json m) async {
    final mine = sideOf(m) == side;
    final mineReact = (m['react'] as Map?)?[side];
    final pick = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                for (final e in reactions)
                  Semantics(
                    button: true,
                    selected: mineReact == e,
                    label: e,
                    child: InkResponse(
                      onTap: () => Navigator.pop(context, 'react:$e'),
                      radius: 26,
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(shape: BoxShape.circle, color: mineReact == e ? context.colors.primaryContainer : null),
                        child: Text(e, style: const TextStyle(fontSize: 26)),
                      ),
                    ),
                  ),
              ],
            ),
            const Divider(),
            ListTile(leading: Ico(I.back), title: Text(t('chat.reply')), onTap: () => Navigator.pop(context, 'reply')),
            if ('${m['text'] ?? ''}'.isNotEmpty) ListTile(leading: Ico(I.copy), title: Text(t('chat.copy')), onTap: () => Navigator.pop(context, 'copy')),
            if (mine && canEdit(m)) ListTile(leading: Ico(I.edit), title: Text(t('chat.edit')), onTap: () => Navigator.pop(context, 'edit')),
            if (mine && canDelete(m))
              ListTile(
                leading: Ico(I.trash, color: context.colors.error),
                title: Text(t('chat.delete'), style: TextStyle(color: context.colors.error)),
                onTap: () => Navigator.pop(context, 'delete'),
              ),
          ],
        ),
      ),
    );
    if (pick == null || !mounted) return;
    if (pick.startsWith('react:')) {
      final e = pick.substring(6);
      await store.act('reactChatMessage', [widget.threadId, m['id'], side, mineReact == e ? null : e]);
    } else if (pick == 'reply') {
      setState(() => (replyTo = m, editing = null));
    } else if (pick == 'copy') {
      await Clipboard.setData(ClipboardData(text: '${m['text']}'));
      if (mounted) toast(context, t('chat.copied'));
    } else if (pick == 'edit') {
      setState(() => (editing = m, replyTo = null, photo = null));
      text.text = '${m['text']}';
    } else if (pick == 'delete') {
      if (await confirm(context, t('chat.delete'), t('chat.confirmDelete'), yes: t('chat.delete'))) await store.act('deleteChatMessage', [widget.threadId, m['id']]);
    }
  }

  /// Keep a setting on this phone and show it at once, in the sheet and behind it.
  void _pref(void Function() save, StateSetter again) {
    save();
    again(() {});
    setState(() {});
  }

  Future<void> settings() async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, again) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 8,
              children: [
                H2(t('chat.settings')),
                Strong(t('chat.wallpaper')),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final w in walls.keys)
                      ChoiceChip(
                        avatar: CircleAvatar(backgroundColor: walls[w], radius: 8),
                        label: Text(t('chat.walls.$w')),
                        selected: chatWall == w,
                        onSelected: (_) => _pref(() => store.prefs.setString('classbari-chat-wall', w), again),
                      ),
                  ],
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(t('chat.enterSend')),
                  subtitle: Text(t('chat.enterSendHint')),
                  value: chatEnter,
                  onChanged: (v) => _pref(() => store.prefs.setBool('classbari-chat-enter', v), again),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(t('chat.receipts')),
                  subtitle: Text(t('chat.receiptsHint')),
                  value: chatReceipts,
                  onChanged: (v) => _pref(() => store.prefs.setBool('classbari-chat-receipts', v), again),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _day(String iso) {
    final d = dayKey(toDate(iso));
    if (d == dayKey()) return t('chat.today');
    if (d == dayKey(DateTime.now().subtract(const Duration(days: 1)))) return t('chat.yesterday');
    return fmtDate(iso);
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final th = thread;
    if (th != null) _read(th);
    final all = rows(th?['messages']);
    final byId = {for (final m in all) m['id']: m};
    final needle = find.text.trim().toLowerCase();
    final list = needle.isEmpty ? all : all.where((m) => m['deleted'] != true && '${m['text']}'.toLowerCase().contains(needle)).toList();
    final dark = chatWall == 'night';
    // Newest at the bottom: follow it when a message arrives.
    if (list.length != shownCount && needle.isEmpty) {
      shownCount = list.length;
      WidgetsBinding.instance.addPostFrameCallback((_) => scroll.hasClients ? scroll.jumpTo(scroll.position.maxScrollExtent) : null);
    }
    final pill = BoxDecoration(color: dark ? Colors.white.withValues(alpha: 0.15) : Colors.white.withValues(alpha: 0.9), borderRadius: BorderRadius.circular(8));
    return Screen(
      title: widget.title,
      subtitle: widget.subtitle,
      controller: scroll,
      background: walls[chatWall],
      actions: [
        IconButton(
          tooltip: t('chat.search'),
          isSelected: searching,
          icon: Ico(I.search),
          onPressed: () => setState(() {
            searching = !searching;
            find.clear();
          }),
        ),
        IconButton(tooltip: t('chat.settings'), icon: Ico(I.more), onPressed: settings),
      ],
      bottom: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 8,
        children: [
          if (replyTo != null || editing != null)
            Container(
              padding: const EdgeInsets.fromLTRB(10, 6, 4, 6),
              decoration: BoxDecoration(
                color: context.colors.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(10),
                border: Border(left: BorderSide(color: context.colors.primary, width: 4)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          editing != null ? t('chat.editing') : (sideOf(replyTo!) == side ? t('chat.you') : '${replyTo!['sender']}'),
                          style: TextStyle(color: context.colors.primary, fontWeight: FontWeight.bold, fontSize: 12),
                        ),
                        Text(preview(editing ?? replyTo), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: t('chat.cancel'),
                    icon: Ico(I.close),
                    onPressed: () => setState(() {
                      if (editing != null) text.clear();
                      replyTo = null;
                      editing = null;
                    }),
                  ),
                ],
              ),
            ),
          if (photo != null)
            Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.memory(photo!.bytes, width: 72, height: 72, fit: BoxFit.cover, semanticLabel: t('chat.photo')),
                ),
                IconButton(tooltip: t('chat.removePhoto'), icon: Ico(I.cancelCircle), onPressed: () => setState(() => photo = null)),
              ],
            ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            spacing: 6,
            children: [
              if (editing == null) IconButton(tooltip: t('chat.attach'), icon: Ico(I.image), onPressed: attach),
              Expanded(
                child: TextField(
                  controller: text,
                  minLines: 1,
                  maxLines: 5,
                  maxLength: textMax,
                  textInputAction: chatEnter ? TextInputAction.send : TextInputAction.newline,
                  onSubmitted: chatEnter ? (_) => send() : null,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: widget.hint,
                    counterText: '',
                    fillColor: context.colors.surface,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(24)),
                  ),
                ),
              ),
              IconButton.filled(
                tooltip: editing != null ? t('chat.edit') : t('chat.send'),
                icon: Ico(editing != null ? I.check : I.send),
                onPressed: text.text.trim().isEmpty && photo == null ? null : send,
              ),
            ],
          ),
        ],
      ),
      children: [
        ...widget.header,
        if (searching)
          TextField(
            controller: find,
            autofocus: true,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(hintText: t('chat.search'), prefixIcon: Ico(I.search), fillColor: context.colors.surface),
          ),
        if (all.isEmpty)
          Center(
            child: Container(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8), decoration: pill, child: Muted(t('app.noMessages'))),
          ),
        if (needle.isNotEmpty && list.isEmpty) Center(child: Muted(t('chat.noResults'))),
        for (var i = 0; i < list.length; i++) ...[
          if (i == 0 || dayKey(toDate('${list[i - 1]['at']}')) != dayKey(toDate('${list[i]['at']}')))
            Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: pill,
                child: Text(
                  _day('${list[i]['at']}'),
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: dark ? Colors.white : context.colors.onSurfaceVariant),
                ),
              ),
            ),
          _Message(
            list[i],
            mine: sideOf(list[i]) == side,
            quoted: byId[list[i]['reply']],
            quotedMine: byId[list[i]['reply']] != null && sideOf(byId[list[i]['reply']]!) == side,
            ticks: th != null && chatReceipts && seen(th, list[i]),
            onLong: () => options(list[i]),
          ),
        ],
      ],
    );
  });
}

class _Message extends StatelessWidget {
  const _Message(this.m, {required this.mine, required this.quoted, required this.quotedMine, required this.ticks, required this.onLong});
  final Json m;
  final bool mine, quotedMine, ticks;
  final Json? quoted;
  final VoidCallback onLong;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final deleted = m['deleted'] == true;
    final reacts = ((m['react'] as Map?)?.values ?? const []).join();
    final fg = mine ? c.onPrimaryContainer : c.onSurface;
    final meta = TextStyle(fontSize: 11, color: fg.withValues(alpha: 0.7));
    final bubble = Container(
      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.8),
      padding: const EdgeInsets.fromLTRB(10, 6, 10, 6),
      decoration: BoxDecoration(
        color: mine ? c.primaryContainer : c.surfaceContainerLowest,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(mine ? 12 : 4),
          topRight: Radius.circular(mine ? 4 : 12),
          bottomLeft: const Radius.circular(12),
          bottomRight: const Radius.circular(12),
        ),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 2, offset: const Offset(0, 1))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        spacing: 4,
        children: [
          if (quoted != null)
            Container(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(8),
                border: Border(left: BorderSide(color: c.primary, width: 4)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    quotedMine ? t('chat.you') : '${quoted!['sender']}',
                    style: TextStyle(color: c.primary, fontWeight: FontWeight.bold, fontSize: 12),
                  ),
                  Text(
                    preview(quoted),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: fg),
                  ),
                ],
              ),
            ),
          if (m['photo'] is String) _ChatPhoto('${m['photo']}'),
          if (deleted)
            Text(
              '🚫 ${t(mine ? 'chat.deletedMine' : 'chat.deleted')}',
              style: TextStyle(fontStyle: FontStyle.italic, color: fg.withValues(alpha: 0.7)),
            )
          else if ('${m['text'] ?? ''}'.isNotEmpty)
            Text('${m['text']}', style: TextStyle(color: fg)),
          Row(
            mainAxisSize: MainAxisSize.min,
            spacing: 4,
            children: [
              if (m['edited'] == true && !deleted) Text(t('chat.edited'), style: meta),
              if (m['at'] is String) Text(fmtTime('${m['at']}'), style: meta),
              if (mine && !deleted)
                Semantics(
                  label: t(ticks ? 'chat.read' : 'chat.sent'),
                  child: Ico(ticks ? I.checkAll : I.check, size: 15, color: ticks ? const Color(0xFF0284C7) : meta.color),
                ),
            ],
          ),
        ],
      ),
    );
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: deleted ? null : onLong,
        child: Semantics(
          onLongPressHint: t('chat.menu'),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Padding(
                padding: EdgeInsets.only(bottom: reacts.isEmpty ? 0 : 14),
                child: bubble,
              ),
              if (reacts.isNotEmpty)
                Positioned(
                  bottom: 0,
                  right: mine ? 8 : null,
                  left: mine ? null : 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(
                      color: c.surfaceContainerLowest,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: c.outlineVariant),
                    ),
                    child: Text(reacts, style: const TextStyle(fontSize: 14)),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A photo in a message: sent just now (still a data URL) or stored on the server (a short-lived link).
class _ChatPhoto extends StatelessWidget {
  const _ChatPhoto(this.url);
  final String url;
  static final _links = <String, Future<String?>>{};
  @override
  Widget build(BuildContext context) {
    final box = BoxConstraints(maxHeight: 280, maxWidth: MediaQuery.sizeOf(context).width * 0.7);
    if (url.startsWith('data:')) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: ConstrainedBox(
          constraints: box,
          child: Image.memory(base64Decode(url.substring(url.indexOf(',') + 1)), fit: BoxFit.cover, semanticLabel: t('chat.photo')),
        ),
      );
    }
    return FutureBuilder<String?>(
      future: _links[url] ??= fileLink(url),
      builder: (context, snap) => snap.data == null
          ? const SizedBox(width: 160, height: 120, child: Center(child: CircularProgressIndicator()))
          : ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: ConstrainedBox(
                constraints: box,
                child: Image.network(snap.data!, fit: BoxFit.cover, semanticLabel: t('chat.photo'), errorBuilder: (_, _, _) => Muted(t('chat.photo'))),
              ),
            ),
    );
  }
}

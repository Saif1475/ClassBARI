// The student community, the same as the website's (src/components/community/Community.tsx): posts with photos and
// polls, who may see each post, likes, replies, saved posts, friends, a profile and privacy (mute, block, requests).
// The server decides what a student sees and may do (data-access.ts). No private student-to-student messages, by design.
import 'dart:convert';

import 'package:material_ui/material_ui.dart';

import '../icon.dart';
import '../icons.g.dart';
import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import 'lesson.dart' show pickPhoto;
import 'student_more.dart' show DataPicture;

const _audIcon = {'all': '🌐', 'batch': '🏫', 'friends': '👥'};
final _tag = RegExp(r'#[\p{L}\p{M}\p{N}_]{2,40}', unicode: true);

int? get _me => store.me?['id'] as int?;
Json _profile(Object? id) => (((store.state?['communityProfiles'] as Map?)?['$id'] as Map?) ?? const {}).cast<String, dynamic>();
List<int> _ids(Object? list) => [for (final v in (list as List?) ?? const []) (v as num).toInt()];
List<Json> get _friendships => rows(store.state?['friendships']);
String _audLabel(String a) => '${_audIcon[a]} ${t('community.aud${a[0].toUpperCase()}${a.substring(1)}')}';

({String name, String sub}) _who(Object? a) => a == 'teacher'
    ? (name: '${store.state?['teacherName'] ?? ''}', sub: t('community.teacher'))
    : (name: '${store.student(a)?['name'] ?? '—'}', sub: '${store.student(a)?['batch'] ?? ''}');

/// none, sent, received or friends (community.ts friendStatus).
String _status(int other) {
  final me = _me;
  final f = _friendships.where((f) => (f['from'] == me && f['to'] == other) || (f['from'] == other && f['to'] == me)).firstOrNull;
  if (f == null) return 'none';
  return f['status'] == 'friends' ? 'friends' : (f['from'] == me ? 'sent' : 'received');
}

List<int> _friendsOf(Object? id) => [
  for (final f in _friendships)
    if (f['status'] == 'friends' && (f['from'] == id || f['to'] == id)) ((f['from'] == id ? f['to'] : f['from']) as num).toInt(),
];

/// May I send them a request? Their setting decides; a block means no (community.ts canRequest; the server checks again).
bool _canRequest(int other) {
  final me = _me;
  if (me == null || me == other || _ids(_profile(me)['blocked']).contains(other) || _ids(_profile(other)['blocked']).contains(me)) return false;
  final rule = _profile(other)['requests'] ?? 'all';
  return rule == 'all' || (rule == 'batch' && store.me?['batch'] != null && store.me?['batch'] == store.student(other)?['batch']);
}

/// The posts I see, pinned first then newest, without people I muted (community.ts timeline; the server already
/// left out what I may not see).
List<Json> _timeline({String filter = 'all', String query = '', int? author}) {
  final me = _me, mine = _profile(me), friends = _friendsOf(me).toSet(), q = query.trim().toLowerCase();
  return rows(store.state?['community']).where((p) {
    final a = p['author'];
    if (p['hidden'] == true) return false;
    if (filter == 'friends' && !(a == 'teacher' || a == me || friends.contains(a))) return false;
    if (a is int && a != author && _ids(mine['muted']).contains(a)) return false;
    if (filter == 'saved' && !_ids(mine['saved']).contains(p['id'])) return false;
    if (author != null && a != author) return false;
    return q.isEmpty || '${p['text']}'.toLowerCase().contains(q) || _who(a).name.toLowerCase().contains(q) || '${(p['file'] as Map?)?['name'] ?? ''}'.toLowerCase().contains(q);
  }).toList()..sort((x, y) {
    final pin = (y['pinned'] == true ? 1 : 0) - (x['pinned'] == true ? 1 : 0);
    return pin != 0 ? pin : '${y['at']}'.compareTo('${x['at']}');
  });
}

/// The most used #tags in these posts.
List<String> _trending(List<Json> posts) {
  final count = <String, int>{};
  for (final p in posts) {
    for (final tag in {for (final m in _tag.allMatches('${p['text']}')) m[0]!.toLowerCase()}) {
      count[tag] = (count[tag] ?? 0) + 1;
    }
  }
  final list = count.entries.toList()..sort((a, b) => b.value != a.value ? b.value - a.value : a.key.compareTo(b.key));
  return [for (final e in list.take(6)) e.key];
}

/// Send a change; say so if it waits for internet, or (`refused`) why the server said no.
Future<bool> _act(BuildContext context, String name, List<Object?> args, {String? refused}) async {
  final ok = await store.act(name, args);
  if (!ok && context.mounted) {
    if (store.status == Status.offline) {
      toast(context, t('app.sentLater'));
    } else if (refused != null) {
      toast(context, refused);
    }
  }
  return ok;
}

/// Add or take someone off my muted or blocked list.
Future<void> _setList(BuildContext context, String key, int id, bool on) {
  final list = _ids(_profile(_me)[key]);
  return _act(context, 'setCommunityProfile', [
    _me,
    {key: on ? {...list, id}.toList() : list.where((x) => x != id).toList()},
  ]);
}

void _open(BuildContext context, Object? author) {
  if (author is int && author != _me) push(context, _ProfileScreen(author));
}

class CommunityScreen extends StatefulWidget {
  const CommunityScreen({super.key});
  @override
  State<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends State<CommunityScreen> {
  var tab = 'all';
  final search = TextEditingController();

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Live((context) {
    final me = _me;
    if (me == null) return Screen(title: t('community.title'), children: [Muted(t('app.nothingYet'))]);
    final requests = _friendships.where((f) => f['to'] == me && f['status'] == 'pending').length;
    final posts = _timeline(filter: tab, query: search.text);
    final tags = tab == 'all' && search.text.isEmpty ? _trending(_timeline()) : const <String>[];
    void find(String q) => setState(() {
      search.text = q;
      tab = 'all';
    });
    return Screen(
      title: t('community.title'),
      subtitle: t('community.sub'),
      children: [
        Chips(
          value: tab,
          options: const ['all', 'friends', 'saved', 'activity', 'people', 'me'],
          labels: {
            'all': t('community.forYou'),
            'friends': t('community.onlyFriends'),
            'saved': t('community.savedTab'),
            'activity': requests > 0 ? '${t('community.activityTab')} ($requests)' : t('community.activityTab'),
            'people': t('community.peopleTab'),
            'me': t('community.meTab'),
          },
          onChanged: (v) => setState(() => tab = v),
        ),
        if (tab == 'activity')
          const _Activity()
        else if (tab == 'people')
          const _People()
        else if (tab == 'me') ...[
          _ProfileBody(me, onTag: find),
          const _Privacy(),
        ] else ...[
          if (tab == 'all') const _Composer(),
          Semantics(
            container: true,
            child: TextField(
              controller: search,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(prefixIcon: Ico(I.search), hintText: t('community.searchPosts')),
            ),
          ),
          if (tags.isNotEmpty)
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [Strong('${t('community.trendingTitle')}:'), for (final tag in tags) ActionChip(label: Text(tag), onPressed: () => find(tag))],
            ),
          if (posts.isEmpty) Muted(search.text.isNotEmpty ? t('community.noResults') : tab == 'friends' ? t('community.noFriendPosts') : tab == 'saved' ? t('community.nobodyYet') : t('community.empty')),
          for (final p in posts) _Post(p, key: ValueKey(p['id']), onTag: find),
        ],
      ],
    );
  });
}

/// Write a post: who sees it, text, up to 4 photos, an optional poll.
class _Composer extends StatefulWidget {
  const _Composer();
  @override
  State<_Composer> createState() => _ComposerState();
}

class _ComposerState extends State<_Composer> {
  final text = TextEditingController();
  final images = <String>[];
  List<String>? poll;
  late String audience = '${_profile(_me)['audience'] ?? 'all'}';
  var round = 0; // a new post clears the poll boxes

  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }

  Future<void> addPhoto(bool camera) async {
    final p = await pickPhoto(context, camera: camera);
    if (p != null && mounted) setState(() => images.add(p.data));
  }

  Future<void> send() async {
    final options = poll?.map((o) => o.trim()).where((o) => o.isNotEmpty).toList();
    final ok = await _act(context, 'addCommunityPost', [
      _me,
      text.text.trim(),
      null,
      {'images': images, 'poll': ?options, 'audience': audience},
    ], refused: t('community.unkind'));
    if (ok || store.status == Status.offline) {
      text.clear();
      setState(() {
        images.clear();
        poll = null;
        round++;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final pollOk = poll == null || poll!.where((o) => o.trim().isNotEmpty).length >= 2;
    final ready = pollOk && (text.text.trim().isNotEmpty || images.isNotEmpty || poll != null);
    return Box(
      title: t('community.compose'),
      children: [
        DropdownButtonFormField<String>(
          initialValue: audience,
          isExpanded: true,
          decoration: InputDecoration(labelText: t('community.whoCanSee')),
          items: [for (final a in _audIcon.keys) DropdownMenuItem(value: a, child: Text(_audLabel(a)))],
          onChanged: (v) => setState(() => audience = v ?? 'all'),
        ),
        Semantics(
          container: true,
          child: TextField(controller: text, minLines: 2, maxLines: 8, maxLength: 2000, onChanged: (_) => setState(() {}), decoration: InputDecoration(hintText: t('community.whatsHappening'))),
        ),
        if (images.isNotEmpty)
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final (i, src) in images.indexed)
                Stack(
                  children: [
                    ClipRRect(borderRadius: BorderRadius.circular(10), child: Image.memory(base64Decode(src.substring(src.indexOf(',') + 1)), width: 96, height: 96, fit: BoxFit.cover)),
                    IconButton.filledTonal(tooltip: t('community.removePhoto'), onPressed: () => setState(() => images.removeAt(i)), icon: Ico(I.close, size: 18)),
                  ],
                ),
            ],
          ),
        if (poll != null)
          Box(
            title: t('community.poll'),
            children: [
              for (final (i, _) in poll!.indexed)
                Semantics(
                  container: true,
                  child: TextFormField(
                    key: ValueKey('$round-$i'),
                    maxLength: 80,
                    onChanged: (v) => setState(() => poll![i] = v),
                    decoration: InputDecoration(labelText: t('community.pollOption', [i + 1]), counterText: ''),
                  ),
                ),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (poll!.length < 4) Doing(label: t('community.addOption'), icon: I.plus, soft: true, small: true, onPressed: () async => setState(() => poll!.add(''))),
                  Doing(label: t('community.removePoll'), danger: true, soft: true, small: true, onPressed: () async => setState(() => poll = null)),
                ],
              ),
            ],
          ),
        Muted(t('community.rules')),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (images.length < 4) ...[
              Doing(label: t('app.choosePhoto'), icon: I.image, soft: true, small: true, onPressed: () => addPhoto(false)),
              Doing(label: t('app.takePhoto'), icon: I.camera, soft: true, small: true, onPressed: () => addPhoto(true)),
            ] else
              Muted(t('community.photoLimit')),
            if (poll == null) Doing(label: t('community.poll'), icon: I.grid, soft: true, small: true, onPressed: () async => setState(() => poll = ['', ''])),
            Doing(label: t('community.post'), icon: I.send, small: true, onPressed: ready ? send : null),
          ],
        ),
      ],
    );
  }
}

/// One post: who wrote it, its text, photos, file and poll; like, save, replies and the ⋯ menu.
class _Post extends StatefulWidget {
  const _Post(this.p, {super.key, required this.onTag});
  final Json p;
  final ValueChanged<String> onTag;
  @override
  State<_Post> createState() => _PostState();
}

class _PostState extends State<_Post> {
  var open = false;
  final reply = TextEditingController();
  TextEditingController? editing;

  @override
  void dispose() {
    reply.dispose();
    editing?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.p, me = _me!, id = p['id'], a = p['author'], who = _who(a), c = context.colors;
    final mine = a == me, other = a is int && !mine ? a : null;
    final myProfile = _profile(me);
    final liked = _ids(p['likes']).contains(me), saved = _ids(myProfile['saved']).contains(id), reported = _ids(p['reports']).contains(me);
    final muted = other != null && _ids(myProfile['muted']).contains(other);
    final images = [for (final x in (p['images'] as List?) ?? [?p['image']]) '$x'];
    final comments = rows(p['comments']);
    final audience = p['audience'];
    final menu = <(String, Future<void> Function())>[
      if (mine) (t('community.edit'), () async => setState(() => editing = TextEditingController(text: '${p['text'] ?? ''}'))),
      if (mine) (t('community.delete'), () async {
        if (await confirm(context, t('community.delete'), t('community.deleteQ'), yes: t('community.delete')) && context.mounted) await _act(context, 'deletePost', [id]);
      }),
      (saved ? t('community.unsave') : t('community.savePost'), () => _act(context, 'toggleSave', [me, id])),
      if (other != null) (muted ? t('community.unmute', [who.name]) : t('community.mute', [who.name]), () => _setList(context, 'muted', other, !muted)),
      if (other != null) (t('community.block', [who.name]), () async {
        if (await confirm(context, t('community.block', [who.name]), t('community.blockQ', [who.name]), yes: t('community.block', [who.name])) && context.mounted) await _setList(context, 'blocked', other, true);
      }),
      if (!mine && !reported) (t('community.report'), () async {
        if (await confirm(context, t('community.report'), t('community.reportQ'), yes: t('community.report')) && context.mounted) await _act(context, 'reportPost', [id, me]);
      }),
    ];
    Widget count(CbIcon icon, String label, int n, bool on, Color tone, VoidCallback onTap) => Tooltip(
      message: label,
      child: TextButton.icon(onPressed: onTap, icon: Ico(icon, size: 20, color: on ? tone : c.onSurfaceVariant), label: Text(n > 0 ? '$n' : '', style: TextStyle(color: on ? tone : c.onSurfaceVariant))),
    );

    return Box(
      children: [
        if (p['pinned'] == true) Muted('📌 ${t('community.pinnedBy')}'),
        Row(
          spacing: 10,
          children: [
            InkWell(customBorder: const CircleBorder(), onTap: other == null ? null : () => _open(context, other), child: Avatar(who.name)),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Strong(a == 'teacher' ? '${who.name} ✔' : who.name),
                  Muted([who.sub, if (p['at'] is String) fmtWhen(p['at'] as String), if (p['edited'] != null) t('community.edited'), if (audience is String && audience != 'all') '${_audIcon[audience]}'].join(' · ')),
                ],
              ),
            ),
            PopupMenuButton<Future<void> Function()>(
              tooltip: t('community.moreActions'),
              icon: Ico(I.more),
              onSelected: (run) => run(),
              itemBuilder: (_) => [for (final (label, run) in menu) PopupMenuItem(value: run, child: Text(label))],
            ),
          ],
        ),
        if (p['held'] == true) Align(alignment: Alignment.centerLeft, child: Tag('⏳ ${t('community.heldMine')}')),
        if (editing != null) ...[
          Semantics(container: true, child: TextField(controller: editing, minLines: 2, maxLines: 8, maxLength: 2000, decoration: InputDecoration(labelText: t('community.edit')))),
          Wrap(
            spacing: 8,
            children: [
              Doing(label: t('community.cancel'), soft: true, small: true, onPressed: () async => setState(() => editing = null)),
              Doing(
                label: t('community.save'),
                small: true,
                onPressed: () async {
                  if (await _act(context, 'editPost', [id, editing!.text], refused: t('community.unkind')) || store.status == Status.offline) setState(() => editing = null);
                },
              ),
            ],
          ),
        ] else if ('${p['text'] ?? ''}'.isNotEmpty)
          Text('${p['text']}'),
        if (editing == null && _tag.hasMatch('${p['text']}'))
          Wrap(spacing: 6, children: [for (final m in {for (final m in _tag.allMatches('${p['text']}')) m[0]!.toLowerCase()}) ActionChip(label: Text(m), onPressed: () => widget.onTag(m))]),
        for (final src in images) DataPicture(src),
        if (p['file'] is Map)
          Item(icon: I.file, title: '${(p['file'] as Map)['name']}', onTap: () => openLink(context, '${(p['file'] as Map)['url']}')),
        if (p['poll'] is Map) _Poll(p),
        Wrap(
          spacing: 4,
          children: [
            count(I.message, t('community.comments', [comments.length]), comments.length, open, c.primary, () => setState(() => open = !open)),
            count(I.heart, liked ? t('community.liked') : t('community.like'), _ids(p['likes']).length, liked, c.error, () => _act(context, 'toggleLike', [id, me])),
            count(I.bookmark, saved ? t('community.unsave') : t('community.savePost'), 0, saved, c.primary, () => _act(context, 'toggleSave', [me, id])),
            if (reported) Padding(padding: const EdgeInsets.all(12), child: Ico(I.flag, color: c.tertiary, semanticLabel: t('community.reported'))),
          ],
        ),
        if (open) ...[
          for (final cm in comments)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 8,
              children: [
                Avatar(_who(cm['author']).name, size: 28),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [Strong(_who(cm['author']).name), if (cm['at'] is String) Muted(fmtWhen(cm['at'] as String)), Text('${cm['text'] ?? ''}')],
                  ),
                ),
                if (cm['author'] == me)
                  IconButton(
                    tooltip: t('community.deleteComment'),
                    icon: Ico(I.trash, size: 18),
                    onPressed: () async {
                      if (await confirm(context, t('community.deleteComment'), '${t('community.deleteComment')}?', yes: t('community.delete')) && context.mounted) await _act(context, 'deleteComment', [id, cm['id']]);
                    },
                  ),
              ],
            ),
          Row(
            children: [
              Expanded(
                child: Semantics(
                  container: true,
                  child: TextField(controller: reply, maxLength: 500, onChanged: (_) => setState(() {}), decoration: InputDecoration(hintText: t('community.commentPh'), labelText: t('community.commentOn', [who.name]), counterText: '')),
                ),
              ),
              IconButton(
                tooltip: t('community.send'),
                icon: Ico(I.send),
                onPressed: reply.text.trim().isEmpty
                    ? null
                    : () async {
                        final text = reply.text;
                        reply.clear();
                        setState(() {});
                        await _act(context, 'addComment', [id, me, text], refused: t('community.unkind'));
                      },
              ),
            ],
          ),
        ],
      ],
    );
  }
}

/// A poll: the options to vote on, or (once I voted) how everyone voted. The server sends counts and only my vote.
class _Poll extends StatelessWidget {
  const _Poll(this.p);
  final Json p;
  @override
  Widget build(BuildContext context) {
    final poll = p['poll'] as Map, options = [for (final o in (poll['options'] as List?) ?? const []) '$o'];
    final counts = [for (final (i, _) in options.indexed) ((poll['counts'] as List?)?.elementAtOrNull(i) as num?)?.toInt() ?? ((poll['votes'] as Map?) ?? const {}).values.where((v) => v == i).length];
    final total = counts.fold(0, (a, b) => a + b);
    final mine = ((poll['votes'] as Map?) ?? const {})['$_me'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 6,
      children: [
        for (final (i, o) in options.indexed)
          if (mine == null)
            OutlinedButton(onPressed: () => _act(context, 'votePoll', [p['id'], _me, i]), child: Text(o))
          else ...[
            Row(children: [Expanded(child: Text(mine == i ? '$o ✓' : o)), Strong('${total == 0 ? 0 : (counts[i] * 100 / total).round()}%')]),
            MarkBar(total == 0 ? 0 : counts[i] * 100 / total, plain: true),
          ],
        Muted(t('community.votes', [total])),
      ],
    );
  }
}

/// Add friend / Requested / Accept / Friends, by where we stand.
class _FriendButton extends StatelessWidget {
  const _FriendButton(this.other);
  final int other;
  @override
  Widget build(BuildContext context) {
    final me = _me, name = _who(other).name;
    return switch (_status(other)) {
      'friends' => Doing(
        label: '✓ ${t('community.friends')}',
        soft: true,
        small: true,
        onPressed: () async {
          if (await confirm(context, t('community.friends'), t('community.unfriendQ', [name])) && context.mounted) await _act(context, 'answerFriend', [me, other, false]);
        },
      ),
      'sent' => Doing(label: t('community.requested'), soft: true, small: true, onPressed: () => _act(context, 'answerFriend', [me, other, false])),
      'received' => Doing(label: t('community.accept'), small: true, onPressed: () => _act(context, 'answerFriend', [me, other, true])),
      _ when !_canRequest(other) => Muted(t('community.notTaking')),
      _ => Semantics(label: t('community.addFriendTo', [name]), child: Doing(label: '+ ${t('community.addFriend')}', small: true, onPressed: () => _act(context, 'requestFriend', [me, other]))),
    };
  }
}

class _ProfileScreen extends StatelessWidget {
  const _ProfileScreen(this.id);
  final int id;
  @override
  Widget build(BuildContext context) => Live((context) => Screen(title: _who(id).name, children: [_ProfileBody(id)]));
}

/// A student's page: name, batch, posts and friends; my own bio can be changed here; others can be muted or blocked.
class _ProfileBody extends StatefulWidget {
  const _ProfileBody(this.id, {this.onTag});
  final int id;
  final ValueChanged<String>? onTag;
  @override
  State<_ProfileBody> createState() => _ProfileBodyState();
}

class _ProfileBodyState extends State<_ProfileBody> {
  TextEditingController? bio;

  @override
  void dispose() {
    bio?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final id = widget.id, me = _me!, self = id == me, s = store.student(id), pr = _profile(id), mine = _profile(me);
    if (s == null) return Muted(t('app.nothingYet'));
    final posts = _timeline(author: id);
    final muted = _ids(mine['muted']).contains(id), blocked = _ids(mine['blocked']).contains(id);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        Box(
          children: [
            Row(
              spacing: 14,
              children: [
                Avatar('${s['name']}', size: 64),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [H2('${s['name']}'), Muted('${s['batch'] ?? ''}'), Muted('${t('community.postsN', [posts.length])} · ${t('community.friendsN', [_friendsOf(id).length])}')],
                  ),
                ),
              ],
            ),
            if (!self) Align(alignment: Alignment.centerLeft, child: _FriendButton(id)),
            if (bio != null) ...[
              Semantics(container: true, child: TextField(controller: bio, maxLength: 160, minLines: 2, maxLines: 4, decoration: InputDecoration(labelText: t('community.bioLabel'), hintText: t('community.bioPh')))),
              Wrap(
                spacing: 8,
                children: [
                  Doing(label: t('community.cancel'), soft: true, small: true, onPressed: () async => setState(() => bio = null)),
                  Doing(
                    label: t('community.save'),
                    small: true,
                    onPressed: () async {
                      if (await _act(context, 'setCommunityProfile', [me, {'bio': bio!.text}], refused: t('community.unkind')) || store.status == Status.offline) setState(() => bio = null);
                    },
                  ),
                ],
              ),
            ] else if ('${pr['bio'] ?? ''}'.isNotEmpty)
              Text('${pr['bio']}'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (self && bio == null) Doing(label: t('community.editProfile'), icon: I.edit, soft: true, small: true, onPressed: () async => setState(() => bio = TextEditingController(text: '${pr['bio'] ?? ''}'))),
                if (!self) Doing(label: muted ? t('community.unmute', [s['name']]) : t('community.mute', [s['name']]), soft: true, small: true, onPressed: () => _setList(context, 'muted', id, !muted)),
                if (!self)
                  Doing(
                    label: blocked ? t('community.unblock', [s['name']]) : t('community.block', [s['name']]),
                    danger: true,
                    soft: true,
                    small: true,
                    onPressed: () async {
                      if (blocked) return _setList(context, 'blocked', id, false);
                      if (await confirm(context, t('community.block', [s['name']]), t('community.blockQ', [s['name']]), yes: t('community.block', [s['name']])) && context.mounted) await _setList(context, 'blocked', id, true);
                    },
                  ),
              ],
            ),
          ],
        ),
        if (posts.isEmpty) Muted(t('community.noPosts')),
        for (final p in posts) _Post(p, key: ValueKey(p['id']), onTag: widget.onTag ?? (_) {}),
      ],
    );
  }
}

/// What happened around me: friend requests, replies, likes and votes on my posts.
class _Activity extends StatelessWidget {
  const _Activity();
  @override
  Widget build(BuildContext context) {
    final me = _me;
    final mine = rows(store.state?['community']).where((p) => p['author'] == me);
    String short(Object? s, int n) => '$s'.length > n ? '${'$s'.substring(0, n)}…' : '$s';
    final list = <({String at, Object? who, String text, Widget? extra})>[
      for (final f in _friendships.where((f) => f['to'] == me && f['status'] == 'pending'))
        (at: '9999', who: f['from'], text: t('community.wantsFriend', [_who(f['from']).name]), extra: _FriendButton((f['from'] as num).toInt())),
      for (final p in mine)
        for (final cm in rows(p['comments']).where((cm) => cm['author'] != me)) (at: '${cm['at']}', who: cm['author'], text: '${t('community.replied', [_who(cm['author']).name])}: “${short(cm['text'], 80)}”', extra: null),
      for (final p in mine)
        if (_ids(p['likes']).any((x) => x != me)) (at: '${p['at']}', who: null, text: '❤️ ${t('community.likedYours', [_ids(p['likes']).where((x) => x != me).length])}: “${short(p['text'], 60)}”', extra: null),
      for (final p in mine)
        if (p['poll'] is Map && ((p['poll'] as Map)['counts'] as List? ?? const []).any((n) => n != 0))
          (at: '${p['at']}', who: null, text: '📊 ${t('community.votedYours', [((p['poll'] as Map)['counts'] as List).fold<num>(0, (a, b) => a + (b as num))])}: “${short(p['text'], 60)}”', extra: null),
    ]..sort((a, b) => b.at.compareTo(a.at));
    if (list.isEmpty) return Muted(t('community.activityEmpty'));
    return Group(
      children: [
        for (final r in list)
          Item(
            leading: r.who == null ? Glyph(I.bell) : Avatar(_who(r.who).name, size: 36),
            title: r.text,
            subtitle: r.at == '9999' ? null : fmtWhen(r.at),
            trailing: r.extra,
            onTap: r.who is int ? () => _open(context, r.who) : null,
          ),
      ],
    );
  }
}

/// Friend requests, my friends, and everyone findable in the institute (a page at a time).
class _People extends StatefulWidget {
  const _People();
  @override
  State<_People> createState() => _PeopleState();
}

class _PeopleState extends State<_People> {
  var q = '';

  @override
  Widget build(BuildContext context) {
    final me = _me;
    final blocked = _ids(_profile(me)['blocked']).toSet();
    final others = store.students.where((s) => s['id'] != me && !blocked.contains(s['id'])).toList();
    final received = others.where((s) => _status(s['id'] as int) == 'received').toList();
    final friends = _friendsOf(me);
    final needle = q.trim().toLowerCase();
    // People who chose not to be findable only show up for their friends.
    final found = others.where((s) => (_profile(s['id'])['hidden'] != true || friends.contains(s['id'])) && (needle.isEmpty || '${s['name']}'.toLowerCase().contains(needle))).toList();
    Widget row(Json s) => Item(
      leading: Avatar('${s['name']}'),
      title: '${s['name']}',
      subtitle: '${_profile(s['id'])['bio'] ?? ''}'.isNotEmpty ? '${_profile(s['id'])['bio']}' : '${s['batch'] ?? ''}',
      trailing: _FriendButton(s['id'] as int),
      onTap: () => _open(context, s['id']),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        if (received.isNotEmpty)
          Group(
            title: t('community.requests', [received.length]),
            children: [
              for (final s in received)
                Item(
                  leading: Avatar('${s['name']}'),
                  title: '${s['name']}',
                  subtitle: '${s['batch'] ?? ''}',
                  below: Wrap(
                    spacing: 8,
                    children: [
                      Doing(label: t('community.accept'), small: true, onPressed: () => _act(context, 'answerFriend', [me, s['id'], true])),
                      Doing(label: t('community.decline'), soft: true, small: true, onPressed: () => _act(context, 'answerFriend', [me, s['id'], false])),
                    ],
                  ),
                ),
            ],
          ),
        Section(t('community.myFriends', [friends.length])),
        if (friends.isEmpty) Muted(t('community.noFriends')),
        if (friends.isNotEmpty)
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [for (final id in friends) ActionChip(avatar: Avatar(_who(id).name, size: 24), label: Text(_who(id).name), onPressed: () => _open(context, id))],
          ),
        Section(t('community.people')),
        Semantics(
          container: true,
          child: TextField(onChanged: (v) => setState(() => q = v), decoration: InputDecoration(prefixIcon: Ico(I.search), hintText: t('community.searchPh'))),
        ),
        if (found.isNotEmpty) Box(flush: true, children: [Paged(items: found, row: row, resetKey: needle)]),
      ],
    );
  }
}

/// Settings & privacy: default audience, who may send requests, being findable, and the muted / blocked lists.
class _Privacy extends StatelessWidget {
  const _Privacy();
  @override
  Widget build(BuildContext context) {
    final me = _me, pr = _profile(me);
    Future<void> set(Json patch) => _act(context, 'setCommunityProfile', [me, patch]);
    Widget list(String key, String title, String undo) => Group(
      title: title,
      children: [
        if (_ids(pr[key]).isEmpty) Item(title: t('community.nobodyYet')),
        for (final id in _ids(pr[key]))
          Item(
            leading: Avatar(_who(id).name, size: 32),
            title: _who(id).name,
            trailing: Doing(label: t(undo, [_who(id).name]), soft: true, small: true, onPressed: () => _setList(context, key, id, false)),
          ),
      ],
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        Box(
          title: '🔒 ${t('community.privacyTitle')}',
          children: [
            DropdownButtonFormField<String>(
              key: ValueKey('aud-${pr['audience']}'),
              initialValue: '${pr['audience'] ?? 'all'}',
              isExpanded: true,
              decoration: InputDecoration(labelText: t('community.defaultAudience')),
              items: [for (final a in _audIcon.keys) DropdownMenuItem(value: a, child: Text(_audLabel(a)))],
              onChanged: (v) => set({'audience': v}),
            ),
            DropdownButtonFormField<String>(
              key: ValueKey('req-${pr['requests']}'),
              initialValue: '${pr['requests'] ?? 'all'}',
              isExpanded: true,
              decoration: InputDecoration(labelText: t('community.whoRequests')),
              items: [for (final (v, k) in [('all', 'reqAll'), ('batch', 'reqBatch'), ('none', 'reqNone')]) DropdownMenuItem(value: v, child: Text(t('community.$k')))],
              onChanged: (v) => set({'requests': v}),
            ),
            SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(t('community.findable')), value: pr['hidden'] != true, onChanged: (v) => set({'hidden': !v})),
          ],
        ),
        list('muted', t('community.mutedList'), 'community.unmute'),
        list('blocked', t('community.blockedList'), 'community.unblock'),
        Muted(t('community.safetyNote')),
      ],
    );
  }
}

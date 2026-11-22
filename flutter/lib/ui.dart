// The parts every screen is built from.
// Every TextField sits in Semantics(container: true): its own item for a screen reader. Without it, loose text next
// to a box is read as part of the box, and the box's pressable area grows over its neighbours.
import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';
import 'store.dart';
import 'strings.dart';
import 'views.dart';

final _changes = Listenable.merge([store, lang]);

/// Rebuilds what is inside whenever the data or the language changes.
class Live extends StatelessWidget {
  const Live(this.builder, {super.key});
  final WidgetBuilder builder;
  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _changes, builder: (context, _) => builder(context));
}

extension Look on BuildContext {
  ColorScheme get colors => Theme.of(this).colorScheme;
  TextTheme get type => Theme.of(this).textTheme;
}

// ---- dates, in the reader's language ------------------------------------------------------------------------------
String get _loc => lang.code == 'bn' ? 'bn' : 'en_GB';
String fmtDate(String s) => DateFormat('d MMM', _loc).format(toDate(s));
String fmtTime(String s) => (lang.code == 'bn' ? DateFormat.jm(_loc) : DateFormat.Hm(_loc)).format(toDate(s));
String fmtDateTime(String s) => '${DateFormat('EEE, d MMM', _loc).format(toDate(s))}, ${fmtTime(s)}';

/// Chat and notice time: the time if today, otherwise the date.
String fmtWhen(String s) => dayKey(toDate(s)) == dayKey() ? fmtTime(s) : fmtDate(s);

// ---- text ---------------------------------------------------------------------------------------------------------
class H1 extends StatelessWidget {
  const H1(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Semantics(header: true, child: Text(text, style: context.type.headlineSmall));
}

class H2 extends StatelessWidget {
  const H2(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Semantics(header: true, child: Text(text, style: context.type.titleMedium));
}

class Muted extends StatelessWidget {
  const Muted(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Text(text, style: context.type.bodySmall);
}

class Strong extends StatelessWidget {
  const Strong(this.text, {super.key, this.color});
  final String text;
  final Color? color;
  @override
  Widget build(BuildContext context) => Text(
    text,
    style: context.type.bodyMedium?.copyWith(fontWeight: FontWeight.w700, color: color),
  );
}

// ---- boxes --------------------------------------------------------------------------------------------------------
/// A white box with a soft shadow; its children sit one under another.
class Box extends StatelessWidget {
  const Box({super.key, required this.children, this.onTap, this.color, this.title});
  final List<Widget> children;
  final VoidCallback? onTap;
  final Color? color;
  final String? title;
  @override
  Widget build(BuildContext context) {
    final inside = Padding(
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, spacing: 8, children: [if (title != null) H2(title!), ...children]),
    );
    return Card(
      color: color,
      clipBehavior: Clip.antiAlias,
      child: onTap == null ? inside : InkWell(onTap: onTap, child: inside),
    );
  }
}

/// One line of a list inside a box: a rule above it, and a tap target at least 48 high when it can be pressed.
class Line extends StatelessWidget {
  const Line({super.key, required this.child, this.onTap, this.first = false});
  final Widget child;
  final VoidCallback? onTap;
  final bool first;
  @override
  Widget build(BuildContext context) {
    final row = Container(
      constraints: BoxConstraints(minHeight: onTap == null ? 0 : 48),
      decoration: first
          ? null
          : BoxDecoration(
              border: Border(top: BorderSide(color: context.colors.outlineVariant)),
            ),
      padding: const EdgeInsets.symmetric(vertical: 8),
      alignment: Alignment.centerLeft,
      child: child,
    );
    return onTap == null ? row : InkWell(onTap: onTap, child: row);
  }
}

/// A label on the left and its value on the right.
class Pair extends StatelessWidget {
  const Pair(this.label, this.value, {super.key});
  final String label, value;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 12,
      children: [
        Flexible(child: Muted(label)),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: context.type.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
        ),
      ], // a long label wraps; it never pushes the value off the screen
    ),
  );
}

/// A mark as a bar: green from 60%, red below.
class MarkBar extends StatelessWidget {
  const MarkBar(this.pct, {super.key, this.plain = false});
  final num pct;
  final bool plain;
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(4),
    child: LinearProgressIndicator(value: (pct / 100).clamp(0, 1).toDouble(), minHeight: 8, backgroundColor: context.colors.surfaceContainerHighest, color: plain || pct >= 60 ? context.colors.primary : context.colors.error),
  );
}

/// One of several: batches, children, tabs inside a page.
class Chips extends StatelessWidget {
  const Chips({super.key, required this.value, required this.options, required this.onChanged, this.labels});
  final String value;
  final List<String> options;
  final ValueChanged<String> onChanged;
  final Map<String, String>? labels;
  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 8,
    runSpacing: 4,
    children: [
      for (final o in options)
        ChoiceChip(
          label: Text(labels?[o] ?? o),
          selected: o == value,
          showCheckmark: false,
          selectedColor: context.colors.primary,
          labelStyle: TextStyle(fontWeight: FontWeight.w700, color: o == value ? context.colors.onPrimary : context.colors.onSurface),
          onSelected: (_) => onChanged(o),
        ),
    ],
  );
}

// ---- pages --------------------------------------------------------------------------------------------------------
/// A scrolling page: pull down to refresh; says when the phone is offline or a change could not be saved.
class Screen extends StatelessWidget {
  const Screen({super.key, required this.children, this.title, this.refresh = true, this.bottom, this.actions});
  final List<Widget> children;
  final String? title;
  final bool refresh;
  final Widget? bottom;
  final List<Widget>? actions;
  @override
  Widget build(BuildContext context) {
    final list = ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      itemCount: children.length,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (_, i) => children[i],
    );
    final waiting = store.waiting.length;
    return Scaffold(
      appBar: title == null ? null : AppBar(title: Text(title!), actions: actions),
      body: SafeArea(
        child: Column(
          children: [
            if (store.status == Status.offline) _Banner(waiting > 0 ? '${t('app.offline')} · ${t('app.waiting', [waiting])}' : t('app.offline'), context.colors.surfaceContainerHighest, context.colors.onSurface),
            if (store.syncFailed) _Banner(t('auth.syncFailed'), context.colors.error, context.colors.onError),
            if (waiting > 0 && store.status != Status.offline) const LinearProgressIndicator(minHeight: 3),
            Expanded(
              child: refresh ? RefreshIndicator(onRefresh: store.refresh, child: list) : list,
            ),
            ?bottom,
          ],
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner(this.text, this.bg, this.fg);
  final String text;
  final Color bg, fg;
  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Container(
      width: double.infinity,
      color: bg,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: TextStyle(color: fg, fontWeight: FontWeight.w600),
      ),
    ),
  );
}

class Loading extends StatelessWidget {
  const Loading({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(child: CircularProgressIndicator(semanticsLabel: t('common.loading'))),
  );
}

/// The bottom tabs of an app. Each tab keeps its place (scroll, what was typed) while another is open.
class Tabs extends StatefulWidget {
  const Tabs(this.tabs, {super.key});
  final List<({IconData icon, String label, Widget page})> tabs;
  @override
  State<Tabs> createState() => _TabsState();
}

class _TabsState extends State<Tabs> {
  var at = 0;
  final opened = {0}; // a tab is built the first time it is opened, then kept
  @override
  Widget build(BuildContext context) => Scaffold(
    body: IndexedStack(index: at, children: [for (final (i, tab) in widget.tabs.indexed) opened.contains(i) ? tab.page : const SizedBox.shrink()]),
    bottomNavigationBar: NavigationBar(
      selectedIndex: at,
      onDestinationSelected: (i) => setState(() => opened.add(at = i)),
      destinations: [for (final tab in widget.tabs) NavigationDestination(icon: Icon(tab.icon), label: tab.label)],
    ),
  );
}

// ---- long lists: 10, 20, 50 or 100 rows a page, with numbered pages ------------------------------------------------
class Paged<T> extends StatefulWidget {
  const Paged({super.key, required this.items, required this.row, this.resetKey = ''});
  final List<T> items;
  final Widget Function(T item, bool first) row;

  /// When this changes (another batch, a new search) the list starts again from page 1.
  final String resetKey;
  @override
  State<Paged<T>> createState() => _PagedState<T>();
}

class _PagedState<T> extends State<Paged<T>> {
  var page = 1;
  @override
  void didUpdateWidget(Paged<T> old) {
    super.didUpdateWidget(old);
    if (old.resetKey != widget.resetKey) page = 1;
  }

  @override
  Widget build(BuildContext context) {
    final all = widget.items.length, size = store.pageSize;
    if (all <= pageSizes.first) return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (var i = 0; i < all; i++) widget.row(widget.items[i], i == 0)]);
    final pages = (all / size).ceil();
    final at = page.clamp(1, pages); // the list got shorter: the last page, not an empty one
    final from = (at - 1) * size, to = from + size > all ? all : from + size;
    final c = context.colors;
    Widget number(int n) => n == 0
        ? const SizedBox(width: 24, height: 48, child: Center(child: Text('…')))
        : Semantics(
            label: t('pager.page', [n]),
            selected: n == at,
            button: true,
            excludeSemantics: true,
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () => setState(() => page = n),
              child: Container(
                constraints: const BoxConstraints(minWidth: 48, minHeight: 48), // the pressable area; the coloured pill inside is smaller
                alignment: Alignment.center,
                child: Container(
                  constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: n == at ? c.primary : null, borderRadius: BorderRadius.circular(10)),
                  child: Text(
                    localNumber(n, lang.code),
                    style: TextStyle(fontWeight: FontWeight.w700, color: n == at ? c.onPrimary : c.onSurface),
                  ),
                ),
              ),
            ),
          );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = from; i < to; i++) widget.row(widget.items[i], i == from),
        const Divider(),
        Semantics(
          container: true,
          label: t('pager.label'),
          child: Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 8,
            children: [
              Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 8,
                children: [
                  Muted(t('pager.show')),
                  DropdownButton<int>(
                    value: size,
                    underline: const SizedBox(),
                    items: [for (final n in pageSizes) DropdownMenuItem(value: n, child: Text(localNumber(n, lang.code)))],
                    onChanged: (n) => setState(() {
                      page = from ~/ n! + 1; // the first row on screen stays on screen
                      store.pageSize = n;
                    }),
                  ),
                  Muted(t('pager.range', [from + 1, to, all])),
                ],
              ),
              Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  IconButton(tooltip: t('pager.prev'), onPressed: at > 1 ? () => setState(() => page = at - 1) : null, icon: const Icon(Icons.chevron_left)),
                  for (final n in pageNumbers(at, pages)) number(n),
                  IconButton(tooltip: t('pager.next'), onPressed: at < pages ? () => setState(() => page = at + 1) : null, icon: const Icon(Icons.chevron_right)),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ---- small helpers ------------------------------------------------------------------------------------------------
void toast(BuildContext context, String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

Future<bool> confirm(BuildContext context, String title, String body, {String? yes}) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(t('app.cancel'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(yes ?? t('app.yes'))),
        ],
      ),
    ) ??
    false;

/// Open a web link or a stored file in the phone's browser or viewer.
Future<void> openLink(BuildContext context, String url) async {
  final link = await fileLink(url);
  final ok = link != null && await launchUrl(Uri.parse(link), mode: LaunchMode.externalApplication).catchError((_) => false);
  if (!ok && context.mounted) toast(context, t('app.noFile'));
}

void push(BuildContext context, Widget page) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page));

/// A button that shows it is working until its job is finished (and can't be pressed twice meanwhile).
class Doing extends StatefulWidget {
  const Doing({super.key, required this.label, required this.onPressed, this.icon, this.soft = false, this.danger = false});
  final String label;
  final Future<void> Function()? onPressed;
  final IconData? icon;
  final bool soft, danger;
  @override
  State<Doing> createState() => _DoingState();
}

class _DoingState extends State<Doing> {
  var busy = false;
  Future<void> run() async {
    setState(() => busy = true);
    try {
      await widget.onPressed!();
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final go = busy || widget.onPressed == null ? null : run;
    final child = Row(
      mainAxisSize: MainAxisSize.min,
      spacing: 8,
      children: [
        if (busy) const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.5)) else if (widget.icon != null) Icon(widget.icon, size: 20),
        Flexible(child: Text(widget.label, textAlign: TextAlign.center)),
      ],
    );
    if (widget.soft) return OutlinedButton(onPressed: go, child: child);
    return FilledButton(
      onPressed: go,
      style: widget.danger ? FilledButton.styleFrom(backgroundColor: context.colors.error, foregroundColor: context.colors.onError) : null,
      child: child,
    );
  }
}

/// Profile tab for every app: details, language, log out.
class Profile extends StatelessWidget {
  const Profile({super.key, required this.rows, this.note});
  final List<(String, String)> rows;
  final String? note;
  @override
  Widget build(BuildContext context) => Screen(
    refresh: false,
    children: [
      H1(t('app.tabs.profile')),
      Box(
        children: [
          for (final (label, value) in [...rows, (t('auth.email'), store.email ?? '')])
            if (value.isNotEmpty) Pair(label, value),
          if (note != null) Muted(note!),
        ],
      ),
      Box(
        title: t('app.language'),
        children: [
          Chips(value: lang.code, options: const ['en', 'bn'], labels: const {'en': 'English', 'bn': 'বাংলা'}, onChanged: store.setLang),
        ],
      ),
      Doing(label: t('app.logOut'), icon: Icons.logout, danger: true, onPressed: store.signOut),
    ],
  );
}

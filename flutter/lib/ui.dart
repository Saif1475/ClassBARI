// The parts every screen is built from, in the website's phone look: a softly glowing page, a glass bar on top with
// the page's name, big rounded cards holding tinted rows, raised green buttons and a tab bar with a glass pill.
// Every TextField sits in Semantics(container: true): its own item for a screen reader. Without it, loose text next
// to a box is read as part of the box, and the box's pressable area grows over its neighbours.
import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';
import 'config.dart';
import 'store.dart';
import 'strings.dart';
import 'theme.dart';
import 'views.dart';

export 'theme.dart' show Look, Tone, lit;

final _changes = Listenable.merge([store, lang]);

/// Rebuilds what is inside whenever the data or the language changes.
class Live extends StatelessWidget {
  const Live(this.builder, {super.key});
  final WidgetBuilder builder;
  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _changes, builder: (context, _) => builder(context));
}

// ---- dates, in the reader's language ------------------------------------------------------------------------------
String get _loc => lang.code == 'bn' ? 'bn' : 'en_GB';
String fmtDate(String s) => DateFormat('d MMM', _loc).format(toDate(s));
String fmtTime(String s) => (lang.code == 'bn' ? DateFormat.jm(_loc) : DateFormat.Hm(_loc)).format(toDate(s));
String fmtDateTime(String s) => '${DateFormat('EEE, d MMM', _loc).format(toDate(s))}, ${fmtTime(s)}';

/// Chat and notice time: the time if today, otherwise the date.
String fmtWhen(String s) => dayKey(toDate(s)) == dayKey() ? fmtTime(s) : fmtDate(s);

// ---- text ---------------------------------------------------------------------------------------------------------
/// The big name of a page, with an optional small line above it ("Hello, Rahim").
class H1 extends StatelessWidget {
  const H1(this.text, {super.key, this.kicker});
  final String text;
  final String? kicker;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      if (kicker != null && kicker!.isNotEmpty) Text(kicker!, style: context.type.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant)),
      Semantics(header: true, child: Text(text, style: context.type.headlineMedium)),
    ],
  );
}

class H2 extends StatelessWidget {
  const H2(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Semantics(header: true, child: Text(text, style: context.type.titleLarge));
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
    style: context.type.bodyMedium?.copyWith(fontSize: 16, fontWeight: FontWeight.w700, color: color),
  );
}

/// A big number or amount.
class Big extends StatelessWidget {
  const Big(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Text(text, style: context.type.headlineSmall);
}

/// A small coloured label: "New", a count.
class Tag extends StatelessWidget {
  const Tag(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(color: context.colors.tertiaryContainer, borderRadius: BorderRadius.circular(10)),
    child: Text(
      text,
      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: context.colors.onTertiaryContainer),
    ),
  );
}

/// An icon in its own soft square, at the start of a row.
class Glyph extends StatelessWidget {
  const Glyph(this.icon, {super.key});
  final IconData icon;
  @override
  Widget build(BuildContext context) => Container(
    width: 42,
    height: 42,
    decoration: BoxDecoration(color: context.colors.primaryContainer.withValues(alpha: 0.7), borderRadius: BorderRadius.circular(12)),
    child: Icon(icon, size: 22, color: context.colors.onPrimaryContainer),
  );
}

// ---- the page behind everything -----------------------------------------------------------------------------------
/// The page colour with the website's soft glows: green from the top left, warm from the top right.
/// shortcut: plain gradients, no blur behind cards (the website also drops the blur on phones: it makes cheap phones stutter).
class Backdrop extends StatelessWidget {
  const Backdrop({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final g = context.tone.glows;
    Widget glow(Alignment at, Color c) => Positioned.fill(
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: RadialGradient(center: at, radius: 1.25, colors: [c, c.withValues(alpha: 0)]),
        ),
      ),
    );
    return ColoredBox(
      color: context.colors.surface,
      child: Stack(
        children: [
          if (g.isNotEmpty) ...[glow(const Alignment(-0.76, -0.8), g[0]), glow(const Alignment(0.76, -0.72), g[1]), glow(const Alignment(0.6, 0.7), g[0]), glow(const Alignment(-0.64, 0.64), g[2])],
          Positioned.fill(child: child),
        ],
      ),
    );
  }
}

// ---- boxes --------------------------------------------------------------------------------------------------------
const _cardCorner = BorderRadius.all(Radius.circular(24));
const _tileCorner = BorderRadius.all(Radius.circular(14));

/// A white card lifted off the page; its children sit one under another. `hero`: the deep green "today" card.
class Box extends StatelessWidget {
  const Box({super.key, required this.children, this.onTap, this.color, this.title, this.hero = false});
  final List<Widget> children;
  final VoidCallback? onTap;
  final Color? color;
  final String? title;
  final bool hero;
  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    Widget inside = Padding(
      padding: const EdgeInsets.all(18),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, spacing: 10, children: [if (title != null) H2(title!), ...children]),
    );
    if (hero) {
      // Everything on the green card is written in white.
      final ink = dark ? context.colors.onSurface : Colors.white;
      inside = _OnHero(
        child: Theme(
          data: Theme.of(context).copyWith(
            textTheme: context.type.apply(bodyColor: ink, displayColor: ink),
            iconTheme: IconThemeData(color: ink),
          ),
          child: inside,
        ),
      );
    }
    return Semantics(
      container: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: hero ? null : (color ?? context.colors.surfaceContainerLowest),
          gradient: hero ? LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: context.tone.hero) : null,
          borderRadius: _cardCorner,
          border: Border.all(color: Colors.white.withValues(alpha: dark ? 0.06 : (hero ? 0.25 : 0.8))),
          boxShadow: context.tone.lift,
        ),
        child: Material(
          type: MaterialType.transparency,
          borderRadius: _cardCorner,
          clipBehavior: Clip.antiAlias,
          child: onTap == null ? inside : InkWell(onTap: onTap, child: inside),
        ),
      ),
    );
  }
}

/// Marks what is inside as sitting on the green card, so rows and buttons there draw themselves for it.
class _OnHero extends InheritedWidget {
  const _OnHero({required super.child});
  static bool of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<_OnHero>() != null;
  @override
  bool updateShouldNotify(_OnHero old) => false;
}

/// One row inside a card: a softly tinted, rounded strip, at least 52 high so it is easy to press.
class Line extends StatelessWidget {
  const Line({super.key, required this.child, this.onTap});
  final Widget child;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final row = Container(constraints: const BoxConstraints(minHeight: 52), padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10), alignment: Alignment.centerLeft, child: child);
    final tile = Material(
      color: _OnHero.of(context) ? Colors.white.withValues(alpha: 0.14) : context.tone.tile,
      borderRadius: _tileCorner,
      clipBehavior: Clip.antiAlias,
      child: onTap == null ? row : InkWell(onTap: onTap, child: row),
    );
    // A row that can be pressed is one button for a screen reader, named by what it shows.
    return onTap == null ? tile : Semantics(container: true, button: true, child: tile);
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

/// A mark or progress as a thick rounded bar: green from 60%, red below (`plain`: always green).
class MarkBar extends StatelessWidget {
  const MarkBar(this.pct, {super.key, this.plain = false});
  final num pct;
  final bool plain;
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(6),
    child: LinearProgressIndicator(value: (pct / 100).clamp(0, 1).toDouble(), minHeight: 10, backgroundColor: context.tone.tile, color: plain || pct >= 60 ? context.colors.primary : context.colors.error),
  );
}

/// One of several (batches, children, tabs inside a page): a sunken track with the chosen one raised and green.
class Chips extends StatelessWidget {
  const Chips({super.key, required this.value, required this.options, required this.onChanged, this.labels});
  final String value;
  final List<String> options;
  final ValueChanged<String> onChanged;
  final Map<String, String>? labels;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: context.tone.tile, borderRadius: _tileCorner),
        child: Wrap(
          spacing: 4,
          runSpacing: 4,
          children: [
            for (final o in options)
              Semantics(
                container: true,
                button: true,
                selected: o == value,
                child: InkWell(
                  borderRadius: BorderRadius.circular(11),
                  onTap: () => onChanged(o),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 48, minWidth: 64),
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: o == value ? _raised(c.primary, context) : null,
                    child: Center(
                      widthFactor: 1,
                      child: Text(
                        labels?[o] ?? o,
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: o == value ? c.onPrimary : c.onSurfaceVariant),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// The website's raised, lit piece of colour: lighter at the top, with a soft shadow of its own colour underneath.
BoxDecoration _raised(Color color, BuildContext context, {double corner = 11}) => BoxDecoration(
  gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [lit(color, 0.16), color]),
  borderRadius: BorderRadius.circular(corner),
  border: Border.all(color: Colors.white.withValues(alpha: Theme.of(context).brightness == Brightness.dark ? 0.12 : 0.3)),
  boxShadow: [
    BoxShadow(color: color.withValues(alpha: 0.45), blurRadius: 18, spreadRadius: -10, offset: const Offset(0, 8)),
    const BoxShadow(color: Color(0x2E002824), blurRadius: 2, offset: Offset(0, 1)),
  ],
);

// ---- pages --------------------------------------------------------------------------------------------------------
/// Tells a page which tab it lives in, so its top bar can show the tab's name and its avatar can open the profile.
class TabScope extends InheritedWidget {
  const TabScope({super.key, required this.label, required this.openProfile, required super.child});
  final String label;
  final VoidCallback openProfile;
  static TabScope? of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<TabScope>();
  @override
  bool updateShouldNotify(TabScope old) => old.label != label;
}

String get _myName => switch (kApp) {
  'guardian' => '${store.children.firstOrNull?['guardianName'] ?? ''}',
  'teacher' || 'institute' => store.staffName,
  _ => '${store.me?['name'] ?? ''}',
};
String get _myPlace => switch (kApp) {
  'guardian' => '${store.child?['name'] ?? ''}',
  'teacher' || 'institute' => '${store.state?['instituteName'] ?? ''}',
  _ => '${store.me?['batch'] ?? ''}',
};

/// The glass bar at the top of every page: back or the app's mark, the page's name, and the person's initial.
class TopBar extends StatelessWidget {
  const TopBar({super.key, required this.title, this.actions, this.leading});
  final String title;
  final List<Widget>? actions;
  final Widget? leading;
  @override
  Widget build(BuildContext context) {
    final c = context.colors, scope = TabScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final staff = kApp == 'teacher' || kApp == 'institute';
    final place = scope == null ? '' : _myPlace, initial = _myName.trim().isEmpty ? '' : _myName.trim().characters.first.toUpperCase();
    return Container(
      decoration: BoxDecoration(
        color: context.tone.glass,
        border: Border(
          bottom: BorderSide(color: Colors.white.withValues(alpha: dark ? 0.08 : 0.72)),
        ),
      ),
      padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
      child: SizedBox(
        height: 60,
        child: Row(
          children: [
            const SizedBox(width: 6),
            leading ??
                (Navigator.canPop(context)
                    ? const BackButton()
                    : Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: Image.asset('assets/icons/$kApp.png', width: 34, height: 34, semanticLabel: ''),
                        ),
                      )),
            const SizedBox(width: 4),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: 0.2, color: c.onSurface),
                  ),
                  if (place.isNotEmpty)
                    Text(
                      place,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, color: c.onSurfaceVariant),
                    ),
                ],
              ),
            ),
            ...?actions,
            if (scope != null && initial.isNotEmpty)
              // The person's initial, as on the website: a warm circle for families, a green square for staff. Opens the profile.
              Semantics(
                container: true,
                button: true,
                label: t('app.tabs.profile'),
                excludeSemantics: true,
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: scope.openProfile,
                  child: Padding(
                    padding: const EdgeInsets.all(8),
                    child: Container(
                      width: 40,
                      height: 40,
                      alignment: Alignment.center,
                      decoration: staff ? _raised(c.primary, context, corner: 12) : BoxDecoration(color: c.tertiaryContainer, shape: BoxShape.circle, boxShadow: context.tone.lift),
                      child: Text(
                        initial,
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: staff ? c.onPrimary : c.onTertiaryContainer),
                      ),
                    ),
                  ),
                ),
              ),
            const SizedBox(width: 6),
          ],
        ),
      ),
    );
  }
}

/// A scrolling page: pull down to refresh; says when the phone is offline or a change could not be saved.
class Screen extends StatelessWidget {
  const Screen({super.key, required this.children, this.title, this.refresh = true, this.bottom, this.actions});
  final List<Widget> children;

  /// The name in the top bar. Left out on a tab's own page, which shows the tab's name.
  final String? title;
  final bool refresh;
  final Widget? bottom;
  final List<Widget>? actions;
  @override
  Widget build(BuildContext context) {
    final list = ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(16, 16, 16, 32 + MediaQuery.paddingOf(context).bottom),
      itemCount: children.length,
      separatorBuilder: (_, _) => const SizedBox(height: 16),
      itemBuilder: (_, i) => children[i],
    );
    final waiting = store.waiting.length;
    return Backdrop(
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: Column(
          children: [
            TopBar(title: title ?? TabScope.of(context)?.label ?? kAppName, actions: actions),
            if (store.status == Status.offline) _Banner(waiting > 0 ? '${t('app.offline')} · ${t('app.waiting', [waiting])}' : t('app.offline'), context.colors.surfaceContainerHighest, context.colors.onSurface),
            if (store.syncFailed) _Banner(t('auth.syncFailed'), context.colors.error, context.colors.onError),
            if (waiting > 0 && store.status != Status.offline) const LinearProgressIndicator(minHeight: 3),
            Expanded(
              child: MediaQuery.removePadding(
                context: context,
                removeTop: true,
                child: refresh ? RefreshIndicator(onRefresh: store.refresh, child: list) : list,
              ),
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
  Widget build(BuildContext context) => Backdrop(
    child: Scaffold(
      backgroundColor: Colors.transparent,
      body: Center(child: CircularProgressIndicator(semanticsLabel: t('common.loading'))),
    ),
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
  void open(int i) => setState(() => opened.add(at = i));

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      body: IndexedStack(
        index: at,
        children: [for (final (i, tab) in widget.tabs.indexed) opened.contains(i) ? TabScope(label: tab.label, openProfile: () => open(widget.tabs.length - 1), child: tab.page) : const SizedBox.shrink()],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: context.tone.tile,
          border: Border(
            top: BorderSide(color: Colors.white.withValues(alpha: dark ? 0.08 : 0.7)),
          ),
        ),
        padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom, left: 4, right: 4),
        child: SizedBox(
          height: 70,
          child: Row(
            children: [for (final (i, tab) in widget.tabs.indexed) TabItem(index: i, icon: tab.icon, label: tab.label, on: i == at, onTap: () => open(i))],
          ),
        ),
      ),
    );
  }
}

/// One tab of the bottom bar: its icon sits in a raised glass pill when it is the open one.
class TabItem extends StatelessWidget {
  const TabItem({super.key, required this.index, required this.icon, required this.label, required this.on, required this.onTap});
  final int index;
  final IconData icon;
  final String label;
  final bool on;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Expanded(
      child: Semantics(
        container: true,
        identifier: 'tab-$index',
        button: true,
        selected: on,
        label: label,
        excludeSemantics: true,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            spacing: 4,
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                width: 56,
                height: 32,
                decoration: on
                    ? BoxDecoration(
                        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [lit(c.primaryContainer, dark ? 0.12 : 0.55), c.primaryContainer]),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.white.withValues(alpha: dark ? 0.18 : 0.75)),
                        boxShadow: const [
                          BoxShadow(color: Color(0x2E002824), blurRadius: 2, offset: Offset(0, 1)),
                          BoxShadow(color: Color(0x59003C36), blurRadius: 16, spreadRadius: -8, offset: Offset(0, 8)),
                        ],
                      )
                    : null,
                child: Icon(icon, size: 22, color: on ? c.onPrimaryContainer : c.onSurfaceVariant),
              ),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 11.5, fontWeight: on ? FontWeight.w800 : FontWeight.w600, color: on ? c.onSurface : c.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---- long lists: 10, 20, 50 or 100 rows a page, with numbered pages ------------------------------------------------
class Paged<T> extends StatefulWidget {
  const Paged({super.key, required this.items, required this.row, this.resetKey = ''});
  final List<T> items;
  final Widget Function(T item) row;

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
    if (all <= pageSizes.first) return Column(crossAxisAlignment: CrossAxisAlignment.stretch, spacing: 10, children: [for (final item in widget.items) widget.row(item)]);
    final pages = (all / size).ceil();
    final at = page.clamp(1, pages); // the list got shorter: the last page, not an empty one
    final from = (at - 1) * size, to = from + size > all ? all : from + size;
    final c = context.colors;
    Widget number(int n) => n == 0
        ? const SizedBox(width: 24, height: 48, child: Center(child: Text('…')))
        : Semantics(
            container: true,
            label: t('pager.page', [n]),
            selected: n == at,
            button: true,
            excludeSemantics: true,
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => setState(() => page = n),
              child: Container(
                constraints: const BoxConstraints(minWidth: 48, minHeight: 48), // the pressable area; the coloured pill inside is smaller
                alignment: Alignment.center,
                child: Container(
                  constraints: const BoxConstraints(minWidth: 38, minHeight: 38),
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  alignment: Alignment.center,
                  decoration: n == at ? _raised(c.primary, context) : null,
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
      spacing: 10,
      children: [
        for (var i = from; i < to; i++) widget.row(widget.items[i]),
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
                    borderRadius: _tileCorner,
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

/// The app's button: raised and green (`soft`: white with green words; `danger`: red). On the green card it turns
/// white by itself. It shows it is working until its job is finished, and can't be pressed twice meanwhile.
class Doing extends StatefulWidget {
  const Doing({super.key, required this.label, required this.onPressed, this.icon, this.soft = false, this.danger = false, this.small = false});
  final String label;
  final Future<void> Function()? onPressed;
  final IconData? icon;
  final bool soft, danger, small;
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
    final c = context.colors, onHero = _OnHero.of(context);
    final can = !busy && widget.onPressed != null;
    final flat = widget.soft || onHero;
    final fill = widget.danger ? c.error : c.primary;
    final ink = onHero ? context.tone.hero.last : (widget.soft ? c.primary : (widget.danger ? c.onError : c.onPrimary));
    return Opacity(
      opacity: widget.onPressed == null ? 0.5 : 1,
      child: DecoratedBox(
        decoration: flat
            ? BoxDecoration(
                color: onHero ? Colors.white.withValues(alpha: 0.94) : c.surfaceContainerLowest,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: c.outlineVariant.withValues(alpha: onHero ? 0 : 1)),
                boxShadow: context.tone.lift,
              )
            : _raised(fill, context, corner: 12),
        child: Material(
          type: MaterialType.transparency,
          borderRadius: BorderRadius.circular(12),
          clipBehavior: Clip.antiAlias,
          child: Semantics(
            container: true,
            button: true,
            enabled: can,
            child: InkWell(
              onTap: can ? run : null,
              child: Container(
                constraints: BoxConstraints(minHeight: widget.small ? 48 : 54, minWidth: 48),
                padding: EdgeInsets.symmetric(horizontal: widget.small ? 14 : 18, vertical: 10),
                child: Row(
                  mainAxisSize: widget.small ? MainAxisSize.min : MainAxisSize.max,
                  mainAxisAlignment: MainAxisAlignment.center,
                  spacing: 8,
                  children: [
                    if (busy) SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.5, color: ink)) else if (widget.icon != null) Icon(widget.icon, size: 20, color: ink),
                    Flexible(
                      child: Text(
                        widget.label,
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: widget.small ? 15 : 16.5, fontWeight: FontWeight.w700, letterSpacing: 0.2, color: ink),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
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
      H1(_myName.isEmpty ? t('app.tabs.profile') : _myName, kicker: kAppName),
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

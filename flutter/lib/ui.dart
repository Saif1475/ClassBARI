// The parts every screen is built from. The look follows the learning apps students already know: a quiet page, a
// dashboard of coloured course cards, plain lists with a coloured icon per row, a simple tab bar and a side menu
// for the person's own details.
// Every TextField sits in Semantics(container: true): its own item for a screen reader. Without it, loose text next
// to a box is read as part of the box, and the box's pressable area grows over its neighbours.
import 'dart:ui' show ImageFilter;

import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';
import 'config.dart';
import 'push.dart';
import 'screens/settings.dart';
import 'store.dart';
import 'strings.dart';
import 'theme.dart';
import 'views.dart';
import 'icon.dart';
import 'icons.g.dart';

export 'theme.dart' show Look, Tone, lit, deep;

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

/// The month and year: "November 2026".
String fmtMonth(String s) => DateFormat('MMMM y', _loc).format(toDate(s));
String fmtDateTime(String s) => '${DateFormat('EEE, d MMM', _loc).format(toDate(s))}, ${fmtTime(s)}';

/// Chat and notice time: the time if today, otherwise the date.
String fmtWhen(String s) => dayKey(toDate(s)) == dayKey() ? fmtTime(s) : fmtDate(s);

// ---- text ---------------------------------------------------------------------------------------------------------
/// The big line at the top of a page, with an optional small line above it ("Hello, Rahim").
class H1 extends StatelessWidget {
  const H1(this.text, {super.key, this.kicker});
  final String text;
  final String? kicker;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      if (kicker != null && kicker!.isNotEmpty) Text(kicker!, style: context.type.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
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

/// The small grey heading above a group of rows ("OVERDUE", "CHAPTERS").
class Section extends StatelessWidget {
  const Section(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 4, top: 6),
    // Bangla is never spaced out (and has no capitals).
    child: Semantics(header: true, child: Text(text.toUpperCase(), style: lang.code == 'bn' ? context.type.labelSmall?.copyWith(letterSpacing: 0) : context.type.labelSmall)),
  );
}

class Muted extends StatelessWidget {
  const Muted(this.text, {super.key, this.lines});
  final String text;
  final int? lines;
  @override
  Widget build(BuildContext context) => Text(text, maxLines: lines, overflow: lines == null ? null : TextOverflow.ellipsis, style: context.type.bodySmall);
}

class Strong extends StatelessWidget {
  const Strong(this.text, {super.key, this.color});
  final String text;
  final Color? color;
  @override
  Widget build(BuildContext context) => Text(text, style: context.type.titleMedium?.copyWith(color: color));
}

/// A big number or amount.
class Big extends StatelessWidget {
  const Big(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Text(text, style: context.type.headlineSmall);
}

/// A small label: "New", a count, or a state ("Submitted" in green, "Overdue" in red).
class Tag extends StatelessWidget {
  const Tag(this.text, {super.key, this.kind = 'note'});
  final String text;

  /// note (warm), ok (green), bad (red), plain (grey).
  final String kind;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (bg, fg) = switch (kind) {
      'ok' => (c.primaryContainer, c.onPrimaryContainer),
      'bad' => (c.errorContainer, c.onErrorContainer),
      'plain' => (context.tone.tile, c.onSurfaceVariant),
      _ => (c.tertiaryContainer, c.onTertiaryContainer),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
      child: Text(
        text,
        style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: fg),
      ),
    );
  }
}

/// An icon in its own soft rounded square, in the row's colour.
class Glyph extends StatelessWidget {
  const Glyph(this.icon, {super.key, this.color});
  final CbIcon icon;
  final Color? color;
  @override
  Widget build(BuildContext context) {
    final onHero = _OnHero.of(context);
    final tint = color ?? context.colors.primary;
    // On dark pages a course colour is lightened so the icon still stands out from its square.
    final ink = onHero ? Colors.white : (context.dark ? lit(tint, 0.45) : tint);
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        color: onHero ? Colors.white.withValues(alpha: 0.18) : tint.withValues(alpha: context.dark ? 0.24 : 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Ico(icon, size: 22, color: ink),
    );
  }
}

// ---- the glass effect (Settings → Glass effect) ----------------------------------------------------------------------
/// The page behind everything: warm paper. Only the highest glass level ("Crystal") washes it faintly with the brand
/// colours, as the website does, so the frosted bars have something to frost. Painted once per page.
class Backdrop extends StatelessWidget {
  const Backdrop({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final g = context.tone.glass, b = context.tone.blobs;
    // Off draws no gradient, but the boxes stay: moving the slider must not rebuild the page (its scroll, what was typed).
    RadialGradient? blob(Alignment at, Color c, double strength, [double radius = 1.1]) => g < 0.99
        ? null
        : RadialGradient(
            center: at,
            radius: radius,
            colors: [
              c.withValues(alpha: g * strength),
              c.withValues(alpha: 0),
            ],
            stops: const [0, 0.7],
          );
    return ColoredBox(
      color: context.colors.surface, // a gradient replaces a decoration's colour, so the page colour goes underneath
      child: DecoratedBox(
        decoration: BoxDecoration(gradient: blob(const Alignment(-1, -1), b[0], 0.9)),
        child: DecoratedBox(
          decoration: BoxDecoration(gradient: blob(const Alignment(1, -0.6), b[1], 0.8)),
          child: DecoratedBox(
            decoration: BoxDecoration(gradient: blob(const Alignment(0.6, 1), b[2], 0.7, 1.2)),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// A bar or panel's fill with the glass effect (floating chrome only, never a card): 90%, 78% or 64% of the colour.
Color glassFill(BuildContext context, Color solid) => solid.withValues(alpha: solid.a * (1 - context.tone.glass * 0.36));

// ---- cards and rows -----------------------------------------------------------------------------------------------
const _cardCorner = BorderRadius.all(Radius.circular(20));

/// A white paper card with a hairline border (always solid: glass is for the bars, never for content); its children
/// sit one under another. `hero`: the brand-coloured summary card. `flush`: no padding, for a card made of rows.
class Box extends StatelessWidget {
  const Box({super.key, required this.children, this.onTap, this.color, this.title, this.hero = false, this.flush = false});
  final List<Widget> children;
  final VoidCallback? onTap;
  final Color? color;
  final String? title;
  final bool hero, flush;
  @override
  Widget build(BuildContext context) {
    Widget inside = Padding(
      padding: flush ? EdgeInsets.zero : const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, spacing: flush ? 0 : 10, children: [if (title != null) H2(title!), ...children]),
    );
    if (hero) {
      // Everything on the coloured card is written in white.
      final ink = context.dark ? context.colors.onSurface : Colors.white;
      inside = _OnHero(
        child: Theme(
          data: Theme.of(context).copyWith(
            textTheme: context.type.apply(bodyColor: ink, displayColor: ink),
            iconTheme: IconThemeData(color: ink),
            dividerTheme: DividerThemeData(color: ink.withValues(alpha: 0.18), space: 1, thickness: 1),
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
          gradient: hero ? LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: context.tone.hero) : null,
          borderRadius: _cardCorner,
          border: hero || color != null ? null : Border.all(color: context.colors.outlineVariant),
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

/// Marks what is inside as sitting on the coloured card, so icons and buttons there draw themselves for it.
class _OnHero extends InheritedWidget {
  const _OnHero({required super.child});
  static bool of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<_OnHero>() != null;
  @override
  bool updateShouldNotify(_OnHero old) => false;
}

/// One row of a list: a coloured icon, a title with a quieter line under it, and something at the end (an arrow when
/// the row opens something). At least 56 high, so it is easy to press.
class Item extends StatelessWidget {
  const Item({super.key, required this.title, this.subtitle, this.icon, this.color, this.leading, this.trailing, this.below, this.onTap});
  final String title;
  final String? subtitle;
  final CbIcon? icon;
  final Color? color;
  final Widget? leading, trailing, below;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final row = ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 56),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          spacing: 12,
          children: [
            ?(leading ?? (icon == null ? null : Glyph(icon!, color: color))),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                spacing: 2,
                children: [
                  Text(title, style: context.type.titleMedium),
                  if (subtitle != null && subtitle!.isNotEmpty) Muted(subtitle!),
                  if (below != null) Padding(padding: const EdgeInsets.only(top: 4), child: below),
                ],
              ),
            ),
            // What sits at the end never takes more than about a third of the row: a long label wraps instead of pushing the title out.
            if (trailing != null) ConstrainedBox(constraints: const BoxConstraints(maxWidth: 132), child: trailing) else if (onTap != null) Ico(I.chevronRight, color: context.colors.onSurfaceVariant),
          ],
        ),
      ),
    );
    // A row that can be pressed is one button for a screen reader, named by what it shows.
    return onTap == null
        ? row
        : Semantics(
            container: true,
            button: true,
            child: InkWell(onTap: onTap, child: row),
          );
  }
}

/// Rows in one white card, with a hairline between them and an optional small heading above.
class Group extends StatelessWidget {
  const Group({super.key, required this.children, this.title});
  final List<Widget> children;
  final String? title;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: 8,
    children: [
      if (title != null) Section(title!),
      Box(
        flush: true,
        children: [
          for (final (i, child) in children.indexed) ...[if (i > 0) const Divider(indent: 14, endIndent: 14), child],
        ],
      ),
    ],
  );
}

/// A course on the dashboard: a block of its own colour on top, its name and how far along it is underneath.
class CourseCard extends StatelessWidget {
  const CourseCard({super.key, required this.color, required this.title, this.subtitle, this.progress, this.icon = I.book, this.badge, this.onTap});
  final Color color;
  final String title;
  final String? subtitle, badge;
  final num? progress;
  final CbIcon icon;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Semantics(
    container: true,
    button: onTap != null,
    child: DecoratedBox(
      decoration: BoxDecoration(color: context.colors.surfaceContainerLowest, borderRadius: _cardCorner, boxShadow: context.tone.lift),
      child: Material(
        type: MaterialType.transparency,
        borderRadius: _cardCorner,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                height: 76,
                decoration: BoxDecoration(
                  gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [lit(color, 0.12), deep(color, 0.12)]),
                ),
                child: Stack(
                  children: [
                    Positioned(right: -10, bottom: -14, child: Ico(icon, size: 84, color: Colors.white.withValues(alpha: 0.22))),
                    if (badge != null) Positioned(left: 10, top: 10, child: Tag(badge!)),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  spacing: 4,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: context.type.titleMedium?.copyWith(color: context.dark ? lit(color, 0.5) : color, fontWeight: FontWeight.w800),
                    ),
                    if (subtitle != null) Muted(subtitle!, lines: 2),
                    if (progress != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: MarkBar(progress!, color: color),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

/// Cards two to a row (one to a row when the letters are set very large).
class CardGrid extends StatelessWidget {
  const CardGrid(this.cards, {super.key});
  final List<Widget> cards;
  @override
  Widget build(BuildContext context) {
    final per = MediaQuery.textScalerOf(context).scale(10) <= 13 ? 2 : 1;
    return Column(
      spacing: 12,
      children: [
        for (var i = 0; i < cards.length; i += per)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 12,
              children: [for (var k = i; k < i + per; k++) Expanded(child: k < cards.length ? cards[k] : const SizedBox.shrink())],
            ),
          ),
      ],
    );
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
        ConstrainedBox(constraints: const BoxConstraints(maxWidth: 130), child: Muted(label)),
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

/// A mark or progress as a rounded bar: green from 60%, red below (`plain` or a `color`: always that colour).
class MarkBar extends StatelessWidget {
  const MarkBar(this.pct, {super.key, this.plain = false, this.color});
  final num pct;
  final bool plain;
  final Color? color;
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(5),
    child: LinearProgressIndicator(
      value: (pct / 100).clamp(0, 1).toDouble(),
      minHeight: 8,
      backgroundColor: _OnHero.of(context) ? Colors.white.withValues(alpha: 0.25) : context.tone.tile,
      color: _OnHero.of(context) ? Colors.white : (color != null ? (context.dark ? lit(color!, 0.4) : color) : (plain || pct >= 60 ? context.colors.primary : context.colors.error)),
    ),
  );
}

/// One of several (batches, children, languages): rounded chips, the chosen one filled.
class Chips extends StatelessWidget {
  const Chips({super.key, required this.value, required this.options, required this.onChanged, this.labels});
  final String value;
  final List<String> options;
  final ValueChanged<String> onChanged;
  final Map<String, String>? labels;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final o in options)
          Semantics(
            container: true,
            button: true,
            selected: o == value,
            child: Material(
              color: o == value ? c.primary : c.surfaceContainerLowest,
              shape: StadiumBorder(side: BorderSide(color: o == value ? c.primary : c.outlineVariant)),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => onChanged(o),
                child: Container(
                  constraints: const BoxConstraints(minHeight: 48, minWidth: 64),
                  padding: const EdgeInsets.symmetric(horizontal: 18),
                  child: Center(
                    widthFactor: 1,
                    child: Text(
                      labels?[o] ?? o,
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: o == value ? c.onPrimary : c.onSurface),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

// ---- pages --------------------------------------------------------------------------------------------------------
/// Tells a page which tab it lives in: its top bar then shows the tab's name and the person's initial, which opens the menu.
class TabScope extends InheritedWidget {
  const TabScope({super.key, required this.label, required this.openMenu, required super.child});
  final String label;
  final VoidCallback openMenu;
  static TabScope? of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<TabScope>();
  @override
  bool updateShouldNotify(TabScope old) => old.label != label;
}

String get myName => switch (kApp) {
  'guardian' => '${store.children.firstOrNull?['guardianName'] ?? ''}',
  'teacher' => store.staffName,
  _ => '${store.me?['name'] ?? ''}',
};
String get _myPlace => switch (kApp) {
  'guardian' => '${store.child?['name'] ?? ''}',
  'teacher' => '${store.state?['instituteName'] ?? ''}',
  _ => '${store.me?['batch'] ?? ''}',
};

/// A person's initial in a circle.
class Avatar extends StatelessWidget {
  const Avatar(this.name, {super.key, this.size = 40, this.color});
  final String name;
  final double size;
  final Color? color;
  @override
  Widget build(BuildContext context) {
    final tint = color ?? context.colors.primary;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [lit(tint, 0.15), deep(tint, 0.1)]),
        shape: BoxShape.circle,
      ),
      child: Text(
        name.trim().isEmpty ? '?' : name.trim().characters.first.toUpperCase(),
        style: TextStyle(fontSize: size * 0.42, fontWeight: FontWeight.w800, color: color == null ? context.colors.onPrimary : Colors.white),
      ),
    );
  }
}

/// The bar at the top of a page. On a tab's own page: the person's initial (opens the menu) and the tab's name, large.
/// On a page opened from another: a back arrow and the page's name; `color` paints it in a course's colour.
class TopBar extends StatelessWidget {
  const TopBar({super.key, required this.title, this.subtitle, this.actions, this.leading, this.color});
  final String title;
  final String? subtitle;
  final List<Widget>? actions;
  final Widget? leading;
  final Color? color;
  @override
  Widget build(BuildContext context) {
    final c = context.colors, scope = TabScope.of(context);
    // The first page of the app, or one opened on top of it? Asked of the page itself: "can anything be closed" is also
    // true while the side menu is open, which once left a back arrow on a tab's own page.
    final first = ModalRoute.of(context)?.isFirst ?? true;
    final root = scope != null && first;
    final ink = color == null ? c.onSurface : Colors.white;
    final place = subtitle ?? (root ? _myPlace : '');
    return Container(
      decoration: BoxDecoration(
        color: color == null ? glassFill(context, c.surface) : null,
        gradient: color == null ? null : LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [lit(color!, 0.1), deep(color!, 0.14)]),
      ),
      padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top),
      child: IconTheme(
        data: IconThemeData(color: ink),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 64),
          child: Row(
            children: [
              const SizedBox(width: 6),
              if (leading != null)
                leading!
              else if (root)
                Semantics(
                  container: true,
                  button: true,
                  label: t('app.menu'),
                  excludeSemantics: true,
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: scope.openMenu,
                    child: Padding(padding: const EdgeInsets.all(8), child: Avatar(myName)),
                  ),
                )
              else if (!first)
                const BackButton()
              else
                const SizedBox(width: 10),
              const SizedBox(width: 6),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: root ? 22 : 18, height: 1.15, fontWeight: root ? FontWeight.w800 : FontWeight.w700, letterSpacing: root ? -0.2 : 0, color: ink),
                      ),
                      if (place.isNotEmpty)
                        Text(
                          place,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 13, color: color == null ? c.onSurfaceVariant : Colors.white.withValues(alpha: 0.9)),
                        ),
                    ],
                  ),
                ),
              ),
              ...?actions,
              const SizedBox(width: 6),
            ],
          ),
        ),
      ),
    );
  }
}

/// A scrolling page: pull down to refresh; says when the phone is offline or a change could not be saved.
class Screen extends StatelessWidget {
  const Screen({super.key, required this.children, this.title, this.subtitle, this.color, this.refresh = true, this.bottom, this.actions, this.controller, this.background});
  final List<Widget> children;

  /// The name in the top bar. Left out on a tab's own page, which shows the tab's name.
  final String? title;
  final String? subtitle;

  /// A course's colour for the top bar (a chapter's or a batch's own page).
  final Color? color;
  final bool refresh;

  /// Something that stays at the bottom of the page: the main button of a lesson.
  final Widget? bottom;
  final List<Widget>? actions;

  /// A chat follows its newest message; its wallpaper goes behind the list.
  final ScrollController? controller;
  final Color? background;
  @override
  Widget build(BuildContext context) {
    final list = ListView.separated(
      controller: controller,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(16, 12, 16, 28 + (bottom == null ? MediaQuery.paddingOf(context).bottom : 0)),
      itemCount: children.length,
      separatorBuilder: (_, _) => const SizedBox(height: 14),
      itemBuilder: (_, i) => children[i],
    );
    final waiting = store.waiting.length;
    // A tab's own page sits on the tabs' backdrop; a page opened on top draws its own.
    final onTabs = TabScope.of(context) != null && (ModalRoute.of(context)?.isFirst ?? true);
    final page = Scaffold(
      backgroundColor: context.tone.glass > 0 ? Colors.transparent : null,
      body: Column(
        children: [
          TopBar(title: title ?? TabScope.of(context)?.label ?? kAppName, subtitle: subtitle, actions: actions, color: color),
          if (store.status == Status.offline) _Banner(waiting > 0 ? '${t('app.offline')} · ${t('app.waiting', [waiting])}' : t('app.offline'), context.tone.tile, context.colors.onSurface),
          if (store.syncFailed) _Banner(t(store.suspended ? 'auth.suspended' : 'auth.syncFailed'), context.colors.error, context.colors.onError),
          if (waiting > 0 && store.status != Status.offline) const LinearProgressIndicator(minHeight: 3),
          Expanded(
            child: MediaQuery.removePadding(
              context: context,
              removeTop: true,
              child: ColoredBox(color: background ?? Colors.transparent, child: refresh ? RefreshIndicator(onRefresh: store.refresh, child: list) : list),
            ),
          ),
          if (bottom != null)
            Container(
              decoration: BoxDecoration(
                color: glassFill(context, context.colors.surfaceContainerLowest),
                border: Border(top: BorderSide(color: context.colors.outlineVariant)),
              ),
              padding: EdgeInsets.fromLTRB(16, 10, 16, 10 + MediaQuery.paddingOf(context).bottom),
              child: bottom,
            ),
        ],
      ),
    );
    return onTabs ? page : Backdrop(child: page);
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

/// One tab of an app: its icon, its name, its page, and a count to show on the icon (things waiting).
class AppTab {
  const AppTab(this.icon, this.label, this.page, {this.badge = 0, this.screen});
  final CbIcon icon;
  final String label;
  final Widget page;
  final int badge;

  /// The notification screen this tab shows (todo, results, notices, messages); a tapped notification opens it.
  final String? screen;
}

/// The bottom tabs of an app, with the side menu (the person's details, language, log out).
/// Each tab keeps its place (scroll, what was typed) while another is open.
class Tabs extends StatefulWidget {
  const Tabs(this.tabs, {super.key, this.details = const [], this.note});
  final List<AppTab> tabs;

  /// The person's details for the side menu: (label, value).
  final List<(String, String)> details;
  final String? note;
  @override
  State<Tabs> createState() => _TabsState();
}

class _TabsState extends State<Tabs> {
  final frame = GlobalKey<ScaffoldState>();
  var at = 0;
  final opened = {0}; // a tab is built the first time it is opened, then kept
  void open(int i) => setState(() => opened.add(at = i));

  @override
  void initState() {
    super.initState();
    openScreen.addListener(follow);
    WidgetsBinding.instance.addPostFrameCallback((_) => follow()); // tapped while the app was closed
  }

  @override
  void dispose() {
    openScreen.removeListener(follow);
    super.dispose();
  }

  /// A tapped notification: back to the tabs, on the one it is about (the first tab for "home").
  void follow() {
    final want = openScreen.value;
    if (want == null || !mounted) return;
    openScreen.value = null;
    Navigator.of(context).popUntil((r) => r.isFirst);
    final i = widget.tabs.indexWhere((t) => t.screen == want);
    open(i < 0 ? 0 : i);
  }

  @override
  Widget build(BuildContext context) => Backdrop(
    child: Scaffold(
      key: frame,
      backgroundColor: context.tone.glass > 0 ? Colors.transparent : null,
      drawer: SideMenu(details: widget.details, note: widget.note),
      body: IndexedStack(
        index: at,
        children: [for (final (i, tab) in widget.tabs.indexed) opened.contains(i) ? TabScope(label: tab.label, openMenu: () => frame.currentState?.openDrawer(), child: tab.page) : const SizedBox.shrink()],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: glassFill(context, context.colors.surfaceContainerLowest),
          border: Border(top: BorderSide(color: context.colors.outlineVariant)),
        ),
        padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom, left: 4, right: 4),
        child: SizedBox(
          height: 64,
          child: Row(
            children: [for (final (i, tab) in widget.tabs.indexed) TabItem(index: i, tab: tab, on: i == at, onTap: () => open(i))],
          ),
        ),
      ),
    ),
  );
}

/// One tab of the bottom bar: its icon and name turn the app's colour when it is the open one.
class TabItem extends StatelessWidget {
  const TabItem({super.key, required this.index, required this.tab, required this.on, required this.onTap});
  final int index;
  final AppTab tab;
  final bool on;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Expanded(
      child: Semantics(
        container: true,
        identifier: 'tab-$index',
        button: true,
        selected: on,
        label: tab.badge > 0 ? '${tab.label}, ${tab.badge}' : tab.label,
        excludeSemantics: true,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            spacing: 3,
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 240),
                curve: paperCurve,
                width: 54,
                height: 30,
                decoration: BoxDecoration(
                  color: on ? c.primaryContainer : Colors.transparent,
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Badge(
                  isLabelVisible: tab.badge > 0,
                  label: Text(localNumber(tab.badge, lang.code)),
                  offset: const Offset(-8, -2),
                  child: Ico(tab.icon, size: 23, color: on ? c.primary : c.onSurfaceVariant),
                ),
              ),
              Text(
                tab.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textScaler: MediaQuery.textScalerOf(context).clamp(maxScaleFactor: 1.5), // the bar is 64 high: bigger phone text times the app's 130% would not fit (the icon and the screen reader still name the tab)
                style: TextStyle(fontSize: 11.5, fontWeight: on ? FontWeight.w800 : FontWeight.w600, color: on ? c.onSurface : c.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The side menu: who is logged in, the way into Settings and help, the language, and log out.
class SideMenu extends StatelessWidget {
  const SideMenu({super.key, this.details = const [], this.note});
  final List<(String, String)> details;
  final String? note;
  @override
  Widget build(BuildContext context) => Drawer(
    child: _Frost(
      child: Live(
        (context) => SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
            children: [
              Row(
                spacing: 14,
                children: [
                  Avatar(myName, size: 56),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(myName.isEmpty ? kAppName : myName, style: context.type.titleLarge),
                        Muted(store.email ?? ''),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              const Divider(),
              Item(
                icon: I.settings,
                title: t('settings.title'),
                onTap: () {
                  Navigator.pop(context); // close the menu first
                  push(context, SettingsScreen(details: details, note: note));
                },
              ),
              Item(
                icon: I.support,
                color: context.course(1),
                title: t('support.link'),
                onTap: () => launchUrl(Uri.parse('$kApiUrl/support'), mode: LaunchMode.externalApplication),
              ),
              const Divider(),
              const SizedBox(height: 14),
              Section(t('app.language')),
              const SizedBox(height: 8),
              Chips(value: lang.code, options: const ['en', 'bn'], labels: const {'en': 'English', 'bn': 'বাংলা'}, onChanged: store.setLang),
              const SizedBox(height: 24),
              Doing(label: t('app.logOut'), icon: I.logout, soft: true, danger: true, onPressed: store.signOut),
            ],
          ),
        ),
      ),
    ),
  );
}

/// Frosted glass: blurs what is behind (only with the glass effect on). For a few large panels, never list rows.
class _Frost extends StatelessWidget {
  const _Frost({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final g = context.tone.glass;
    if (g == 0) return child;
    final sigma = const [0.0, 10.0, 16.0, 24.0][(g * 3).round().clamp(0, 3)]; // Whisper, Frosted, Crystal
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
        child: child,
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

  List<Widget> _rows(Iterable<T> items) => [
    for (final (i, item) in items.indexed) ...[if (i > 0) const Divider(indent: 14, endIndent: 14), widget.row(item)],
  ];

  @override
  Widget build(BuildContext context) {
    final all = widget.items.length, size = store.pageSize;
    if (all <= pageSizes.first) return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: _rows(widget.items));
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
                  decoration: BoxDecoration(color: n == at ? c.primary : null, borderRadius: BorderRadius.circular(11)),
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
        ..._rows(widget.items.getRange(from, to)),
        const Divider(),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Semantics(
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
                      borderRadius: BorderRadius.circular(14),
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
                    IconButton(tooltip: t('pager.prev'), onPressed: at > 1 ? () => setState(() => page = at - 1) : null, icon: Ico(I.chevronLeft)),
                    for (final n in pageNumbers(at, pages)) number(n),
                    IconButton(tooltip: t('pager.next'), onPressed: at < pages ? () => setState(() => page = at + 1) : null, icon: Ico(I.chevronRight)),
                  ],
                ),
              ],
            ),
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

/// The app's button, filled with the app's colour (`soft`: a quiet tinted one; `danger`: red). On the coloured card
/// it turns white by itself. It shows it is working until its job is finished, and can't be pressed twice meanwhile.
class Doing extends StatefulWidget {
  const Doing({super.key, required this.label, required this.onPressed, this.icon, this.soft = false, this.danger = false, this.small = false, this.color});
  final String label;
  final Future<void> Function()? onPressed;
  final CbIcon? icon;
  final bool soft, danger, small;

  /// A course's colour instead of the app's.
  final Color? color;
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
    final main = widget.danger ? c.error : (widget.color ?? c.primary);
    final (fill, ink) = onHero
        ? (Colors.white, context.tone.hero.last)
        : widget.soft
        ? (main.withValues(alpha: context.dark ? 0.22 : 0.1), context.dark ? lit(main, 0.35) : main)
        : (main, widget.danger ? c.onError : (widget.color == null ? c.onPrimary : Colors.white));
    return Opacity(
      opacity: widget.onPressed == null ? 0.45 : 1,
      child: Material(
        color: fill,
        shape: const StadiumBorder(), // buttons are pills
        clipBehavior: Clip.antiAlias,
        child: Semantics(
          container: true,
          button: true,
          enabled: can,
          child: InkWell(
            onTap: can ? run : null,
            child: Container(
              constraints: BoxConstraints(minHeight: widget.small ? 48 : 52, minWidth: 48),
              padding: EdgeInsets.symmetric(horizontal: widget.small ? 14 : 18, vertical: 10),
              child: Row(
                mainAxisSize: widget.small ? MainAxisSize.min : MainAxisSize.max,
                mainAxisAlignment: MainAxisAlignment.center,
                spacing: 8,
                children: [
                  if (busy) SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.5, color: ink)) else if (widget.icon != null) Ico(widget.icon!, size: 20, color: ink),
                  Flexible(
                    child: Text(
                      widget.label,
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: widget.small ? 15 : 16, fontWeight: FontWeight.w700, color: ink),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

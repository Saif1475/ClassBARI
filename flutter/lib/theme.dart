import 'package:cupertino_ui/cupertino_ui.dart' show CupertinoPageTransitionsBuilder; // iPhones keep their swipe-back
import 'package:material_ui/material_ui.dart';

/// What the look needs besides plain colours: the soft fill of chips and icon squares, the faint shadow under cards,
/// the brand gradient of summary cards, and one strong colour per chapter or batch (each course has its own, as in
/// the learning apps students already know).
class Tone extends ThemeExtension<Tone> {
  const Tone({required this.tile, required this.lift, required this.hero, required this.courses, this.glass = 0, this.blobs = const []});
  final Color tile;

  /// Settings → Glass effect, 0 (off: the flat look) to 1 (high); [blobs]: the soft colours of the page behind the glass.
  final double glass;
  final List<Color> blobs;
  final List<BoxShadow> lift;
  final List<Color> hero, courses;

  @override
  Tone copyWith() => this;
  @override
  Tone lerp(Tone? other, double t) => t < 0.5 ? this : (other ?? this);
}

extension Look on BuildContext {
  ColorScheme get colors => Theme.of(this).colorScheme;
  TextTheme get type => Theme.of(this).textTheme;
  Tone get tone => Theme.of(this).extension<Tone>()!;
  bool get dark => Theme.of(this).brightness == Brightness.dark;

  /// The colour of the nth chapter or batch. White text reads on every one of them.
  Color course(int n) => tone.courses[n % tone.courses.length];
}

/// A colour with a little white laid over it (lit edges), or a little black (pressed, deeper end of a gradient).
Color lit(Color c, [double by = 0.10]) => Color.lerp(c, Colors.white, by)!;
Color deep(Color c, [double by = 0.18]) => Color.lerp(c, Colors.black, by)!;

/// "Paper & Spring" (design/05-animations-and-motion.md): the website's curves.
const paperCurve = Cubic(0.22, 1, 0.36, 1); // glide: pills, sheets, tabs, page pushes (never overshoots: safe for fades)
const tactileCurve = Cubic(0.34, 1.45, 0.64, 1); // micro-spring: press release, checkmarks (overshoots: not for opacity)
const exitCurve = Curves.easeInCubic; // leaving is always quicker than arriving

/// A new page comes in a little way from the right and fades in, as on the website (iPhones keep their own swipe-back).
class PaperPageTransitions extends PageTransitionsBuilder {
  const PaperPageTransitions();
  @override
  Widget buildTransitions<T>(PageRoute<T> route, BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation, Widget child) {
    final move = CurvedAnimation(parent: animation, curve: paperCurve, reverseCurve: exitCurve);
    return FadeTransition(
      opacity: move,
      child: SlideTransition(position: Tween(begin: const Offset(0.2, 0), end: Offset.zero).animate(move), child: child),
    );
  }
}

/// Instanton Campus's colours, "Paper & Prism" (design/02-visual-system.md, the website's globals.css): a warm paper
/// page, crisp white cards with hairline borders, Forest Chalk green or Sky Blossom (sky blue with pink), each with a
/// dark "Night Study Ink" version. Colour is kept for what matters.
ThemeData classbariTheme(Brightness brightness, {bool sky = false, double glass = 0}) {
  final dark = brightness == Brightness.dark;
  Color pick(int green, int greenDark, int blue, int blueDark) => Color(sky ? (dark ? blueDark : blue) : (dark ? greenDark : green));
  final primary = pick(0xFF146C43, 0xFF3EC786, 0xFF1769AA, 0xFF5BB2F5);
  final onPrimary = pick(0xFFFFFFFF, 0xFF062B19, 0xFFFFFFFF, 0xFF05233D);
  final surface = Color(dark ? 0xFF0D1114 : 0xFFFAF8F4); // the page: warm paper
  final card = Color(dark ? 0xFF151B20 : 0xFFFFFFFF);
  final tile = Color(dark ? 0xFF1C242B : 0xFFF3F0E9); // wells, chips, icon squares
  final text = Color(dark ? 0xFFF2F4F2 : 0xFF161B18);
  final muted = Color(dark ? 0xFF9CA8A1 : 0xFF535E58);
  final line = Color(dark ? 0xFF26313A : 0xFFE6E1D6); // hairlines
  // Dialogs, sheets and the side menu: a little see-through with the glass effect (the menu also blurs what is behind).
  final sheet = card.withValues(alpha: 1 - glass * 0.12);
  final soft = pick(0xFFE4F4EC, 0xFF123526, 0xFFE4F1FC, 0xFF132B40), onSoft = pick(0xFF0C472B, 0xFFA7EBC9, 0xFF0E436E, 0xFFB5DCFB);
  final scheme = ColorScheme.fromSeed(seedColor: primary, brightness: brightness).copyWith(
    primary: primary,
    onPrimary: onPrimary,
    primaryContainer: soft,
    onPrimaryContainer: onSoft,
    secondaryContainer: soft,
    onSecondaryContainer: onSoft,
    tertiary: pick(0xFF925309, 0xFFF5BA62, 0xFFA3365F, 0xFFF38FB2),
    tertiaryContainer: pick(0xFFFEF2E2, 0xFF332412, 0xFFFCE8F0, 0xFF381826),
    onTertiaryContainer: pick(0xFF7A4608, 0xFFFAD19E, 0xFF802246, 0xFFF8BBD0),
    error: Color(dark ? 0xFFF98078 : 0xFFB42318),
    onError: Color(dark ? 0xFF3A0D0B : 0xFFFFFFFF),
    errorContainer: Color(dark ? 0xFF3A1718 : 0xFFFDECEB),
    onErrorContainer: Color(dark ? 0xFFF98078 : 0xFFB42318),
    surface: surface,
    onSurface: text,
    onSurfaceVariant: muted,
    surfaceContainerLowest: card,
    surfaceContainerLow: card,
    surfaceContainer: card,
    surfaceContainerHigh: tile,
    surfaceContainerHighest: tile,
    outline: Color(dark ? 0xFF3A4956 : 0xFFCFC8BA),
    outlineVariant: line,
    surfaceTint: Colors.transparent,
  );
  final tone = Tone(
    tile: tile,
    // Paper elevation: a warm stone tint, never harsh black; the dark page lifts cards by their lighter paper instead.
    lift: dark ? const [] : const [BoxShadow(color: Color(0x0B1C241E), blurRadius: 10, offset: Offset(0, 3)), BoxShadow(color: Color(0x081C241E), blurRadius: 2, offset: Offset(0, 1))],
    hero: dark ? [pick(0, 0xFF17432F, 0, 0xFF163A5A), pick(0, 0xFF0F3022, 0, 0xFF0F2A42)] : [pick(0xFF146C43, 0, 0xFF1769AA, 0), pick(0xFF0F5635, 0, 0xFF115388, 0)],
    // The 8 subject spines ("Ink & Chalk"): chapters and batches by their place % 8. The light values in both modes:
    // white text and icons sit on them.
    courses: const [Color(0xFF146C43), Color(0xFF1D63B8), Color(0xFFC46D10), Color(0xFF7A3EB1), Color(0xFF0E7B8C), Color(0xFFB84A39), Color(0xFF5B7A1E), Color(0xFFB8326A)],
    glass: glass,
    // "Crystal" (the highest glass level) washes the page faintly with the brand colours, as on the website.
    blobs: [soft, pick(0xFFFEF2E2, 0xFF332412, 0xFFFCE8F0, 0xFF381826), soft],
  );
  const corner = BorderRadius.all(Radius.circular(12)); // inputs and small controls; buttons are pills
  // The website's fonts: Plus Jakarta Sans for English letters; Bangla and ৳ fall through to Hind Siliguri.
  final base = ThemeData(colorScheme: scheme, scaffoldBackgroundColor: surface, extensions: [tone], fontFamily: 'PlusJakartaSans', fontFamilyFallback: const ['HindSiliguri']);
  return base.copyWith(
    textTheme: base.textTheme.copyWith(
      headlineMedium: base.textTheme.headlineMedium?.copyWith(fontSize: 28, height: 1.15, fontWeight: FontWeight.w800, letterSpacing: -0.3, color: text),
      headlineSmall: base.textTheme.headlineSmall?.copyWith(fontSize: 22, height: 1.2, fontWeight: FontWeight.w800, letterSpacing: -0.2, color: text),
      titleLarge: base.textTheme.titleLarge?.copyWith(fontSize: 19, height: 1.25, fontWeight: FontWeight.w700, color: text),
      titleMedium: base.textTheme.titleMedium?.copyWith(fontSize: 16, height: 1.3, fontWeight: FontWeight.w700, letterSpacing: 0, color: text),
      // A little more room between lines than English needs alone: Bangla's vowel signs reach above and below.
      bodyLarge: base.textTheme.bodyLarge?.copyWith(fontSize: 16, height: 1.55, letterSpacing: 0.1, color: text),
      bodyMedium: base.textTheme.bodyMedium?.copyWith(fontSize: 15, height: 1.5, letterSpacing: 0.1, color: text),
      bodySmall: base.textTheme.bodySmall?.copyWith(fontSize: 13.5, height: 1.45, letterSpacing: 0.1, color: muted),
      labelSmall: base.textTheme.labelSmall?.copyWith(fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 0.7, color: muted),
    ),
    cardTheme: const CardThemeData(color: Colors.transparent, elevation: 0, margin: EdgeInsets.zero),
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: PaperPageTransitions(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.linux: PaperPageTransitions(),
        TargetPlatform.windows: PaperPageTransitions(),
        TargetPlatform.fuchsia: PaperPageTransitions(),
      },
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.transparent,
      foregroundColor: text,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: text),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(48, 50),
        elevation: 0,
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(48, 50),
        backgroundColor: card,
        shape: const StadiumBorder(),
        side: BorderSide(color: line),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(48, 44),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    inputDecorationTheme: InputDecorationThemeData(
      filled: true,
      fillColor: card,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: corner,
        borderSide: BorderSide(color: line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: corner,
        borderSide: BorderSide(color: line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: corner,
        borderSide: BorderSide(color: primary, width: 2),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: sheet,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(26))),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: sheet,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26))),
    ),
    drawerTheme: DrawerThemeData(
      backgroundColor: glass > 0 ? card.withValues(alpha: 1 - glass * 0.3) : card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.horizontal(right: Radius.circular(26))),
    ),
    dividerTheme: DividerThemeData(color: line, space: 1, thickness: 1),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(16))),
    ),
  );
}

/// The four highlight kinds in a PDF lesson (the website's colours).
const highlightColors = {'term': Color(0xFFFFE066), 'definition': Color(0xFFB2F2BB), 'formula': Color(0xFFA5D8FF), 'exam': Color(0xFFFFC078)};

import 'package:material_ui/material_ui.dart';

/// What the look needs besides plain colours: the soft fill of chips and icon squares, the faint shadow under cards,
/// the brand gradient of summary cards, and one strong colour per chapter or batch (each course has its own, as in
/// the learning apps students already know).
class Tone extends ThemeExtension<Tone> {
  const Tone({required this.tile, required this.lift, required this.hero, required this.courses});
  final Color tile;
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

/// ClassBARI's colours: green, or sky blue with pink (the theme girls get on the website), each with a dark version.
/// Flat and airy: a quiet page, white cards with generous corners, colour kept for what matters.
ThemeData classbariTheme(Brightness brightness, {bool sky = false}) {
  final dark = brightness == Brightness.dark;
  Color pick(int green, int greenDark, int blue, int blueDark) => Color(sky ? (dark ? blueDark : blue) : (dark ? greenDark : green));
  final primary = pick(0xFF157347, 0xFF6CC9A4, 0xFF1976B8, 0xFF8CCAF5);
  final onPrimary = pick(0xFFFFFFFF, 0xFF06231A, 0xFFFFFFFF, 0xFF062B47);
  final surface = Color(dark ? 0xFF101312 : (sky ? 0xFFF4F6FA : 0xFFF3F6F4));
  final card = Color(dark ? 0xFF1A1E1D : 0xFFFFFFFF);
  final tile = Color(dark ? 0xFF262B2A : (sky ? 0xFFE9EFF7 : 0xFFE9F0EC));
  final text = Color(dark ? 0xFFE6EAE8 : 0xFF17201B);
  final muted = Color(dark ? 0xFFA3ADA8 : 0xFF57625C);
  final line = Color(dark ? 0xFF2D3432 : 0xFFE0E6E2);
  final scheme = ColorScheme.fromSeed(seedColor: primary, brightness: brightness).copyWith(
    primary: primary,
    onPrimary: onPrimary,
    primaryContainer: pick(0xFFD5F0E0, 0xFF1C4A38, 0xFFD6EAFA, 0xFF144A6E),
    onPrimaryContainer: pick(0xFF0B3D25, 0xFFC4EFD9, 0xFF0A3A5E, 0xFFCFE8FB),
    secondaryContainer: pick(0xFFDDEDE3, 0xFF303A35, 0xFFFFDCE8, 0xFF5C2C3E),
    onSecondaryContainer: text,
    tertiary: pick(0xFF8A5A00, 0xFFE7BD62, 0xFFA83E6F, 0xFFF3A8C6),
    tertiaryContainer: pick(0xFFFFE7BF, 0xFF5C4408, 0xFFFFE2EC, 0xFF642640),
    onTertiaryContainer: Color(dark ? 0xFFFFE9C4 : 0xFF3D2800),
    error: Color(dark ? 0xFFFFB4AB : 0xFFB3261E),
    onError: Color(dark ? 0xFF690005 : 0xFFFFFFFF),
    errorContainer: Color(dark ? 0xFF93000A : 0xFFFCE1DE),
    onErrorContainer: Color(dark ? 0xFFFFDAD6 : 0xFF5C1410),
    surface: surface,
    onSurface: text,
    onSurfaceVariant: muted,
    surfaceContainerLowest: card,
    surfaceContainerLow: card,
    surfaceContainer: card,
    surfaceContainerHigh: tile,
    surfaceContainerHighest: tile,
    outline: Color(dark ? 0xFF8A9390 : 0xFF6F7A72),
    outlineVariant: line,
    surfaceTint: Colors.transparent,
  );
  final tone = Tone(
    tile: tile,
    lift: dark
        ? const [BoxShadow(color: Color(0x66000000), blurRadius: 14, spreadRadius: -6, offset: Offset(0, 6))]
        : const [BoxShadow(color: Color(0x0F0B2A1C), blurRadius: 2, offset: Offset(0, 1)), BoxShadow(color: Color(0x170B2A1C), blurRadius: 20, spreadRadius: -8, offset: Offset(0, 8))],
    hero: dark ? [pick(0, 0xFF24573F, 0, 0xFF22527A), pick(0, 0xFF1A4433, 0, 0xFF183E5E)] : [pick(0xFF1C8553, 0, 0xFF2283C7, 0), pick(0xFF0F5F39, 0, 0xFF125F96, 0)],
    courses: const [Color(0xFF157347), Color(0xFF1D6FB8), Color(0xFFB5416B), Color(0xFFC2580C), Color(0xFF6D3FC0), Color(0xFF0E7C86), Color(0xFF8A6A00), Color(0xFFBE3A3A)],
  );
  const corner = BorderRadius.all(Radius.circular(14));
  // The website's fonts: Plus Jakarta Sans for English letters; Bangla and ৳ fall through to Hind Siliguri.
  final base = ThemeData(colorScheme: scheme, scaffoldBackgroundColor: surface, extensions: [tone], fontFamily: 'PlusJakartaSans', fontFamilyFallback: const ['HindSiliguri']);
  return base.copyWith(
    textTheme: base.textTheme.copyWith(
      headlineMedium: base.textTheme.headlineMedium?.copyWith(fontSize: 28, height: 1.15, fontWeight: FontWeight.w800, letterSpacing: -0.3, color: text),
      headlineSmall: base.textTheme.headlineSmall?.copyWith(fontSize: 22, height: 1.2, fontWeight: FontWeight.w800, letterSpacing: -0.2, color: text),
      titleLarge: base.textTheme.titleLarge?.copyWith(fontSize: 19, height: 1.25, fontWeight: FontWeight.w700, color: text),
      titleMedium: base.textTheme.titleMedium?.copyWith(fontSize: 16, height: 1.3, fontWeight: FontWeight.w700, letterSpacing: 0, color: text),
      bodyLarge: base.textTheme.bodyLarge?.copyWith(fontSize: 16, height: 1.45, letterSpacing: 0.1, color: text),
      bodyMedium: base.textTheme.bodyMedium?.copyWith(fontSize: 15, height: 1.4, letterSpacing: 0.1, color: text),
      bodySmall: base.textTheme.bodySmall?.copyWith(fontSize: 13.5, height: 1.35, letterSpacing: 0.1, color: muted),
      labelSmall: base.textTheme.labelSmall?.copyWith(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.9, color: muted),
    ),
    cardTheme: const CardThemeData(color: Colors.transparent, elevation: 0, margin: EdgeInsets.zero),
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
        shape: const RoundedRectangleBorder(borderRadius: corner),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(48, 50),
        backgroundColor: card,
        shape: const RoundedRectangleBorder(borderRadius: corner),
        side: BorderSide(color: line),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(48, 44),
        shape: const RoundedRectangleBorder(borderRadius: corner),
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
      backgroundColor: card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(24))),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    ),
    drawerTheme: DrawerThemeData(
      backgroundColor: card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.horizontal(right: Radius.circular(24))),
    ),
    dividerTheme: DividerThemeData(color: line, space: 1, thickness: 1),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: corner),
    ),
  );
}

/// The four highlight kinds in a PDF lesson (the website's colours).
const highlightColors = {'term': Color(0xFFFFE066), 'definition': Color(0xFFB2F2BB), 'formula': Color(0xFFA5D8FF), 'exam': Color(0xFFFFC078)};

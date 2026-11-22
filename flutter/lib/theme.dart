import 'package:material_ui/material_ui.dart';

/// What the website's phone look is made of besides plain colours (src/app/globals.css): the soft glows behind every
/// page, the tinted rows inside cards, the deep green of the "today" card and the two-layer shadow that lifts boxes.
class Tone extends ThemeExtension<Tone> {
  const Tone({required this.glows, required this.tile, required this.glass, required this.hero, required this.lift});

  /// Top-left, top-right, bottom-left glow. Empty in the dark theme (flat charcoal, as on the website).
  final List<Color> glows;
  final Color tile, glass;
  final List<Color> hero;
  final List<BoxShadow> lift;

  @override
  Tone copyWith() => this;
  @override
  Tone lerp(Tone? other, double t) => t < 0.5 ? this : (other ?? this);
}

extension Look on BuildContext {
  ColorScheme get colors => Theme.of(this).colorScheme;
  TextTheme get type => Theme.of(this).textTheme;
  Tone get tone => Theme.of(this).extension<Tone>()!;
}

/// A colour with a little white laid over it: the lit top edge of buttons and of the "today" card.
Color lit(Color c, [double by = 0.10]) => Color.lerp(c, Colors.white, by)!;

/// ClassBARI's colours, the same as the website's: green, or sky blue with pink (the theme girls get on the website),
/// each with a dark version.
ThemeData classbariTheme(Brightness brightness, {bool sky = false}) {
  final dark = brightness == Brightness.dark;
  Color pick(int green, int greenDark, int blue, int blueDark) => Color(sky ? (dark ? blueDark : blue) : (dark ? greenDark : green));
  final primary = pick(0xFF157347, 0xFF6CC9A4, 0xFF1976B8, 0xFF8CCAF5);
  final onPrimary = pick(0xFFFFFFFF, 0xFF06231A, 0xFFFFFFFF, 0xFF062B47);
  final surface = pick(0xFFF0F8F2, 0xFF111314, 0xFFFBFCFE, 0xFF111314);
  final card = Color(dark ? 0xFF1E2224 : 0xFFFFFFFF);
  final tile = pick(0xFFE2EEE8, 0xFF2A2F31, 0xFFE6EFF8, 0xFF2A2F31);
  final text = pick(0xFF171D19, 0xFFE3E6E5, 0xFF1A1C20, 0xFFE3E6E5);
  final muted = pick(0xFF3F4A43, 0xFFA8B0AD, 0xFF454A52, 0xFFA8B0AD);
  final line = Color(dark ? 0xFF353B3D : 0xFFCBD6CF);
  final scheme = ColorScheme.fromSeed(seedColor: primary, brightness: brightness).copyWith(
    primary: primary,
    onPrimary: onPrimary,
    primaryContainer: pick(0xFFA8ECC4, 0xFF1C4A38, 0xFFBEE2FA, 0xFF144A6E),
    onPrimaryContainer: pick(0xFF05210F, 0xFFC4EFD9, 0xFF062B47, 0xFFCFE8FB),
    secondaryContainer: pick(0xFFCEEAD6, 0xFF303A35, 0xFFFFD6E4, 0xFF5C2C3E),
    onSecondaryContainer: text,
    tertiary: pick(0xFF7A5900, 0xFFE7BD62, 0xFFA83E6F, 0xFFF3A8C6),
    tertiaryContainer: pick(0xFFFFDEA6, 0xFF5C4408, 0xFFFFE2EC, 0xFF642640),
    onTertiaryContainer: text,
    error: Color(dark ? 0xFFFFB4AB : 0xFFBA1A1A),
    onError: Color(dark ? 0xFF690005 : 0xFFFFFFFF),
    errorContainer: Color(dark ? 0xFF93000A : 0xFFFFDAD6),
    onErrorContainer: Color(dark ? 0xFFFFDAD6 : 0xFF410002),
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
    glows: dark ? const [] : [pick(0x8CA8ECC4, 0, 0x99BEE2FA, 0), pick(0x66FFDEA6, 0, 0x8CFFD6E4, 0), pick(0x80CEEAD6, 0, 0x99FFFFFF, 0)],
    tile: tile,
    glass: dark ? const Color(0xF216191B) : surface.withValues(alpha: 0.72),
    hero: dark ? [pick(0, 0xFF24573F, 0, 0xFF22527A), pick(0, 0xFF1D4A37, 0, 0xFF1B4466)] : [lit(primary), pick(0xFF126A40, 0, 0xFF156AA6, 0)],
    lift: dark
        ? const [BoxShadow(color: Color(0x80000000), blurRadius: 2, offset: Offset(0, 1)), BoxShadow(color: Color(0x99000000), blurRadius: 22, spreadRadius: -8, offset: Offset(0, 8))]
        : const [BoxShadow(color: Color(0x14002018), blurRadius: 2, offset: Offset(0, 1)), BoxShadow(color: Color(0x29002018), blurRadius: 18, spreadRadius: -6, offset: Offset(0, 6))],
  );
  const corner = BorderRadius.all(Radius.circular(12));
  const field = BorderRadius.all(Radius.circular(14));
  final base = ThemeData(colorScheme: scheme, scaffoldBackgroundColor: surface, extensions: [tone]);
  return base.copyWith(
    textTheme: base.textTheme.copyWith(
      headlineMedium: base.textTheme.headlineMedium?.copyWith(fontSize: 30, height: 1.15, fontWeight: FontWeight.w800, letterSpacing: -0.2, color: text),
      headlineSmall: base.textTheme.headlineSmall?.copyWith(fontSize: 24, height: 1.2, fontWeight: FontWeight.w800, color: text),
      titleLarge: base.textTheme.titleLarge?.copyWith(fontSize: 20, height: 1.25, fontWeight: FontWeight.w700, color: text),
      titleMedium: base.textTheme.titleMedium?.copyWith(fontSize: 17, height: 1.3, fontWeight: FontWeight.w700, letterSpacing: 0.1, color: text),
      bodyLarge: base.textTheme.bodyLarge?.copyWith(fontSize: 16, height: 1.4, color: text),
      bodyMedium: base.textTheme.bodyMedium?.copyWith(fontSize: 15, height: 1.4, letterSpacing: 0.15, color: text),
      bodySmall: base.textTheme.bodySmall?.copyWith(fontSize: 13.5, height: 1.35, letterSpacing: 0.15, color: muted),
    ),
    cardTheme: const CardThemeData(color: Colors.transparent, elevation: 0, margin: EdgeInsets.zero),
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.transparent,
      foregroundColor: text,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: 0.2, color: text),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(48, 50),
        elevation: 2,
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
        borderRadius: field,
        borderSide: BorderSide(color: line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: field,
        borderSide: BorderSide(color: line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: field,
        borderSide: BorderSide(color: primary.withValues(alpha: 0.6), width: 2.5),
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
    drawerTheme: DrawerThemeData(backgroundColor: surface),
    dividerTheme: DividerThemeData(color: line, space: 1, thickness: 1),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: corner),
    ),
  );
}

/// The four highlight kinds in a PDF lesson (the website's colours).
const highlightColors = {'term': Color(0xFFFFE066), 'definition': Color(0xFFB2F2BB), 'formula': Color(0xFFA5D8FF), 'exam': Color(0xFFFFC078)};

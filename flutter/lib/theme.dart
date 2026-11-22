import 'package:material_ui/material_ui.dart';

/// ClassBARI's colours, the same as the website's (src/app/globals.css): green, or sky blue with pink (the theme
/// girls get on the website), each with a dark version. Corners are modest and every box has a soft shadow.
ThemeData classbariTheme(Brightness brightness, {bool sky = false}) {
  final dark = brightness == Brightness.dark;
  Color pick(int green, int greenDark, int blue, int blueDark) => Color(sky ? (dark ? blueDark : blue) : (dark ? greenDark : green));
  final primary = pick(0xFF157347, 0xFF6CC9A4, 0xFF1976B8, 0xFF8CCAF5);
  final onPrimary = pick(0xFFFFFFFF, 0xFF06231A, 0xFFFFFFFF, 0xFF062B47);
  final surface = pick(0xFFF0F8F2, 0xFF111314, 0xFFF4F8FC, 0xFF111314);
  final card = Color(dark ? 0xFF1C2022 : 0xFFFFFFFF);
  final soft = pick(0xFFE2EFE6, 0xFF262A2C, 0xFFE4EEF8, 0xFF262A2C);
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
    surfaceContainerHigh: soft,
    surfaceContainerHighest: soft,
    outline: Color(dark ? 0xFF8A9390 : 0xFF6F7A72),
    outlineVariant: line,
    surfaceTint: Colors.transparent,
  );
  const corner = BorderRadius.all(Radius.circular(12));
  final base = ThemeData(colorScheme: scheme, scaffoldBackgroundColor: surface);
  return base.copyWith(
    textTheme: base.textTheme.copyWith(
      headlineSmall: base.textTheme.headlineSmall?.copyWith(fontSize: 23, fontWeight: FontWeight.w800, color: text),
      titleMedium: base.textTheme.titleMedium?.copyWith(fontSize: 17, fontWeight: FontWeight.w700, color: text),
      bodyLarge: base.textTheme.bodyLarge?.copyWith(fontSize: 15, height: 1.4, color: text),
      bodyMedium: base.textTheme.bodyMedium?.copyWith(fontSize: 15, height: 1.4, color: text),
      bodySmall: base.textTheme.bodySmall?.copyWith(fontSize: 13, height: 1.35, color: muted),
    ),
    cardTheme: CardThemeData(
      color: card,
      elevation: dark ? 1 : 2.5,
      shadowColor: Colors.black.withValues(alpha: dark ? 0.6 : 0.22),
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.all(Radius.circular(14)),
        side: BorderSide(color: line.withValues(alpha: 0.6)),
      ),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: surface,
      foregroundColor: text,
      elevation: 0,
      scrolledUnderElevation: 1,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: text),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(48, 50),
        elevation: 1.5,
        shape: const RoundedRectangleBorder(borderRadius: corner),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(48, 50),
        shape: const RoundedRectangleBorder(borderRadius: corner),
        side: BorderSide(color: line),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        minimumSize: const Size(48, 44),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    inputDecorationTheme: InputDecorationThemeData(
      filled: true,
      fillColor: card,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
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
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: card,
      elevation: 6,
      shadowColor: Colors.black,
      height: 66,
      indicatorColor: scheme.primaryContainer,
      labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(fontSize: 12, fontWeight: s.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w600, color: s.contains(WidgetState.selected) ? text : muted)),
    ),
    chipTheme: ChipThemeData(
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(10))),
      side: BorderSide(color: line),
      labelStyle: TextStyle(fontWeight: FontWeight.w700, color: text),
    ),
    dividerTheme: DividerThemeData(color: line, space: 1, thickness: 1),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}

/// The four highlight kinds in a PDF lesson (the website's colours).
const highlightColors = {'term': Color(0xFFFFE066), 'definition': Color(0xFFB2F2BB), 'formula': Color(0xFFA5D8FF), 'exam': Color(0xFFFFC078)};

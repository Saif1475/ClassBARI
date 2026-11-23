// Instanton Campus's own icons in the apps: the same shapes as the website (src/lib/icon-set.ts → icons.g.dart), drawn here.
import 'package:material_ui/material_ui.dart';

import 'icons.g.dart';

/// One icon, by name (use the constants in [I]: I.home, I.bell…).
class CbIcon {
  const CbIcon(this.name);
  final String name;
}

/// Draws an icon: thin rounded lines, a soft accent fill and small solid details, in the icon colour around it.
class Ico extends StatelessWidget {
  const Ico(this.icon, {super.key, this.size, this.color, this.semanticLabel});
  final CbIcon icon;
  final double? size;
  final Color? color;

  /// Said by screen readers (most icons sit next to words and say nothing).
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final theme = IconTheme.of(context);
    final s = size ?? theme.size ?? 24;
    final drawn = SizedBox.square(
      dimension: s,
      child: CustomPaint(painter: _Painter(icon.name, color ?? theme.color ?? const Color(0xFF17201B), s)),
    );
    return semanticLabel == null
        ? ExcludeSemantics(child: drawn)
        : Semantics(
            label: semanticLabel,
            image: true,
            child: ExcludeSemantics(child: drawn),
          );
  }
}

class _Painter extends CustomPainter {
  _Painter(this.name, this.color, this.side);
  final String name;
  final Color color;

  /// The icon's own size: a layout that stretches the box doesn't stretch the icon, it stays in the middle.
  final double side;

  static final _paths = <String, Path>{};
  static Path _path(String d) => _paths[d] ??= parsePath(d);

  @override
  void paint(Canvas canvas, Size size) {
    final g = kGlyphs[name];
    if (g == null) return;
    canvas.translate((size.width - side) / 2, (size.height - side) / 2);
    canvas.scale(side / 24);
    for (final d in g.$2) {
      canvas.drawPath(_path(d), Paint()..color = color.withValues(alpha: color.a * 0.18));
    }
    final line = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.8
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    for (final d in g.$1) {
      canvas.drawPath(_path(d), line);
    }
    for (final d in g.$3) {
      canvas.drawPath(_path(d), Paint()..color = color);
    }
  }

  @override
  bool shouldRepaint(_Painter old) => old.name != name || old.color != color || old.side != side;
}

/// An SVG path with M L H V C Q Z and absolute numbers (all the icon set uses).
Path parsePath(String d) {
  final path = Path();
  final tokens = RegExp(r'[MLHVCQZ]|-?\d*\.?\d+').allMatches(d).map((m) => m[0]!).toList();
  var i = 0, x = 0.0, y = 0.0, cmd = 'M';
  double next() => double.parse(tokens[i++]);
  while (i < tokens.length) {
    if (RegExp(r'^[MLHVCQZ]$').hasMatch(tokens[i])) cmd = tokens[i++];
    switch (cmd) {
      case 'M':
        path.moveTo(x = next(), y = next());
        cmd = 'L'; // numbers after a move are lines
      case 'L':
        path.lineTo(x = next(), y = next());
      case 'H':
        path.lineTo(x = next(), y);
      case 'V':
        path.lineTo(x, y = next());
      case 'C':
        final c = [next(), next(), next(), next(), next(), next()];
        path.cubicTo(c[0], c[1], c[2], c[3], x = c[4], y = c[5]);
      case 'Q':
        final q = [next(), next(), next(), next()];
        path.quadraticBezierTo(q[0], q[1], x = q[2], y = q[3]);
      case 'Z':
        path.close();
      default:
        i++;
    }
  }
  return path;
}

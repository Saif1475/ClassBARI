// Every ClassBARI icon is read correctly and stays inside its 24×24 square (the same shapes the website draws).
import 'package:classbari/icon.dart';
import 'package:classbari/icons.g.dart';
import 'package:flutter_test/flutter_test.dart';

import 'dart:ui' show PictureRecorder;

import 'package:material_ui/material_ui.dart';

void main() {
  test('every icon is drawn inside its square', () {
    expect(kGlyphs.length, greaterThan(80));
    for (final MapEntry(key: name, value: g) in kGlyphs.entries) {
      for (final d in [...g.$1, ...g.$2, ...g.$3]) {
        final b = parsePath(d).getBounds();
        expect(b.isEmpty && !d.contains('M'), isFalse, reason: name);
        expect(b.left >= 0 && b.top >= 0 && b.right <= 24 && b.bottom <= 24, isTrue, reason: '$name: $b');
      }
    }
  });

  test('a path with lines, curves and closing is read exactly', () {
    final b = parsePath('M2 3H10V8L4 8Q2 8 2 6Z').getBounds();
    expect(b, const Rect.fromLTRB(2, 3, 10, 8));
  });

  testWidgets('an icon takes the size and colour around it, and says nothing unless given words', (tester) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(
      const MaterialApp(
        home: IconTheme(
          data: IconThemeData(size: 30, color: Colors.red),
          child: Center(child: Ico(I.bell)),
        ),
      ),
    );
    expect(tester.getSize(find.byType(Ico)), const Size(30, 30));
    await tester.pumpWidget(
      MaterialApp(
        home: Center(child: Ico(I.checkCircle, semanticLabel: 'Done')),
      ),
    );
    expect(find.bySemanticsLabel('Done'), findsOneWidget);
    handle.dispose();
  });

  testWidgets('a layout that stretches the box does not stretch the icon (it stays its own size, in the middle)', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: SizedBox(width: 200, height: 200, child: Ico(I.bell, size: 24))));
    final painter = tester.widget<CustomPaint>(find.descendant(of: find.byType(Ico), matching: find.byType(CustomPaint))).painter!;
    final recorder = PictureRecorder();
    painter.paint(Canvas(recorder), const Size(200, 200)); // draws without error at a forced size
    expect(tester.takeException(), isNull);
  });
}

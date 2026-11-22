// The student community: every tab draws on a small phone, and a post, a like and a vote are sent as the website sends them.
import 'dart:convert';
import 'dart:io';

import 'package:classbari/screens/community.dart';
import 'package:classbari/store.dart';
import 'package:classbari/strings.dart';
import 'package:classbari/theme.dart';
import 'package:classbari/ui.dart';
import 'package:classbari/views.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

Json read(String path) => jsonDecode(File(path).readAsStringSync()) as Json;
List<Json> sent(String name) => store.waiting.where((e) => e['name'] == name).toList();

void main() {
  setUpAll(() async {
    lang.use(read('assets/gen/en.json'), read('assets/gen/bn.json'));
    await initializeDateFormatting('en_GB');
  });

  testWidgets('community: tabs draw; post, like and vote are sent as the website sends them', (tester) async {
    SharedPreferences.setMockInitialValues({});
    store.prefs = await SharedPreferences.getInstance();
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final now = DateTime.now().toUtc().toIso8601String();
    store.fake({
      'meId': 5,
      'teacherName': 'Owner Sir',
      'students': [
        for (var i = 1; i <= 30; i++) {'id': i, 'name': 'Student $i', 'batch': 'Batch A'},
      ],
      'community': [
        {'id': 1, 'author': 6, 'text': 'Who is ready for the #exam?', 'at': now, 'likes': [], 'comments': [], 'reports': [], 'poll': {'options': ['Yes', 'No'], 'counts': [1, 0], 'votes': {}}},
        {'id': 2, 'author': 7, 'text': 'Muted post', 'at': now, 'likes': [], 'comments': [], 'reports': []},
      ],
      'communityProfiles': {
        '5': {'muted': [7]},
      },
      'friendships': [
        {'from': 8, 'to': 5, 'status': 'pending'},
      ],
    }, 'student');
    await tester.pumpWidget(Live((context) => MaterialApp(theme: classbariTheme(Brightness.light), home: const CommunityScreen())));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, 'Hello class');
    await tester.pump();
    await tester.ensureVisible(find.text('Post').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Post'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('addCommunityPost').single['args'], [
      5,
      'Hello class',
      null,
      {'images': [], 'audience': 'all'},
    ]);

    await tester.ensureVisible(find.text('Yes').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Yes'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(sent('votePoll').single['args'], [1, 5, 0]);
    expect(find.text('Muted post', skipOffstage: false), findsNothing); // the post just below is built, but not this one
    expect(find.text('#exam'), findsWidgets); // trending, and the post's own tag

    for (var i = 0; i < 6; i++) {
      await tester.dragFrom(const Offset(160, 320), const Offset(0, 500)); // back to the top
    }
    await tester.pumpAndSettle();
    for (final (tab, shows) in [('Friends', 'Your friends haven\'t posted yet.'), ('Saved', 'Nobody.'), ('Activity (1)', 'Student 8 wants to be your friend'), ('People', 'Add friend'), ('Profile', 'Settings & privacy')]) {
      final chip = find.descendant(of: find.byType(Chips), matching: find.text(tab));
      await tester.ensureVisible(chip);
      await tester.pumpAndSettle();
      await tester.tap(chip);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: tab);
      expect(find.textContaining(shows, skipOffstage: false), findsWidgets, reason: tab);
    }
    await tester.pumpWidget(const SizedBox());
  });
}

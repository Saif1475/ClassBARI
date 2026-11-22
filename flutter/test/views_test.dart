// The Dart copies must give exactly what the website's own code gives (fixtures.json is written by `npm run flutter:gen`).
import 'dart:convert';
import 'dart:io';

import 'package:classbari/strings.dart';
import 'package:classbari/views.dart';
import 'package:flutter_test/flutter_test.dart';

Json read(String path) => jsonDecode(File(path).readAsStringSync()) as Json;

void main() {
  final f = read('test/fixtures.json');
  final now = DateTime.parse(f['now'] as String);
  lang.use(read('assets/gen/en.json'), read('assets/gen/bn.json'));

  test('words: every text with blanks reads as on the website, in English and Bangla', () {
    for (final w in rows(f['words'])) {
      lang.code = w['lang'] as String;
      expect(t(w['key'] as String, w['args'] as List), w['out'], reason: '${w['lang']} ${w['key']} ${w['args']}');
    }
    lang.code = 'en';
    expect(t('app.tabs.home'), 'Home');
    expect(t('no.such.key'), 'no.such.key');
    expect(lang.list('aichat.ideas'), hasLength(4));
  });

  test('money, days and XP', () {
    for (final c in rows(f['taka'])) {
      expect(taka(c['n'] as num), c['out']);
    }
    expect(dayKey(now), f['dayKey']);
    final xp = f['xp'] as Json, log = xp['log'] as Map;
    expect(streak(log, now), (days: xp['streak']['days'], doneToday: xp['streak']['doneToday']));
    expect(streak(const {}, now).days, xp['none']['days']);
    expect(streak(const {'2026-11-21': 4, '2026-11-20': 4}, now), (days: xp['yesterday']['days'], doneToday: false));
    expect(weekXp(log, now), xp['week']);
    expect(totalXp(log), xp['total']);
  });

  test('results and attendance', () {
    final r = f['results'] as Json;
    for (final c in rows(r['cases'])) {
      final got = gradedResults(rows(r['modules']), c['id'] as int);
      expect(
        [
          for (final x in got) [x.id, x.title, x.kind, x.score, x.points, x.pct],
        ],
        [
          for (final x in rows(c['out'])) [x['id'], x['title'], x['kind'], x['score'], x['points'], x['pct']],
        ],
      );
    }
    final a = f['attendance'] as Json;
    for (final c in rows(a['cases'])) {
      final got = monthAttendance(a['record'] as Map, c['id'] as int, c['days'] as List?, now);
      expect([got.held, got.present, got.pct], [c['out']['held'], c['out']['present'], c['out']['pct']], reason: '$c');
    }
  });

  test('quiz order: the same shuffle as the website, also for very large ids', () {
    for (final c in rows(f['quizOrder'])) {
      final got = quizOrder(c['item'] as Json, c['sid'] as int);
      expect(got.questions, c['out']['questions']);
      expect(got.options, c['out']['options']);
    }
  });

  test('enrolling a student: the same rules', () {
    final e = f['enrol'] as Json;
    for (final c in rows(e['cases'])) {
      expect(validateStudent(c['input'] as Json, rows(e['roll']), c['except'] as int?), c['out'], reason: '${c['input']}');
    }
    expect(strongPassword('Abcdef1!'), true);
    for (final weak in ['Abcde1!', 'abcdefg1!', 'ABCDEFG1!', 'Abcdefgh!', 'Abcdefg12']) {
      expect(strongPassword(weak), false, reason: weak);
    }
  });

  test('highlights, chat folders and page numbers', () {
    final find = f['find'] as Json;
    for (final c in rows(find['cases'])) {
      final got = findInText(find['page'] as String, c['phrase'] as String);
      expect(got == null ? null : [got.$1, got.$2], c['out'], reason: '${c['phrase']}');
    }
    final shared = read('assets/gen/shared.json');
    final topics = Topics(shared['topics'] as Json, shared['weights'] as Json);
    for (final c in rows(f['topics'])) {
      expect(topics.of(c['text'] as String), c['out'], reason: '${c['text']}');
    }
    for (final c in rows(f['pages'])) {
      expect(pageNumbers(c['page'] as int, c['pages'] as int), c['out']);
    }
    expect(shared['packs'], f['packs']);
  });
}

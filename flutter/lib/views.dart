// Read-only helpers: Dart copies of the website's own (src/lib/dates.ts, xp.ts, lms-views.ts, quiz.ts, site.ts,
// pdf-insights.ts, chat-topics.ts). Nothing here changes data: every change is made by the server.
// test/views_test.dart checks each one against answers produced by the website's code (npm run flutter:gen).

typedef Json = Map<String, dynamic>;

String _two(int n) => n.toString().padLeft(2, '0');

/// Local calendar day as YYYY-MM-DD.
String dayKey([DateTime? d]) {
  d ??= DateTime.now();
  return '${d.year}-${_two(d.month)}-${_two(d.day)}';
}

/// Date-only keys are local days; full ISO strings are instants.
DateTime toDate(String s) => DateTime.tryParse(s.length == 10 ? '${s}T00:00' : s)?.toLocal() ?? DateTime.fromMillisecondsSinceEpoch(0);

DateTime _shift(DateTime d, int days) => DateTime(d.year, d.month, d.day + days);

/// JavaScript's Math.round (halves go up, also below zero).
int jsRound(num x) => (x + 0.5).floor();

/// What a student owes: a number, whatever form it came in ("500" as text, or missing).
num feeDueOf(Json s) => s['feeDue'] is num ? s['feeDue'] as num : num.tryParse('${s['feeDue'] ?? ''}') ?? 0;

List<Json> rows(Object? list) => ((list as List?) ?? const []).cast<Json>();

// ---- XP -----------------------------------------------------------------------------------------------------------
num _xpOn(Map log, DateTime d) => (log[dayKey(d)] as num?) ?? 0;

/// Days in a row with XP. Today counts if studied; if not yet, yesterday's streak is still alive.
({int days, bool doneToday}) streak(Map log, [DateTime? today]) {
  today ??= DateTime.now();
  final doneToday = _xpOn(log, today) > 0;
  var day = doneToday ? today : _shift(today, -1);
  var days = 0;
  while (_xpOn(log, day) > 0) {
    days++;
    day = _shift(day, -1);
  }
  return (days: days, doneToday: doneToday);
}

/// XP this week (the week starts on Saturday, the Bangladesh school week).
num weekXp(Map log, [DateTime? today]) {
  today ??= DateTime.now();
  final back = (today.weekday % 7 + 1) % 7; // Sat=0 … Fri=6
  num sum = 0;
  for (var i = 0; i <= back; i++) {
    sum += _xpOn(log, _shift(today, -i));
  }
  return sum;
}

num totalXp(Map log) => log.values.fold<num>(0, (s, v) => s + (v as num));

// ---- marks and attendance -----------------------------------------------------------------------------------------
/// Everything of this student's that has a mark, oldest due date first.
List<({int id, String title, String kind, num score, num points, int pct})> gradedResults(List<Json> modules, int studentId) {
  final out = <({int id, String title, String kind, num score, num points, int pct, String due, int at})>[];
  for (final m in modules) {
    for (final it in rows(m['items'])) {
      final quiz = it['kind'] == 'quiz';
      final points = (it['points'] as num?) ?? (quiz ? 30 : 20);
      final Map? scores = it['scores'], handIns = it['submissions'];
      final Map? picked = quiz ? scores : handIns?['$studentId']; // a quiz: its marks by student; else this student's hand-in
      final num? score = picked?[quiz ? '$studentId' : 'grade'];
      if (score == null) continue;
      out.add((id: it['id'] as int, title: '${it['title']}', kind: '${it['kind']}', score: score, points: points, pct: jsRound(score / points * 100), due: (it['dueDate'] as String?) ?? '', at: out.length));
    }
  }
  out.sort((a, b) => a.due != b.due ? a.due.compareTo(b.due) : a.at - b.at); // equal dates keep their order, as on the website
  return [for (final r in out) (id: r.id, title: r.title, kind: r.kind, score: r.score, points: r.points, pct: r.pct)];
}

/// Attendance this month: class days recorded so far (optionally only the batch's weekdays) and how many were attended.
({int held, int present, int pct}) monthAttendance(Map attendance, int studentId, List? classDays, [DateTime? now]) {
  now ??= DateTime.now();
  var held = 0, present = 0;
  for (final d in attendance.keys.cast<String>()) {
    final x = toDate(d);
    if (x.year != now.year || x.month != now.month || x.isAfter(now)) continue;
    if (classDays != null && !classDays.contains(x.weekday % 7)) continue; // weekdays as JavaScript counts them: Sunday is 0
    held++;
    if (!((attendance[d] as List?) ?? const []).contains(studentId)) present++;
  }
  return (held: held, present: present, pct: held == 0 ? 0 : jsRound(present / held * 100));
}

// ---- quiz order ---------------------------------------------------------------------------------------------------
/// The same shuffled order every time for one student. Worked in doubles, because that is what the website's numbers are.
List<int> seededOrder(int n, int seed) {
  final order = List<int>.generate(n, (i) => i);
  var x = (seed.toDouble() * 2654435761.0) % 4294967296.0;
  if (x == 0) x = 1;
  for (var i = n - 1; i > 0; i--) {
    x = (x * 1664525 + 1013904223) % 4294967296.0;
    final j = (x % (i + 1)).toInt();
    final keep = order[i];
    order[i] = order[j];
    order[j] = keep;
  }
  return order;
}

/// Display order: sections stay together; with `shuffle`, questions (within their section) and options are per student.
({List<int> questions, List<List<int>> options}) quizOrder(Json item, int studentId) {
  final qs = rows(item['questions']);
  final shuffle = item['shuffle'] == true;
  final seed = studentId * 7919 + (item['id'] as int) % 100000;
  final sections = {for (final q in qs) (q['section'] as String?) ?? ''}.toList();
  final questions = <int>[];
  for (var si = 0; si < sections.length; si++) {
    final idx = [
      for (var i = 0; i < qs.length; i++)
        if (((qs[i]['section'] as String?) ?? '') == sections[si]) i,
    ];
    questions.addAll(shuffle ? seededOrder(idx.length, seed + si).map((k) => idx[k]) : idx);
  }
  final options = [for (var i = 0; i < qs.length; i++) shuffle ? seededOrder((qs[i]['options'] as List).length, seed + 101 * (i + 1)) : List<int>.generate((qs[i]['options'] as List).length, (k) => k)];
  return (questions: questions, options: options);
}

// ---- enrolling a student ------------------------------------------------------------------------------------------
final _gmail = RegExp(r'^(?!.*\.\.)[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?@gmail\.com$', caseSensitive: false); // no ".." (Gmail refuses it)
final _bdMobile = RegExp(r'^(?:\+?88)?01[3-9]\d{8}$');
bool isGmail(String email) => _gmail.hasMatch(email.trim());
String normEmail(String email) => email.trim().toLowerCase();
/// The inbox a Gmail address reaches: Gmail ignores dots and anything after "+". For "already used" checks (site.ts `inbox`).
String inbox(String email) => normEmail(email).replaceFirstMapped(RegExp(r'^([^@]+)@gmail\.com$'), (m) => '${m[1]!.split('+').first.replaceAll('.', '')}@gmail.com');
bool isBdMobile(String phone) => _bdMobile.hasMatch(phone.replaceAll(RegExp(r'[\s-]'), ''));

/// The enrolment rules, field → what is wrong with it (the keys of roster.errors). The server checks the same again.
Map<String, String> validateStudent(Json s, List<Json> existing, [int? exceptId]) {
  final others = existing.where((x) => x['id'] != exceptId).toList();
  final email = normEmail('${s['email'] ?? ''}'), guardianEmail = normEmail('${s['guardianEmail'] ?? ''}');
  String mail(Json x, String k) => inbox('${x[k] ?? ''}');
  final errors = <String, String>{};
  if ('${s['name'] ?? ''}'.trim().isEmpty) errors['name'] = 'nameRequired';
  if (!isGmail(email)) {
    errors['email'] = 'gmailInvalid';
  } else if (others.any((x) => mail(x, 'email') == inbox(email) || mail(x, 'guardianEmail') == inbox(email))) {
    errors['email'] = 'emailTaken';
  }
  if ('${s['guardianName'] ?? ''}'.trim().isEmpty) errors['guardianName'] = 'guardianNameRequired';
  if (!isGmail(guardianEmail)) {
    errors['guardianEmail'] = 'guardianGmailInvalid';
  } else if (inbox(guardianEmail) == inbox(email)) {
    errors['guardianEmail'] = 'sameEmail';
  } else if (others.any((x) => mail(x, 'email') == inbox(guardianEmail))) {
    errors['guardianEmail'] = 'guardianIsStudent';
  }
  if (!isBdMobile('${s['phone'] ?? ''}')) errors['phone'] = 'phoneInvalid';
  final own = '${s['studentPhone'] ?? ''}'.trim();
  if (own.isNotEmpty && !isBdMobile(own)) errors['studentPhone'] = 'studentPhoneInvalid';
  return errors;
}

/// The project's password rule: a small letter, a capital, a digit and a symbol, 8 or more.
bool strongPassword(String p) => p.length >= 8 && p.contains(RegExp(r'[a-z]')) && p.contains(RegExp(r'[A-Z]')) && p.contains(RegExp(r'\d')) && p.contains(RegExp(r'[^A-Za-z0-9]'));

// ---- highlighted PDFs ---------------------------------------------------------------------------------------------
final _space = RegExp(r'\s');

/// Where a highlight's text sits in a page's text (spaces and case ignored): [start, end) or null.
(int, int)? findInText(String page, String phrase) {
  // Spaces are left out on both sides: PDFs often split words ("de fi ned") and put spaces before full stops.
  final at = <int>[]; // index in `page` of each kept character
  final flat = StringBuffer();
  for (var i = 0; i < page.length; i++) {
    final ch = page[i];
    if (_space.hasMatch(ch) || ch == '\u0000') continue;
    flat.write(ch.toLowerCase());
    at.add(i);
  }
  final needle = phrase.toLowerCase().replaceAll(RegExp(r'[\s\u0000]+'), '');
  final found = needle.isEmpty ? -1 : flat.toString().indexOf(needle);
  if (found < 0 || found + needle.length - 1 >= at.length) return null;
  return (at[found], at[found + needle.length - 1] + 1);
}

// ---- AI chat folders ----------------------------------------------------------------------------------------------
/// Which topic folder a chat goes in, from its words. The keyword lists are the website's (assets/gen/shared.json).
class Topics {
  Topics(Json words, Json weights) : _order = words.keys.toList(), _weights = weights {
    for (var i = 0; i < _order.length; i++) {
      for (final kw in '${words[_order[i]]}'.split(RegExp(r'\s+'))) {
        _whole[kw] = (_whole[kw] ?? 0) | (1 << i);
        if (kw.runes.length >= 3) _starts[kw] = (_starts[kw] ?? 0) | (1 << i);
        if (kw.length > _longest) _longest = kw.length;
      }
    }
  }
  final List<String> _order;
  final Json _weights;
  final _whole = <String, int>{}, _starts = <String, int>{};
  var _longest = 0;
  static final _word = RegExp(r'[\p{L}\p{M}\p{N}]+', unicode: true);

  List<String> get all => [..._order, 'other'];

  String of(String text) {
    final counts = List<int>.filled(_order.length, 0);
    for (final m in _word.allMatches(text.toLowerCase())) {
      final w = m[0]!;
      var topics = _whole[w] ?? 0;
      for (var n = w.length < _longest ? w.length : _longest; n >= 3; n--) {
        topics |= _starts[w.substring(0, n)] ?? 0;
      }
      for (var i = 0; topics != 0; i++, topics >>= 1) {
        if (topics & 1 == 1) counts[i]++;
      }
    }
    var best = 'other';
    num top = 0;
    for (var i = 0; i < _order.length; i++) {
      final score = counts[i] * ((_weights[_order[i]] as num?) ?? 1);
      if (score > top) (best, top) = (_order[i], score);
    }
    return best;
  }
}

/// Set once at start-up (main.dart).
late Topics topics;

// ---- long lists ---------------------------------------------------------------------------------------------------
const pageSizes = [10, 20, 50, 100];

/// Which page numbers to offer: all when few, else the first, the last and those around the current one (0 marks a gap).
List<int> pageNumbers(int page, int pages) {
  if (pages <= 7) return [for (var i = 1; i <= pages; i++) i];
  final out = <int>[];
  for (var i = 1; i <= pages; i++) {
    if (i == 1 || i == pages || (i - page).abs() <= 1) {
      out.add(i);
    } else if (out.last != 0) {
      out.add(0);
    }
  }
  return out;
}

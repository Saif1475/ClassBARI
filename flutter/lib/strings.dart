import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;

/// The website's own wording, copied into assets/gen by `npm run flutter:gen` (text functions become "{0}" templates).
class Lang extends ChangeNotifier {
  String code = 'en';
  Map<String, dynamic> _en = const {}, _bn = const {};

  Future<void> load() async {
    _en = jsonDecode(await rootBundle.loadString('assets/gen/en.json')) as Map<String, dynamic>;
    _bn = jsonDecode(await rootBundle.loadString('assets/gen/bn.json')) as Map<String, dynamic>;
  }

  @visibleForTesting
  void use(Map<String, dynamic> en, Map<String, dynamic> bn) {
    _en = en;
    _bn = bn;
  }

  void set(String to) {
    code = to == 'bn' ? 'bn' : 'en';
    notifyListeners();
  }

  Object? _raw(String key) => (code == 'bn' ? _bn[key] : null) ?? _en[key];

  /// The text for `key` with its blanks filled: "{0}" as written, "{0n}" as a number in the reader's digits.
  String text(String key, [List<Object?> args = const []]) {
    final first = args.isEmpty ? null : args[0];
    // One language for both lookups: Bangla wording must not pick up an English "1 chat" line that Bangla doesn't need.
    final words = code == 'bn' && _bn.containsKey(key) ? _bn : _en;
    final special = first == 0 || first == 1 ? words['$key=$first'] : null; // "Submit now?" for none, "1 student" for one
    final found = special ?? words[key];
    if (found is! String) return key;
    if (args.isEmpty) return found;
    return found.replaceAllMapped(RegExp(r'\{(\d)(n?)\}'), (m) {
      final i = int.parse(m[1]!);
      final v = i < args.length ? args[i] : '';
      return m[2]!.isEmpty ? show(v) : localNumber(v, code);
    });
  }

  List<String> list(String key) => ((_raw(key) as List?) ?? const []).cast<String>();
}

final lang = Lang();
String t(String key, [List<Object?> args = const []]) => lang.text(key, args);

/// A number as JavaScript prints it: 7, not 7.0.
String show(Object? v) => v is double && v == v.roundToDouble() && v.abs() < 1e15 ? v.toInt().toString() : '$v';

const _bnDigits = '০১২৩৪৫৬৭৮৯';
String bnDigits(String s) => s.replaceAllMapped(RegExp(r'\d'), (m) => _bnDigits[int.parse(m[0]!)]);

/// 1234567 → "12,34,567" (the grouping used in Bangladesh) or "1,234,567".
String grouped(int n, {required bool indian}) {
  final digits = n.abs().toString();
  if (digits.length <= 3) return n.toString();
  final head = digits.substring(0, digits.length - 3), tail = digits.substring(digits.length - 3);
  final every = indian ? 2 : 3;
  final parts = <String>[];
  for (var end = head.length; end > 0; end -= every) {
    parts.insert(0, head.substring(end - every < 0 ? 0 : end - every, end));
  }
  return '${n < 0 ? '-' : ''}${parts.join(',')},$tail';
}

/// What the website's toLocaleString("bn-BD") gives in Bangla, and plain grouping in English.
String localNumber(Object? v, String code) {
  if (v is! num) return '$v';
  if (v != v.roundToDouble()) return code == 'bn' ? bnDigits('$v') : '$v';
  return code == 'bn' ? bnDigits(grouped(v.toInt(), indian: true)) : grouped(v.toInt(), indian: false);
}

/// ৳12,34,567 — always in English digits, as on the website.
String taka(num n) => '৳${n == n.roundToDouble() ? grouped(n.toInt(), indian: true) : n}';

// This person's slice of their institute's data: loaded from the ClassBARI server, kept on the phone so the app opens
// at once (and without internet), and changed only by the server: a change is sent as { name, args, base }, the same
// actions the website sends, and the server checks it and answers with the new data. No rule is repeated in Dart.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show SignOutScope;

import 'api.dart';
import 'config.dart';
import 'strings.dart';
import 'views.dart';

enum Status { loading, ready, offline, noAccess, signedOut }

const _data = 'classbari-data', _role = 'classbari-role', _lang = 'classbari-lang', _inst = 'classbari-institute';
const _queue = 'classbari-outbox', _child = 'classbari-child', _size = 'classbari-page-size';
const _keepMax = 2000000; // a bigger institute's data is not kept on the phone; it loads when the app opens
const _queueMax = 1000000; // changes waiting for internet survive closing the app, up to this size (a photo does not)

class Store extends ChangeNotifier {
  late SharedPreferences prefs;
  Json? state;
  String? role, email;
  Status status = Status.loading;
  bool signedIn = false, syncFailed = false;

  /// ClassBARI suspended this institute: saves are refused; the banner says why (the website shows the same).
  var suspended = false;
  final List<Json> _outbox = [];
  int _version = 0, _lastBase = 0;
  Timer? _timer;

  /// Changes not yet confirmed by the server (shown as "saving" or, offline, as waiting).
  List<Json> get waiting => List.unmodifiable(_outbox);
  Json? get institute => _json(_inst);
  int get pageSize => prefs.getInt(_size) ?? 20;
  set pageSize(int n) => setting(_size, n);
  int get pickedChild => prefs.getInt(_child) ?? 0;
  set pickedChild(int id) {
    prefs.setInt(_child, id);
    notifyListeners();
  }

  // ---- settings kept on this phone (they stay when someone logs out, like the website's) --------------------------
  /// light, dark or system ("Same as phone").
  String get themeMode => prefs.getString('classbari-theme') ?? 'system';

  /// green or sky; null: by the student's profile, as before there was a setting.
  String? get tone => prefs.getString('classbari-tone');

  /// How much bigger the letters are: 1, 1.125 or 1.25 (the website's A, A+ and A++).
  double get textSize => prefs.getDouble('classbari-text-size') ?? 1;

  /// Glass effect: 0 off (the flat look), 1 soft, 2 medium (new phones start here), 3 high; the website's levels and key.
  int get glass => (prefs.getInt('edunest-glass') ?? 2).clamp(0, 3);

  /// How the AI should answer: {lang: bn|en, length: short|long}; a missing key means "as usual".
  Json get aiPrefs => _json('classbari-ai-prefs') ?? {};

  /// The AI model picked last time (used for new chats while the pack still has it).
  String? get aiModel => prefs.getString('classbari-ai-model');

  /// Sky & pink instead of green? The person's own choice; until they choose, by profile (the website's theme for girls).
  bool get sky {
    if (tone != null) return tone == 'sky';
    final who = me ?? (kApp == 'guardian' ? child : null);
    return who?['gender'] == 'female';
  }

  /// Save one setting and redraw. `null` removes it (back to the default).
  void setting(String key, Object? value) {
    switch (value) {
      case null:
        prefs.remove(key);
      case final double v:
        prefs.setDouble(key, v);
      case final int v:
        prefs.setInt(key, v);
      case final Map<String, dynamic> v:
        prefs.setString(key, jsonEncode(v));
      default:
        prefs.setString(key, '$value');
    }
    notifyListeners();
  }

  Json? _json(String key) {
    try {
      final v = jsonDecode(prefs.getString(key) ?? 'null');
      return v is Map<String, dynamic> ? v : null;
    } catch (_) {
      return null; // unreadable: as if nothing was kept
    }
  }

  /// Read what the phone kept: language, the last data seen, changes still waiting to be sent.
  Future<void> open(SharedPreferences p, {String? deviceLang}) async {
    prefs = p;
    lang.set(prefs.getString(_lang) ?? (deviceLang == 'bn' ? 'bn' : 'en'));
    state = _json(_data);
    role = prefs.getString(_role);
    try {
      _outbox.addAll(((jsonDecode(prefs.getString(_queue) ?? '[]') as List).cast<Json>()));
    } catch (_) {
      // unreadable queue: nothing to send
    }
  }

  void setLang(String code) {
    prefs.setString(_lang, code);
    lang.set(code);
  }

  void setInstitute(Json? card) {
    card == null ? prefs.remove(_inst) : prefs.setString(_inst, jsonEncode(card));
    notifyListeners();
  }

  /// Follow the login: load when signed in, forget everything when signed out.
  void follow() {
    void now() {
      final s = auth.currentSession;
      final was = signedIn;
      signedIn = s != null;
      email = s?.user.email;
      if (!signedIn) {
        _forget();
        status = Status.signedOut;
        notifyListeners();
      } else if (!was) {
        status = state == null ? Status.loading : Status.ready;
        notifyListeners();
        refresh();
      }
    }

    now();
    auth.onAuthStateChange.listen((_) => now(), onError: (_) {}); // a failed renewal (no internet) is not a log-out
    // Fresh data every 20 seconds while the app is open (the server answers "nothing new" most times).
    _timer ??= Timer.periodic(const Duration(seconds: 20), (_) {
      if (signedIn && active) refresh();
    });
  }

  /// False while the app is in the background: no requests then.
  bool active = true;

  void _forget() {
    state = null;
    role = null;
    _version = 0;
    _outbox.clear();
    syncFailed = false;
    for (final k in prefs.getKeys().where((k) => k == _data || k == _role || k == _queue || k == _child || k.startsWith('classbari-ai-chats-')).toList()) {
      prefs.remove(k); // the next person on this phone must not see this person's data
    }
  }

  void _adopt(Json d) {
    _version = (d['version'] as num?)?.toInt() ?? _version;
    final r = d['role'] as String?;
    if (r != null) {
      role = r;
      prefs.setString(_role, r);
    }
    if (d['state'] is Map<String, dynamic>) {
      state = d['state'] as Json;
      final text = jsonEncode(state);
      text.length <= _keepMax ? prefs.setString(_data, text) : prefs.remove(_data);
    }
  }

  /// Send what is waiting, then ask the server for anything new.
  Future<void> refresh() async {
    if (!signedIn) return;
    if (_outbox.isNotEmpty) await _flush();
    if (_outbox.isEmpty) await _pull(); // else still offline: keep showing what we have
  }

  Future<void> _pull() async {
    final was = status;
    var changed = false;
    try {
      final res = await api('/api/data?v=$_version');
      if (res.statusCode == 200) {
        // A big institute's data is read on a background thread, so the screen doesn't stutter while it arrives.
        _adopt((res.body.length > 200000 ? await compute(jsonDecode, res.body) : jsonDecode(res.body)) as Json);
        changed = true;
        status = Status.ready;
      } else if (res.statusCode == 204) {
        status = Status.ready;
      } else if (res.statusCode == 401) {
        // The login may have been ended elsewhere: renewing it finds out (and logs out on this phone if so).
        if (!await renewLogin()) return;
        status = Status.noAccess; // signed in, but not on any list (or not at the institute picked)
      } else {
        status = state == null ? Status.loading : Status.offline;
      }
    } catch (_) {
      status = Status.offline;
    }
    if (changed || status != was) notifyListeners(); // "nothing new" every 20 s no longer rebuilds every screen
  }

  void _keepQueue() {
    // What does not fit (a big photo) stays only in memory; every smaller change is still saved, in order.
    final kept = <String>[];
    var size = 2;
    for (final e in _outbox) {
      final one = jsonEncode(e);
      if (size + one.length + 1 > _queueMax) continue;
      kept.add(one);
      size += one.length + 1;
    }
    prefs.setString(_queue, '[${kept.join(',')}]');
  }

  /// Make a change: `name` and `args` are an action of the website (src/lib/lms-actions.ts). Returns true once the
  /// server has saved it; false if it was refused or is waiting for internet.
  Future<bool> act(String name, List<Object?> args) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    _lastBase = now > _lastBase + 100 ? now : _lastBase + 100; // new ids are counted up from here, so no two changes share one
    final entry = <String, dynamic>{'name': name, 'args': args, 'base': _lastBase};
    _outbox.add(entry);
    syncFailed = false;
    _keepQueue();
    notifyListeners();
    await _flush();
    if (_outbox.contains(entry) && status != Status.offline) await _flush(); // added just as the last send finished
    return !_outbox.contains(entry) && !syncFailed;
  }

  /// One sender at a time: everyone waits for the same run, which empties the queue in order.
  Future<void> _flush() => _flushing ??= _send().whenComplete(() => _flushing = null);
  Future<void>? _flushing;

  Future<void> _send() async {
    var refused = false;
    try {
      while (_outbox.isNotEmpty) {
        final res = await api('/api/data', body: _outbox.first);
        if (res.statusCode == 200) {
          suspended = false;
          _outbox.removeAt(0);
          _adopt(jsonDecode(res.body) as Json);
          status = Status.ready;
        } else if (res.statusCode == 401 || res.statusCode == 429 || res.statusCode >= 500) {
          if (res.statusCode != 401) status = Status.offline; // busy or too fast: kept, and tried again on the next refresh
          break;
        } else {
          suspended = res.statusCode == 403 && res.body.contains('"suspended"');
          _outbox.clear(); // refused: later changes may depend on it, so show what the server really has
          refused = syncFailed = true;
        }
        _keepQueue();
        notifyListeners();
      }
    } catch (_) {
      status = Status.offline; // kept in the queue and sent on the next refresh
    }
    notifyListeners();
    if (refused) {
      _version = 0;
      await _pull();
    }
  }

  /// True while a change with this name and these first arguments is on its way (to show a switch as already flipped).
  int pending(String name, List<Object?> first) => _outbox.where((e) => e['name'] == name && listEquals((e['args'] as List).take(first.length).toList(), first)).length;

  /// Tests only: show this data as if it had come from the server, with nothing waiting to be sent.
  @visibleForTesting
  void fake(Json? data, String? as) {
    state = data;
    role = as;
    signedIn = data != null;
    status = Status.ready;
    syncFailed = false;
    _outbox.clear();
    notifyListeners();
  }

  /// Run before logging out, while still signed in (set by main.dart).
  Future<void> Function()? beforeSignOut;

  Future<void> signOut() async {
    await beforeSignOut?.call(); // e.g. this phone stops getting notifications (needs the login still)
    _forget();
    notifyListeners();
    await auth.signOut(scope: SignOutScope.local); // this phone only
  }

  // ---- who is looking --------------------------------------------------------------------------------------------
  /// Enrolled students. Those who asked to join from a link and wait for approval are left out, as on the website.
  /// Worked out once per new copy of the data, not on every read: list rows ask for a student by id many times a frame.
  List<Json> get students => _studentsFresh().list;
  Object? _studentsOf;
  ({List<Json> list, Map<Object?, Json> byId}) _students = (list: const [], byId: const {});
  ({List<Json> list, Map<Object?, Json> byId}) _studentsFresh() {
    final raw = state?['students'];
    if (identical(raw, _studentsOf)) return _students; // the data is replaced as a whole, never changed in place
    _studentsOf = raw;
    final list = List<Json>.unmodifiable(rows(raw).where((s) => s['pending'] != true));
    return _students = (list: list, byId: {for (final s in list.reversed) s['id']: s}); // reversed: the first with an id wins, as a search would
  }
  List<Json> get pendingStudents => rows(state?['students']).where((s) => s['pending'] == true).toList();
  List<Json> get modules => rows(state?['modules']);
  List<Json> get batches => rows(state?['batches']);
  Json? student(Object? id) => _studentsFresh().byId[id];

  /// The signed-in student (the server sends only their own record in full).
  Json? get me => student(state?['meId']);

  /// A guardian's children, and the one picked.
  List<Json> get children => students.where((s) => ((state?['parentChildren'] as List?) ?? const []).contains(s['id'])).toList();
  Json? get child => children.where((c) => c['id'] == pickedChild).firstOrNull ?? children.firstOrNull;

  /// Owners and managers look after every batch; a teacher after their own.
  bool get runsAll => role == 'owner' || role == 'manager';
  String get staffName => '${state?[runsAll ? 'teacherName' : 'teacherLogin'] ?? ''}';
  List<Json> get myBatches => batches.where((b) => runsAll || b['teacher'] == staffName).toList();
}

final store = Store();

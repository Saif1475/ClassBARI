// Notifications on the phone (Firebase Cloud Messaging). The server decides who gets what (src/lib/notify.ts);
// this file only lets the server reach this phone, and opens the right tab when a notification is tapped.
import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart' show ValueNotifier, debugPrint, kIsWeb, visibleForTesting;

import 'api.dart';
import 'store.dart';
import 'strings.dart';

/// The screen a tapped notification asks for (home, todo, results, notices, messages); the tabs listen.
final openScreen = ValueNotifier<String?>(null);

/// A notification that arrived while the app was open (Android shows none then): the app shows it itself.
void Function(String title, String body, String screen)? onForeground;

var _ready = false;
String? _token;
var _tried = false; // someone signed in on this phone in this run: their token may be on the server even if this run never registered it
StreamSubscription<String>? _refresh;
const _dropKey = 'instanton-push-forget'; // set while Google still has to forget the last person's token: survives a restart
Timer? _retry;

/// Tells Google to forget this phone's token (needs internet). Tests swap it.
// ignore: deprecated_member_use
Future<void> Function() deleteFcmToken = () => FirebaseMessaging.instance.deleteToken();
@visibleForTesting
set pushTokenForTest(String? t) => _token = t;
@visibleForTesting
set pushReadyForTest(bool r) => _ready = r;

/// At app start. Browser builds (used for screenshots) have no Firebase setup, so they skip this.
Future<void> startPush() async {
  if (kIsWeb) return;
  try {
    await Firebase.initializeApp(); // reads android/app/google-services.json
    FirebaseMessaging.onMessageOpenedApp.listen(_open);
    final first = await FirebaseMessaging.instance.getInitialMessage(); // the app was closed and opened by a tap
    if (first != null) _open(first);
    if (store.prefs.getBool(_dropKey) ?? false) unawaited(_drop()); // logged out offline last time
    FirebaseMessaging.onMessage.listen((m) => onForeground?.call(m.notification?.title ?? '', m.notification?.body ?? '', '${m.data['screen'] ?? 'home'}'));
    _ready = true;
  } catch (e) {
    debugPrint('notifications are off: $e'); // a build without google-services.json still runs
  }
}

void _open(RemoteMessage m) => openScreen.value = '${m.data['screen'] ?? 'home'}';

/// After login: ask to show notifications (Android 13 and newer ask the person once) and tell the server this phone.
Future<void> registerPush() async {
  if (!_ready || _token != null) return;
  _tried = true;
  try {
    if (store.prefs.getBool(_dropKey) ?? false) await _drop(); // the new person must not get the last one's token
    if (store.prefs.getBool(_dropKey) ?? false) return; // still offline: registering now would be undone by the retry
    await FirebaseMessaging.instance.requestPermission();
    // shortcut: the FCM token calls are marked old in firebase_messaging 17 (new: register() and an installation
    // id). They still work and the server sends by token; move both together once Google's send-by-id API is checked.
    // ignore: deprecated_member_use
    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) return debugPrint('notifications: Google gave no address for this phone');
    await _send(token);
    // ignore: deprecated_member_use
    _refresh ??= FirebaseMessaging.instance.onTokenRefresh.listen(_send); // Google changes it now and then
  } catch (e) {
    debugPrint('notifications: not registered: $e');
  }
}

Future<void> _send(String token) async {
  final res = await api('/api/notify/device', body: {'token': token, 'lang': lang.code});
  if (res.statusCode == 200) _token = token;
  debugPrint('notifications: ${res.statusCode == 200 ? 'this phone is registered' : 'not registered (${res.statusCode})'}');
}

/// Before logging out: this phone gets nothing more for this person.
Future<void> forgetPush() async {
  final token = _token, owed = token != null || _tried;
  _token = null;
  _tried = false;
  if (!_ready || !owed) return; // offline at app start too: registered on an earlier day, so Google must still forget it
  await store.prefs.setBool(_dropKey, true);
  try {
    if (token != null) await api('/api/notify/device', body: {'token': token}, delete: true);
  } catch (_) {
    // offline: the server row stays, but once Google forgets the token the server's next send gets "gone" and deletes it
  }
  await _drop();
}

/// Makes Google forget the token (the next person on this phone gets a new one). Offline it tries again every minute,
/// and at the next app start, until it works: a token Google still knows keeps showing the last person's notifications.
Future<void> _drop() async {
  _retry?.cancel();
  if (!(store.prefs.getBool(_dropKey) ?? false)) return; // another try already worked: a late one would delete the next person's token
  try {
    await deleteFcmToken();
    await store.prefs.remove(_dropKey);
  } catch (e) {
    debugPrint('notifications: token not forgotten yet: $e');
    _retry?.cancel(); // overlapping tries keep one timer
    _retry = Timer(const Duration(minutes: 1), _drop);
  }
}

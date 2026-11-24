// Admitting an enquiry: when the server refuses the new student (its batch was deleted meanwhile), the enquiry stays
// open, so its details are not lost. Its own file: it starts Supabase with a pretend server, which the other tests don't.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:classbari/api.dart';
import 'package:classbari/screens/institute.dart';
import 'package:classbari/screens/institute_more.dart';
import 'package:classbari/store.dart';
import 'package:classbari/strings.dart';
import 'package:classbari/theme.dart';
import 'package:classbari/ui.dart';
import 'package:classbari/views.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

Json read(String path) => jsonDecode(File(path).readAsStringSync()) as Json;

void main() {
  setUpAll(() async {
    lang.use(read('assets/gen/en.json'), read('assets/gen/bn.json'));
    await initializeDateFormatting('en_GB');
    SharedPreferences.setMockInitialValues({});
    store.prefs = await SharedPreferences.getInstance();
    await Supabase.initialize(url: 'http://localhost', publishableKey: 'x', authOptions: const FlutterAuthClientOptions(localStorage: EmptyLocalStorage(), detectSessionInUri: false));
  });

  testWidgets('a refused student leaves the enquiry open', (tester) async {
    store.fake({'batches': [{'id': 'a', 'name': 'Batch A'}], 'students': []}, 'teacher');
    final sent = <String>[];
    final server = MockClient((r) async {
      if (r.method == 'GET') return http.Response('', 204); // the reload after a refusal: nothing new
      final name = (jsonDecode(r.body) as Map)['name'] as String;
      sent.add(name);
      return http.Response('{"error":"bad"}', name == 'addStudent' ? 400 : 200);
    });
    await http.runWithClient(() async {
      await tester.pumpWidget(Live((context) => MaterialApp(theme: classbariTheme(Brightness.light), home: const NewStudent(admission: {'id': 9, 'name': 'Nila', 'guardian': 'Mr N', 'phone': '01711000004', 'wants': 'Batch A', 'stage': 'enquiry'}))));
      await tester.pump();
      await tester.enterText(find.widgetWithText(TextField, t('roster.email')), 'nila@gmail.com');
      await tester.enterText(find.widgetWithText(TextField, t('roster.guardianEmail')), 'mrn@gmail.com');
      await tester.tap(find.text(t('roster.female')));
      await tester.ensureVisible(find.text(t('admissions.admitBtn')));
      await tester.pump();
      await tester.runAsync(() async {
        await tester.tap(find.text(t('admissions.admitBtn')));
        await Future<void>.delayed(const Duration(milliseconds: 500));
      });
      await tester.pump(const Duration(seconds: 5));
    }, () => server);
    expect(sent, ['addStudent']); // no updateAdmission 'admitted'
  });

  test('a change saved after an older queued change was refused says saved, not failed', () async {
    store.fake({'payments': []}, 'teacher');
    var online = false;
    final server = MockClient((r) async {
      if (!online) throw http.ClientException('offline');
      if (r.method == 'GET') return http.Response('', 204);
      final name = (jsonDecode(r.body) as Map)['name'] as String;
      return name == 'old' ? http.Response('{"error":"forbidden"}', 403) : http.Response('{"state":{"payments":[1]}}', 200);
    });
    await http.runWithClient(() async {
      expect(await store.act('old', []), false); // offline: waits in the queue
      online = true;
      expect(await store.act('recordPayment', [1, 500]), true); // the old one is refused, this one is saved
      expect(store.syncFailed, true); // the banner still tells about the refused one
    }, () => server);
  });

  test('a backlog of queued changes reads only the answer to the last one', () async {
    store.fake({'payments': []}, 'teacher');
    var online = false;
    final sent = <int>[];
    final server = MockClient((r) async {
      if (!online) throw http.ClientException('offline');
      if (r.method == 'GET') return http.Response('', 204);
      final n = ((jsonDecode(r.body) as Map)['args'] as List).first as int;
      sent.add(n);
      return http.Response(n < 3 ? 'not read' : '{"state":{"payments":[3]},"version":3}', 200); // the earlier answers are never decoded, so even unreadable ones don't stop the queue
    });
    await http.runWithClient(() async {
      await store.act('recordPayment', [1]);
      await store.act('recordPayment', [2]);
      online = true;
      expect(await store.act('recordPayment', [3]), true);
    }, () => server);
    expect(sent, [1, 2, 3]);
    expect(store.waiting, isEmpty);
    expect(store.state!['payments'], [3]);
  });

  test('changes made while the institute is suspended are kept, and sent once it is lifted', () async {
    store.fake({'payments': []}, 'teacher');
    var lifted = false;
    final sent = <int>[];
    final server = MockClient((r) async {
      if (r.method == 'GET') return http.Response('', 204);
      if (!lifted) return http.Response('{"error":"suspended"}', 423);
      sent.add(((jsonDecode(r.body) as Map)['args'] as List).first as int);
      return http.Response('{"state":{"payments":[1,2]},"version":4}', 200);
    });
    await http.runWithClient(() async {
      expect(await store.act('recordPayment', [1]), false); // cash taken offline, sent while suspended
      expect(await store.act('recordPayment', [2]), false);
      expect(store.waiting.length, 2); // nothing thrown away
      expect([store.suspended, store.syncFailed], [true, true]); // the banner says why
      lifted = true;
      expect(await store.act('recordPayment', [3]), true);
    }, () => server);
    expect(sent, [1, 2, 3]);
    expect([store.waiting.isEmpty, store.suspended], [true, false]);
  });

  testWidgets('publishing a web address another institute already shows says so, and nothing is sent', (tester) async {
    store.fake({'site': {'slug': 'tanvir', 'bio': '', 'bkash': '', 'published': false}, 'batches': []}, 'owner');
    final asked = <String>[];
    final server = MockClient((r) async {
      if (r.url.path == '/api/public') {
        asked.add(r.url.queryParameters['slug']!);
        return http.Response(r.url.queryParameters['slug'] == 'physics-care' ? '{"site":{"slug":"physics-care","published":true}}' : '{}', 200);
      }
      return http.Response('', 204);
    });
    await http.runWithClient(() async {
      await tester.pumpWidget(Live((context) => MaterialApp(theme: classbariTheme(Brightness.light), home: const WebsiteScreen())));
      await tester.enterText(find.widgetWithText(TextField, t('website.address')), 'Physics Care');
      await tester.tap(find.byType(Switch));
      await tester.pump();
      await tester.runAsync(() async {
        await tester.tap(find.text(t('settings.save')));
        await Future<void>.delayed(const Duration(milliseconds: 300));
      });
      await tester.pump(const Duration(milliseconds: 300));
    }, () => server);
    expect(asked, ['physics-care']);
    expect(find.text(t('website.taken')), findsOneWidget);
    expect(store.waiting.where((e) => e['name'] == 'updateSite'), isEmpty);
    await tester.pumpWidget(const SizedBox());
  });

  test('a 401 that goes away with a renewed login does not say "not enrolled"', () async {
    store.fake({'payments': []}, 'teacher');
    final far = DateTime.now().add(const Duration(days: 1)).millisecondsSinceEpoch ~/ 1000;
    Map<String, Object> session(String token) => {'access_token': token, 'refresh_token': 'r', 'token_type': 'bearer', 'expires_in': 86400, 'expires_at': far, 'user': {'id': 'u1', 'aud': 'authenticated', 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-01-01T00:00:00Z'}};
    final server = MockClient((r) async {
      if (r.url.path.contains('/auth/')) return http.Response(jsonEncode(session('new')), 200); // the login renewal works
      if (r.headers['Authorization'] != 'Bearer new') return http.Response('{"error":"login"}', 401); // the old token (or a hiccup) is refused once
      return r.method == 'GET' ? http.Response('', 204) : http.Response('{"state":{"payments":[1]}}', 200);
    });
    await Supabase.instance.dispose(); // started again with the pretend server, so the login renewal reaches it too
    await Supabase.initialize(url: 'http://localhost', publishableKey: 'x', httpClient: server, authOptions: const FlutterAuthClientOptions(localStorage: EmptyLocalStorage(), detectSessionInUri: false, autoRefreshToken: false));
    await http.runWithClient(() async {
      await auth.recoverSession(jsonEncode(session('old')));
      expect(await store.act('recordPayment', [1, 500]), true); // sent again with the renewed login: saved
      expect(store.status, Status.ready);
      store.status = Status.ready;
      await auth.recoverSession(jsonEncode(session('old2')));
      await store.refresh(); // the same for a download
      expect(store.status, Status.ready);
    }, () => server);
  });

  testWidgets('a change that takes too long is stopped, not left uploading beside the retry', (tester) async {
    final slow = _Hanging();
    await http.runWithClient(() async {
      Object? error;
      api('/api/data', body: {'name': 'addLesson', 'args': [], 'base': 1}).catchError((Object e) { error = e; return http.Response('', 500); });
      await tester.pump(const Duration(seconds: 39));
      expect(slow.closed, false); // still within its time
      await tester.pump(const Duration(seconds: 2));
      expect(error, isA<TimeoutException>());
      expect(slow.closed, true); // the upload itself stops
    }, () => slow);
  });
}

/// A server that never answers, and notes when the app gives the request up.
class _Hanging extends http.BaseClient {
  bool closed = false;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) => Completer<http.StreamedResponse>().future;
  @override
  void close() => closed = true;
}

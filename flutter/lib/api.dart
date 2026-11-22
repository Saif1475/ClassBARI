import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'store.dart';

GoTrueClient get auth => Supabase.instance.client.auth;

/// The login token, renewed first if it has run out.
Future<String?> _token() async {
  var s = auth.currentSession;
  if (s != null && s.isExpired) s = await renewLogin() ? auth.currentSession : s;
  return s?.accessToken;
}

/// Renew the login. Without internet it stays as it is (true); a login ended elsewhere (a password change, or "log
/// out everywhere") logs out on this phone, which shows the login screen again (false).
Future<bool> renewLogin() async {
  try {
    return (await auth.refreshSession()).session != null || await _ended();
  } on AuthRetryableFetchException {
    return true; // no internet: keep what there is
  } on AuthException {
    return _ended();
  } catch (_) {
    return true;
  }
}

Future<bool> _ended() async {
  await auth.signOut(scope: SignOutScope.local).catchError((_) {});
  return false;
}

Future<Map<String, String>> _headers() async {
  final token = await _token();
  final inst = kPicksInstitute ? store.institute : null; // owners: whichever institute they own
  return {'Content-Type': 'application/json', if (token != null) 'Authorization': 'Bearer $token', if (inst != null) 'X-ClassBARI-Institute': '${inst['id']}'};
}

/// A request to the ClassBARI server as the signed-in person.
Future<http.Response> api(String path, {Object? body, bool delete = false}) async {
  final uri = Uri.parse('$kApiUrl$path'), headers = await _headers();
  final sent = delete ? http.delete(uri, headers: headers, body: jsonEncode(body)) : (body == null ? http.get(uri, headers: headers) : http.post(uri, headers: headers, body: jsonEncode(body)));
  return sent.timeout(const Duration(seconds: 40));
}

/// The same, with the answer arriving piece by piece (AI chat). The caller closes `client` to stop early.
Future<http.StreamedResponse> apiStream(http.Client client, String path, Object body) async {
  final req = http.Request('POST', Uri.parse('$kApiUrl$path'))
    ..headers.addAll(await _headers())
    ..body = jsonEncode(body);
  return client.send(req);
}

/// A PDF file's bytes sent as they are (AI chat → Highlight); the answer is a PDF too. The AI may read for up to 2 minutes.
Future<http.Response> apiPdf(String path, List<int> bytes) async {
  final headers = {...await _headers(), 'Content-Type': 'application/pdf'};
  return http.post(Uri.parse('$kApiUrl$path'), headers: headers, body: bytes).timeout(const Duration(seconds: 150));
}

/// Stored files (/api/files/…) need a short-lived link; other links are used as they are.
Future<String?> fileLink(String url) async {
  if (!url.startsWith('/api/files/')) return url.startsWith('/') ? '$kApiUrl$url' : url;
  try {
    final res = await api('$url?link=1');
    return res.statusCode == 200 ? (jsonDecode(res.body) as Map)['url'] as String? : null;
  } catch (_) {
    return null;
  }
}

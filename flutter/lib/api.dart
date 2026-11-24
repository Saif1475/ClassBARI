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
  final inst = store.picksInstitute ? store.institute : null; // owners: whichever institute they own
  return {'Content-Type': 'application/json', if (token != null) 'Authorization': 'Bearer $token', if (inst != null) 'X-ClassBARI-Institute': '${inst['id']}', if (kApp == 'guardian') 'X-ClassBARI-Role': 'guardian'}; // a teacher whose child studies at their centre opens as the guardian here
}

/// A request to the Instanton Campus server as the signed-in person.
Future<http.Response> api(String path, {Object? body, bool delete = false}) async {
  final uri = Uri.parse('$kApiUrl$path'), headers = await _headers(), text = jsonEncode(body), client = http.Client();
  final sent = delete ? client.delete(uri, headers: headers, body: text) : (body == null ? client.get(uri, headers: headers) : client.post(uri, headers: headers, body: text));
  // A big change (a PDF lesson as a data: link) gets time to upload at about 20 KB/s; closing the client on a timeout really stops the upload, so the next refresh's retry is not a second copy beside it.
  final res = await sent.timeout(Duration(seconds: 40 + (body == null ? 0 : text.length ~/ 20000))).whenComplete(client.close);
  store.clockFrom(res.headers['date']);
  return res;
}

/// The same, with the answer arriving piece by piece (AI chat). The caller closes `client` to stop early.
Future<http.StreamedResponse> apiStream(http.Client client, String path, Object body) async {
  final req = http.Request('POST', Uri.parse('$kApiUrl$path'))
    ..headers.addAll(await _headers())
    ..body = jsonEncode(body);
  return client.send(req);
}

/// A file's bytes sent as they are, with its type (a student list to import: Excel, CSV or PDF).
Future<http.Response> apiFile(String path, List<int> bytes, String type, {int seconds = 60}) async {
  final headers = {...await _headers(), 'Content-Type': type}, client = http.Client();
  return client.post(Uri.parse('$kApiUrl$path'), headers: headers, body: bytes).timeout(Duration(seconds: seconds + bytes.length ~/ 20000)).whenComplete(client.close); // as in api(): time for the upload, and a timeout stops it
}

/// A PDF file's bytes sent as they are (AI chat → Highlight); the answer is a PDF too. The AI may read for up to 2 minutes.
Future<http.Response> apiPdf(String path, List<int> bytes) => apiFile(path, bytes, 'application/pdf', seconds: 150);

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

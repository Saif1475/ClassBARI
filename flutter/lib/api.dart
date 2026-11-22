import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'store.dart';

GoTrueClient get auth => Supabase.instance.client.auth;

/// The login token, renewed first if it has run out.
Future<String?> _token() async {
  var s = auth.currentSession;
  if (s != null && s.isExpired) {
    try {
      s = (await auth.refreshSession()).session;
    } catch (_) {
      // offline, or the login has ended: the server answers 401 and the screens say so
    }
  }
  return s?.accessToken;
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

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;
import 'package:material_ui/material_ui.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../config.dart';
import '../store.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';

// An email link (instead of typing the code) opens the website, which finishes there.
String _back(String next) => '$kApiUrl/auth/callback?next=${Uri.encodeComponent(next)}';

/// Students, guardians and teachers first find their institute; then they log in. Owners log straight in.
class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});
  @override
  Widget build(BuildContext context) => Live((context) {
    final inst = kPicksInstitute ? store.institute : null;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: OutlinedButton(
                onPressed: () => store.setLang(lang.code == 'bn' ? 'en' : 'bn'),
                style: OutlinedButton.styleFrom(minimumSize: const Size(48, 40)),
                child: Text(lang.code == 'bn' ? 'English' : 'বাংলা'),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              spacing: 14,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: Image.asset('assets/icons/$kApp.png', width: 64, height: 64, semanticLabel: ''),
                ),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [H1(kAppName), Muted(t('app.tagline'))]),
                ),
              ],
            ),
            const SizedBox(height: 20),
            if (kPicksInstitute && inst == null)
              const InstitutePicker()
            else ...[
              if (inst != null) ...[
                Box(
                  color: context.colors.surfaceContainerHighest,
                  children: [
                    Wrap(
                      alignment: WrapAlignment.spaceBetween,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Strong('${inst['name']}'),
                        TextButton(onPressed: () => store.setInstitute(null), child: Text(t('auth.changeInstitute'))),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 16),
              ],
              kFamilies ? const StepLogin() : const StaffLogin(),
            ],
          ],
        ),
      ),
    );
  });
}

/// "Find your institute": the list to scroll through, or type a name or the institute's code.
class InstitutePicker extends StatefulWidget {
  const InstitutePicker({super.key});
  @override
  State<InstitutePicker> createState() => _InstitutePickerState();
}

class _InstitutePickerState extends State<InstitutePicker> {
  List<Json>? found;
  Timer? wait;
  var asked = 0;

  @override
  void initState() {
    super.initState();
    search('');
  }

  @override
  void dispose() {
    wait?.cancel();
    super.dispose();
  }

  void search(String typed) {
    final term = typed.trim().length < 2 ? '' : typed.trim(); // one letter: still the whole list
    wait?.cancel();
    wait = Timer(Duration(milliseconds: term.isEmpty ? 0 : 300), () async {
      final mine = ++asked;
      List<Json> list = const [];
      try {
        final res = await http.get(Uri.parse('$kApiUrl/api/institutes?q=${Uri.encodeQueryComponent(term)}')).timeout(const Duration(seconds: 20));
        if (res.statusCode == 200) list = rows(jsonDecode(res.body));
      } catch (_) {
        // offline: the "no institute found" line shows
      }
      if (mounted && mine == asked) setState(() => found = list); // an older, slower answer never replaces a newer one
    });
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    spacing: 10,
    children: [
      H2(t('auth.findInstitute')),
      Muted(t('auth.findInstituteHelp')),
      Semantics(
        container: true,
        child: TextField(
          onChanged: search,
          autocorrect: false,
          decoration: InputDecoration(hintText: t('auth.institutePh'), prefixIcon: const Icon(Icons.search), labelText: t('auth.findInstitute')),
        ),
      ),
      if (found == null)
        const Center(
          child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()),
        ),
      if (found != null && found!.isEmpty) Muted(t('auth.noInstitute')),
      for (final i in found ?? const <Json>[])
        Box(
          onTap: () => store.setInstitute({'id': i['id'], 'name': i['name'], 'code': i['code']}),
          children: [
            Row(
              spacing: 12,
              children: [
                const Icon(Icons.school_outlined),
                Expanded(child: Strong('${i['name']}')),
                Muted('${i['code']}'),
              ],
            ),
          ],
        ),
      Muted(t('auth.pickerTip')),
    ],
  );
}

/// A password box with an eye to show or hide what was typed.
class PasswordField extends StatefulWidget {
  const PasswordField({super.key, required this.controller, required this.label, this.onSubmitted, this.fresh = false, this.autofocus = false});
  final TextEditingController controller;
  final String label;
  final VoidCallback? onSubmitted;
  final bool fresh, autofocus;
  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  var hidden = true;
  @override
  Widget build(BuildContext context) => Semantics(
    container: true,
    child: TextField(
      controller: widget.controller,
      obscureText: hidden,
      autofocus: widget.autofocus,
      autofillHints: [widget.fresh ? AutofillHints.newPassword : AutofillHints.password],
      onSubmitted: (_) => widget.onSubmitted?.call(),
      decoration: InputDecoration(
        labelText: widget.label,
        suffixIcon: IconButton(tooltip: t(hidden ? 'auth.showPassword' : 'auth.hidePassword'), icon: Icon(hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined), onPressed: () => setState(() => hidden = !hidden)),
      ),
    ),
  );
}

/// What every login form shares: one job at a time, and a line saying how it went.
mixin _Form<T extends StatefulWidget> on State<T> {
  var busy = false;
  (bool ok, String text)? msg;

  Future<void> run(Future<void> Function() job) async {
    setState(() {
      busy = true;
      msg = null;
    });
    try {
      await job();
    } catch (_) {
      say(false, t('auth.failed'));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void say(bool ok, String text) {
    if (mounted) setState(() => msg = (ok, text));
  }

  Widget? get note => msg == null ? null : Semantics(liveRegion: true, child: Strong(msg!.$2, color: msg!.$1 ? context.colors.primary : context.colors.error));

  Future<void> signIn(String email, String password) async {
    try {
      await auth.signInWithPassword(email: email, password: password);
    } on AuthException catch (e) {
      say(false, RegExp('confirm', caseSensitive: false).hasMatch(e.message) ? t('auth.confirmFirst') : t('auth.wrongPassword'));
    }
  }

  Future<void> forgot(String email) async {
    if (email.isEmpty) return say(false, t('auth.emailFirst'));
    try {
      await auth.resetPasswordForEmail(email, redirectTo: _back('/auth/reset'));
    } on AuthException catch (_) {
      // the same answer whether or not the email has an account
    }
    say(true, t('auth.resetSent'));
  }
}

/// Teachers and owners: email and password.
class StaffLogin extends StatefulWidget {
  const StaffLogin({super.key});
  @override
  State<StaffLogin> createState() => _StaffLoginState();
}

class _StaffLoginState extends State<StaffLogin> with _Form {
  final email = TextEditingController(), password = TextEditingController();
  String get mail => email.text.trim().toLowerCase();

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  /// A teacher the owner added by email: the first time, they choose a password (confirmed by an email link).
  Future<void> firstTime() async {
    if (mail.isEmpty) return say(false, t('auth.emailFirst'));
    if (!strongPassword(password.text)) return say(false, t('auth.passwordRule'));
    try {
      await auth.signUp(email: mail, password: password.text, emailRedirectTo: _back('/auth/continue'));
      say(true, t('auth.checkEmail'));
    } on AuthException catch (_) {
      say(false, t('auth.signupFailed'));
    }
  }

  @override
  Widget build(BuildContext context) => AutofillGroup(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 14,
      children: [
        Semantics(
          container: true,
          child: TextField(
            controller: email,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            autofillHints: const [AutofillHints.email],
            decoration: InputDecoration(labelText: t('auth.email')),
          ),
        ),
        PasswordField(controller: password, label: t('auth.password'), onSubmitted: () => run(() => signIn(mail, password.text))),
        ?note,
        Doing(label: t('auth.signIn'), icon: Icons.arrow_forward, onPressed: busy ? null : () => run(() => signIn(mail, password.text))),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          children: [
            TextButton(onPressed: busy ? null : () => run(() => forgot(mail)), child: Text(t('auth.forgot'))),
            if (kApp != 'institute') TextButton(onPressed: busy ? null : () => run(firstTime), child: Text(t('auth.firstTime'))),
            if (kApp == 'institute')
              TextButton(
                onPressed: () => launchUrl(Uri.parse('$kApiUrl/signup'), mode: LaunchMode.externalApplication),
                child: Text('${t('login.newHere')} ${t('login.create')}'),
              ),
          ],
        ),
      ],
    ),
  );
}

/// Students and guardians, one step at a time, as on the website: their Gmail first, then either their password
/// (they have been here before) or "create a password", confirmed by a code sent to that Gmail (first time).
class StepLogin extends StatefulWidget {
  const StepLogin({super.key});
  @override
  State<StepLogin> createState() => _StepLoginState();
}

class _StepLoginState extends State<StepLogin> with _Form {
  final email = TextEditingController(), password = TextEditingController(), again = TextEditingController(), code = TextEditingController();
  var step = 'email'; // email → password, or create → code
  var known = 'unknown'; // what the server says about this address: password / google / new / unknown
  var recovery = false; // the account exists already (Google) and only needs a password
  String get mail => email.text.trim().toLowerCase();

  @override
  void dispose() {
    for (final c in [email, password, again, code]) {
      c.dispose();
    }
    super.dispose();
  }

  void go(String next) => setState(() {
    step = next;
    msg = null;
    password.clear();
    again.clear();
    code.clear();
  });

  Future<void> checkEmail() async {
    if (!mail.contains('@')) return say(false, t('auth.emailFirst'));
    var s = 'unknown';
    try {
      final res = await http.post(Uri.parse('$kApiUrl/api/auth/status'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'email': mail})).timeout(const Duration(seconds: 20));
      if (res.statusCode == 200) s = '${(jsonDecode(res.body) as Map)['state']}';
    } catch (_) {
      // can't ask: the plain password form, which also offers "first time here"
    }
    known = s;
    recovery = s == 'google';
    go(s == 'new' || s == 'google' ? 'create' : 'password');
  }

  Future<void> sendCode() async {
    try {
      if (recovery) {
        await auth.resetPasswordForEmail(mail, redirectTo: _back('/auth/reset'));
      } else {
        final res = await auth.signUp(email: mail, password: password.text, emailRedirectTo: _back('/auth/continue'));
        // An address that already has a confirmed account gets no email from sign-up: set its password by a reset code instead.
        if (res.user != null && (res.user!.identities ?? const []).isEmpty) {
          recovery = true;
          await auth.resetPasswordForEmail(mail, redirectTo: _back('/auth/reset'));
        }
      }
    } on AuthException catch (e) {
      return say(false, RegExp('password', caseSensitive: false).hasMatch(e.message) ? t('auth.passwordRule') : t('auth.signupFailed'));
    }
    setState(() {
      step = 'code';
      code.clear();
    });
  }

  Future<void> create() async {
    if (!strongPassword(password.text)) return say(false, t('auth.passwordRule'));
    if (password.text != again.text) return say(false, t('auth.passwordsDiffer'));
    await sendCode();
  }

  Future<void> verify() async {
    try {
      await auth.verifyOTP(email: mail, token: code.text.trim(), type: recovery ? OtpType.recovery : OtpType.signup);
    } on AuthException catch (_) {
      return say(false, t('auth.wrongCode'));
    }
    if (!recovery) return;
    try {
      // The code proved the Gmail is theirs; now set the password. Typing the password they already had is fine.
      await auth.updateUser(UserAttributes(password: password.text));
    } on AuthException catch (e) {
      if (e.code != 'same_password') {
        say(
          false,
          e.code == 'weak_password'
              ? t('auth.passwordRule')
              : e.code == 'over_request_rate_limit'
              ? t('auth.resendSoon')
              : t('auth.passwordNotSaved'),
        );
      }
    }
  }

  Future<void> google() async {
    try {
      await auth.signInWithOAuth(OAuthProvider.google, redirectTo: kIsWeb ? null : 'classbari-$kApp://auth', authScreenLaunchMode: LaunchMode.externalApplication);
    } catch (_) {
      say(false, t('auth.googleFailed'));
    }
  }

  @override
  Widget build(BuildContext context) {
    final who = Wrap(
      alignment: WrapAlignment.spaceBetween,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Strong(mail),
        TextButton(onPressed: busy ? null : () => go('email'), child: Text(t('auth.changeEmail'))),
      ],
    );
    final List<Widget> form = switch (step) {
      'email' => [
        Text(t('auth.step1Help')),
        Semantics(
          container: true,
          child: TextField(
            controller: email,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            autofillHints: const [AutofillHints.email],
            onSubmitted: (_) => run(checkEmail),
            decoration: InputDecoration(labelText: t('auth.email'), hintText: 'you@gmail.com'),
          ),
        ),
        ?note,
        Doing(label: t('auth.next'), icon: Icons.arrow_forward, onPressed: busy ? null : () => run(checkEmail)),
      ],
      'password' => [
        who,
        PasswordField(controller: password, label: known == 'password' ? t('auth.welcomeBack') : t('auth.password'), autofocus: true, onSubmitted: () => run(() => signIn(mail, password.text))),
        ?note,
        Doing(label: t('auth.signIn'), icon: Icons.arrow_forward, onPressed: busy ? null : () => run(() => signIn(mail, password.text))),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          children: [
            TextButton(onPressed: busy ? null : () => run(() => forgot(mail)), child: Text(t('auth.forgot'))),
            TextButton(onPressed: busy ? null : () => go('create'), child: Text(t('auth.firstTime'))),
          ],
        ),
      ],
      'create' => [
        who,
        Strong(t(known == 'google' ? 'auth.usedGoogle' : 'auth.firstVisit')),
        PasswordField(controller: password, label: t('auth.password'), fresh: true, autofocus: true),
        Muted(t('auth.passwordRule')),
        PasswordField(controller: again, label: t('auth.passwordAgain'), fresh: true, onSubmitted: () => run(create)),
        ?note,
        Doing(label: t('auth.sendCode'), onPressed: busy ? null : () => run(create)),
      ],
      _ => [
        who,
        Text(t('auth.codeSent', [mail])),
        Semantics(
          container: true,
          child: TextField(
            controller: code,
            autofocus: true,
            keyboardType: TextInputType.number,
            maxLength: 8,
            textAlign: TextAlign.center,
            autofillHints: const [AutofillHints.oneTimeCode],
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: 8),
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(labelText: t('auth.codeLabel'), counterText: ''),
          ),
        ),
        ?note,
        Doing(label: t('auth.verify'), onPressed: busy || code.text.trim().length < 6 ? null : () => run(verify)),
        Center(
          child: TextButton(onPressed: busy ? null : () => run(sendCode), child: Text(t('auth.resend'))),
        ),
      ],
    };
    return AutofillGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 14,
        children: [
          ...form,
          const SizedBox(height: 4),
          Center(child: Muted(t('auth.orGoogle'))),
          // Students and guardians may also use Google with the same Gmail: their choice.
          Center(
            child: Semantics(
              button: true,
              label: t('auth.google'),
              excludeSemantics: true,
              child: Material(
                shape: CircleBorder(side: BorderSide(color: context.colors.outlineVariant)),
                color: context.colors.surfaceContainerLowest,
                elevation: 2,
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: busy ? null : () => run(google),
                  child: const SizedBox.square(
                    dimension: 52,
                    child: Center(
                      child: Text(
                        'G',
                        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Color(0xFF4285F4)),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

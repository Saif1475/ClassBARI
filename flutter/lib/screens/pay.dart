// Paying ClassBARI by bKash or Nagad "Send Money" with the transaction ID: the same form as on the website
// (src/components/PayForm.tsx). Our staff check the TrxID and switch the pack on; the payer gets a notification.
import 'dart:convert';

import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:material_ui/material_ui.dart';

import '../api.dart';
import '../strings.dart';
import '../ui.dart';
import '../views.dart';
import '../icons.g.dart';

/// The server calls, swappable in tests.
var payApi = api;

class PayForm extends StatefulWidget {
  const PayForm({super.key, this.kind = 'ai_pack'});
  final String kind; // ai_pack, ai_credit (extra AI credit, an amount the student chooses) or plan
  @override
  State<PayForm> createState() => _PayFormState();
}

class _PayFormState extends State<PayForm> {
  Json? info;
  var item = '', months = 1, method = 'bkash', copied = false;
  final sender = TextEditingController(), trx = TextEditingController(), amount = TextEditingController();
  (bool, String)? msg;

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    sender.dispose();
    trx.dispose();
    amount.dispose();
    super.dispose();
  }

  Future<void> load() async {
    try {
      final res = await payApi('/api/pay');
      if (res.statusCode != 200 || !mounted) return;
      final d = jsonDecode(res.body) as Json;
      final methods = rows(d['methods']);
      setState(() {
        info = d;
        if (!methods.any((m) => m['method'] == method) && methods.isNotEmpty) method = '${methods.first['method']}';
        if (widget.kind == 'ai_credit' && amount.text.isEmpty) amount.text = '${(d['credit'] as Map?)?['min'] ?? 50}';
        if (item.isEmpty) item = widget.kind == 'ai_pack' ? '${(d['packs'] as List).length > 1 ? d['packs'][1] : d['packs'][0]}' : (d['plans'] as Map).keys.firstOrNull?.toString() ?? '';
      });
    } catch (_) {
      // offline: the form is not shown
    }
  }

  bool get credit => widget.kind == 'ai_credit';
  ({int min, int max}) get range => (min: ((info?['credit'] as Map?)?['min'] as num? ?? 50).toInt(), max: ((info?['credit'] as Map?)?['max'] as num? ?? 5000).toInt());

  /// The amount typed for extra credit, if it is a whole ৳ in range (the server checks again).
  int? get creditAmount {
    final n = int.tryParse(amount.text.trim());
    return n != null && RegExp(r'^\d+$').hasMatch(amount.text.trim()) && n >= range.min && n <= range.max ? n : null;
  }

  Future<void> send() async {
    setState(() => msg = null);
    if (credit && creditAmount == null) return setState(() => msg = (false, t('pay.creditBad')));
    try {
      final res = await payApi('/api/pay', body: {'kind': widget.kind, 'item': credit ? '$creditAmount' : item, 'months': months, 'method': method, 'sender': sender.text, 'trxId': trx.text});
      final d = jsonDecode(res.body) as Json;
      if (res.statusCode == 200) {
        trx.clear();
        setState(() => msg = (true, t('pay.sent')));
        load();
      } else {
        setState(() => msg = (false, d['error'] == 'used' ? t('pay.used') : (credit && d['error'] == 'bad item' ? t('pay.creditBad') : null) ?? (res.statusCode == 400 ? t('pay.bad') : t('pay.error'))));
      }
    } catch (_) {
      setState(() => msg = (false, t('pay.error')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = info;
    if (d == null) return const SizedBox.shrink();
    final methods = rows(d['methods']);
    final options = widget.kind == 'ai_pack' ? {for (final p in d['packs'] as List) '$p': p as num} : {for (final e in (d['plans'] as Map).entries) '${e.key}': e.value as num};
    if (methods.isEmpty || (!credit && options.isEmpty)) return Box(children: [Muted(t('pay.none'))]);
    final total = credit ? (creditAmount ?? 0) : (options[item] ?? 0) * months;
    final to = methods.where((m) => m['method'] == method).firstOrNull;
    final mine = rows(d['mine']).where((m) => m['kind'] == widget.kind).toList();
    Widget field(TextEditingController c, String label, {String? hint, TextInputType? keyboard}) => Semantics(
      container: true,
      child: TextField(
        controller: c,
        keyboardType: keyboard,
        textCapitalization: TextCapitalization.characters,
        decoration: InputDecoration(labelText: label, hintText: hint),
      ),
    );
    return Box(
      title: credit ? t('pay.buyCredit') : (widget.kind == 'ai_pack' ? t('pay.buyPack') : t('pay.payPlan')),
      children: [
        if (credit) ...[
          Muted(t('pay.creditInfo')),
          Semantics(
            container: true,
            child: TextField(
              key: const Key('credit-amount'),
              controller: amount,
              keyboardType: TextInputType.number,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(labelText: t('pay.creditAmount'), prefixText: '৳'),
            ),
          ),
        ],
        if (!credit)
          Chips(
            value: item,
            options: options.keys.toList(),
            labels: {for (final e in options.entries) e.key: '${widget.kind == 'ai_pack' ? '' : '${e.key} · '}${taka(e.value)}${t('pay.perMonth')}'},
            onChanged: (v) => setState(() => item = v),
          ),
        if (!credit)
          Chips(
            value: '$months',
            options: const ['1', '3', '6', '12'],
            labels: {
              for (final m in const [1, 3, 6, 12]) '$m': t('pay.monthN', [m]),
            },
            onChanged: (v) => setState(() => months = int.parse(v)),
          ),
        if (methods.length > 1) Chips(value: method, options: [for (final m in methods) '${m['method']}'], labels: {for (final m in methods) '${m['method']}': t('pay.${m['method']}')}, onChanged: (v) => setState(() => method = v)),
        if (to != null)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: context.tone.tile, borderRadius: BorderRadius.circular(14)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 6,
              children: [
                Strong(t('pay.how')),
                Text('1. ${t('pay.step1', [taka(total), to['number'], t('pay.$method')])}'),
                Text('2. ${t('pay.step2')}'),
                Text('3. ${t('pay.step3')}'),
                Wrap(
                  spacing: 12,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    SelectableText('${to['number']}', style: context.type.headlineSmall),
                    Doing(
                      label: t(copied ? 'pay.copied' : 'pay.copy'),
                      small: true,
                      soft: true,
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(text: '${to['number']}'));
                        if (mounted) setState(() => copied = true);
                      },
                    ),
                    Text(taka(total), style: context.type.headlineSmall?.copyWith(color: context.colors.primary)),
                  ],
                ),
              ],
            ),
          ),
        field(sender, t('pay.sender'), hint: '01XXXXXXXXX', keyboard: TextInputType.phone),
        field(trx, t('pay.trx'), hint: '9A1B2C3D4E'),
        if (msg != null) Semantics(liveRegion: true, child: Strong(msg!.$2, color: msg!.$1 ? context.colors.primary : context.colors.error)),
        Doing(label: t('pay.send'), onPressed: send),
        Muted(t('pay.note')),
        if (mine.isNotEmpty) ...[
          Section(t('pay.yours')),
          for (final m in mine)
            Item(
              title: credit ? '${taka((m['amount'] as num?) ?? 0)} · ${m['trx_id']}' : '${taka((m['amount'] as num?) ?? 0)} · ${t('pay.monthN', [m['months']])} · ${m['trx_id']}',
              subtitle: '${t('pay.${m['status']}')}${m['reason'] != null ? ': ${m['reason']}' : ''}',
              icon: m['status'] == 'approved' ? I.checkCircle : (m['status'] == 'rejected' ? I.error : I.hourglass),
            ),
        ],
      ],
    );
  }
}

/// Decoding tests, run against REAL responses captured from the API.
///
/// Hand-written JSON fixtures would only prove the models agree with what I
/// imagined the server sends. `contract/api-contract.json` is captured from the
/// running server, so these assert against the shape it actually returns.
library;

import 'dart:convert';
import 'dart:io';

import 'package:chivago/chivago.dart';
import 'package:test/test.dart';

/// The captured contract, four directories up from this package.
Map<String, dynamic> loadContract() {
  final file = File('../../contract/api-contract.json');
  if (!file.existsSync()) {
    fail(
      'contract/api-contract.json is missing. Run:\n'
      '  pnpm --filter @chivago/api contract\n'
      'against a running API. This SDK is written against that file, and a '
      'test that silently skips when it is absent guards nothing.',
    );
  }
  return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
}

/// Every leaf path in a captured shape, as `a.b[].c`.
List<String> paths(dynamic shape, [String prefix = '']) {
  if (shape is String) return [prefix];
  if (shape is Map<String, dynamic>) {
    if (shape.containsKey('array')) return paths(shape['array'], '$prefix[]');
    final object = shape['object'] as Map<String, dynamic>;
    return object.entries
        .expand((e) => paths(e.value, prefix.isEmpty ? e.key : '$prefix.${e.key}'))
        .toList();
  }
  return [prefix];
}

/// Real responses, captured from the running server alongside the shapes.
Map<String, dynamic> loadSamples() {
  final file = File('../../contract/api-samples.json');
  if (!file.existsSync()) {
    fail('contract/api-samples.json is missing. Run the contract capture.');
  }
  return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
}

void main() {
  late Map<String, dynamic> shapes;

  setUpAll(() {
    shapes = loadContract()['shapes'] as Map<String, dynamic>;
  });

  group('the contract covers what this SDK reads', () {
    test('every endpoint the client calls was captured', () {
      // If an endpoint is missing here, the SDK is decoding something nobody
      // is guarding, which is exactly how the two clients drift apart.
      for (final name in [
        'places', 'place', 'quests', 'wallet', 'offers', 'vouchers',
        'reviews', 'checkin', 'writeReview', 'checkinsToday',
        'selfVisits', 'passport', 'myStatements',
      ]) {
        expect(shapes.containsKey(name), isTrue, reason: '$name not in the contract');
      }
    });

    test('wallet carries both purses and the progression', () {
      final walletPaths = paths(shapes['wallet']);
      expect(walletPaths, contains('balances.green'));
      expect(walletPaths, contains('balances.trip'));
      // EXP is separate from either balance on purpose: spending must never
      // demote. If these ever merge, this SDK is wrong about the whole model.
      expect(walletPaths, contains('progression.exp'));
      expect(walletPaths, contains('progression.level'));
      expect(walletPaths, contains('ledger[].currency'));
      expect(walletPaths, contains('ledger[].exp'));
    });

    test('a place carries its score breakdown, and reviews stay outside it', () {
      final placePaths = paths(shapes['place']);
      expect(placePaths, contains('breakdown.components[].provenance'));
      expect(placePaths, contains('reviews.average'));
      // Ratings must not appear inside the breakdown: the score is a measured
      // claim and a subjective mean would make it unexplainable.
      expect(
        placePaths.where((p) => p.startsWith('breakdown') && p.contains('review')),
        isEmpty,
      );
    });

    test('vouchers answer in camelCase like everything else', () {
      final voucherPaths = paths(shapes['vouchers']);
      // This endpoint used to return raw database rows. The mobile client
      // declared the result as Voucher[] and nothing ever read a field, so the
      // lie survived until a second client was written against it.
      expect(voucherPaths, contains('[].costPoints'));
      expect(voucherPaths, contains('[].offerId'));
      expect(voucherPaths.where((p) => p.contains('_')), isEmpty,
          reason: 'snake_case leaked back into the voucher payload');
    });
  });

  group('the models decode real server responses', () {
    late Map<String, dynamic> samples;
    setUpAll(() { samples = loadSamples(); });

    test('a wallet, both purses and the whole rank ladder', () {
      final wallet = Wallet.fromJson(samples['wallet'] as Map<String, dynamic>);
      expect(wallet.balances.green, greaterThan(0));
      expect(wallet.progression.level, greaterThanOrEqualTo(1));
      expect(wallet.progression.ladder, hasLength(5));
      expect(wallet.progression.rank.label.th, isNotEmpty);
      expect(wallet.ledger, isNotEmpty);
    });

    test('a place carries its province and a CREDITED photo, or none', () {
      // The two fields the API grew after this SDK was written, and that it
      // decoded as nothing for forty commits.
      final places = (samples['places'] as List<dynamic>)
          .map((e) => Place.fromJson(e as Map<String, dynamic>))
          .toList();
      expect(places, hasLength(5));
      for (final p in places) {
        expect(p.province, startsWith('TH-'), reason: p.id);
      }
      final chaweng = places.firstWhere((p) => p.id == 'chaweng');
      expect(chaweng.photo, isNotNull, reason: 'Chaweng has a public-domain photograph');
      expect(chaweng.photo!.credit, isNotEmpty);
      expect(chaweng.photo!.licence, isNotEmpty);
      final mangrove = places.firstWhere((p) => p.id == 'mangrove');
      expect(mangrove.photo, isNull, reason: 'no photograph exists of the mangrove');
    });

    test('spending granted no EXP, and the ledger says so', () {
      final wallet = Wallet.fromJson(samples['wallet'] as Map<String, dynamic>);
      final debits = wallet.ledger.where((e) => !e.isCredit);
      expect(debits, isNotEmpty, reason: 'the capture redeems an offer');
      for (final d in debits) {
        // THE invariant of the whole economy, checked from a second language.
        expect(d.exp, 0, reason: 'a debit must never cost progress');
      }
    });

    test('a place, its explainable score and its separate ratings', () {
      final place = Place.fromJson(samples['place'] as Map<String, dynamic>);
      expect(place.name.th, isNotEmpty);
      expect(place.breakdown.components, isNotEmpty);
      for (final c in place.breakdown.components) {
        expect(c.provenance, isNotEmpty, reason: 'every component names its freshness');
        expect(c.display, isNotEmpty);
      }
      expect(place.reviews.distribution, hasLength(5));
    });

    test('quests carry the currency they pay in', () {
      final quests = (samples['quests'] as Map<String, dynamic>)['quests'] as List<dynamic>;
      final parsed = quests.map((q) => Quest.fromJson(q as Map<String, dynamic>)).toList();
      expect(parsed, isNotEmpty);
      // Both currencies must be represented, or the seed has quietly become
      // single-currency again and the deck's claim is false.
      expect(parsed.map((q) => q.rewardCurrency).toSet(), hasLength(2));
    });

    test('a check-in result, including the not-awarded case', () {
      final result = CheckinResult.fromJson(samples['checkin'] as Map<String, dynamic>);
      expect(result.placeId, 'chaweng');
      // The capture checks in during warm-up, so the recorded call is the
      // second one that day: awarded false, and that is a 200.
      expect(result.awarded, isFalse);
      expect(result.pointsAwarded, 0);
    });

    test('offers, vouchers and reviews all decode', () {
      final offers = (samples['offers'] as List<dynamic>)
          .map((e) => Offer.fromJson(e as Map<String, dynamic>)).toList();
      expect(offers.map((o) => o.currency).toSet(), hasLength(2));

      final vouchers = (samples['vouchers'] as List<dynamic>)
          .map((e) => Voucher.fromJson(e as Map<String, dynamic>)).toList();
      expect(vouchers, isNotEmpty);
      expect(vouchers.first.code, startsWith('CG-'));

      final reviews = ((samples['reviews'] as Map<String, dynamic>)['reviews'] as List<dynamic>)
          .map((e) => PlaceReview.fromJson(e as Map<String, dynamic>)).toList();
      expect(reviews, isNotEmpty);
      // Written on the flight home, visited days earlier - the review records
      // when they were THERE.
      expect(reviews.first.visitedAt.isAfter(DateTime(2020)), isTrue);
    });
  });
}

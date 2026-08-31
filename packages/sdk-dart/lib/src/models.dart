/// Models, decoded from the shapes in `contract/api-contract.json`.
///
/// Hand-written rather than generated, and the trade is stated openly: a
/// generator would need a schema this API does not publish, and the contract
/// test catches drift either way. What matters is that every field name here
/// appears in the captured contract, and nothing here invents one.
library;

/// A bilingual string. The app shows BOTH; a push shows one.
class Bilingual {
  const Bilingual({required this.en, required this.th});

  factory Bilingual.fromJson(Map<String, dynamic> json) =>
      Bilingual(en: json['en'] as String, th: json['th'] as String);

  final String en;
  final String th;
}

/// The two spendable currencies. They differ in EVIDENCE, not in colour:
/// green is host-verified, trip is self-verified. See docs/11.
enum Currency {
  trip,
  green;

  static Currency parse(String raw) => raw == 'green' ? Currency.green : Currency.trip;

  String get wire => name;
}

class Balances {
  const Balances({required this.trip, required this.green});

  factory Balances.fromJson(Map<String, dynamic> json) => Balances(
        trip: json['trip'] as int,
        green: json['green'] as int,
      );

  final int trip;
  final int green;
}

class Rank {
  const Rank({required this.index, required this.key, required this.label});

  factory Rank.fromJson(Map<String, dynamic> json) => Rank(
        index: json['index'] as int,
        key: json['key'] as String,
        label: Bilingual.fromJson(json['label'] as Map<String, dynamic>),
      );

  final int index;
  final String key;
  final Bilingual label;
}

class RankState {
  const RankState({
    required this.index,
    required this.key,
    required this.label,
    required this.fromLevel,
    required this.earned,
  });

  factory RankState.fromJson(Map<String, dynamic> json) => RankState(
        index: json['index'] as int,
        key: json['key'] as String,
        label: Bilingual.fromJson(json['label'] as Map<String, dynamic>),
        fromLevel: json['fromLevel'] as int,
        earned: json['earned'] as bool,
      );

  final int index;
  final String key;
  final Bilingual label;
  final int fromLevel;
  final bool earned;
}

/// Lifetime progress. NOT derived from a balance — spending must never demote.
class Progression {
  const Progression({
    required this.exp,
    required this.level,
    required this.intoLevel,
    required this.levelSpan,
    required this.rank,
    required this.nextRank,
    required this.nextRankAtLevel,
    required this.ladder,
  });

  factory Progression.fromJson(Map<String, dynamic> json) => Progression(
        exp: json['exp'] as int,
        level: json['level'] as int,
        intoLevel: json['intoLevel'] as int,
        levelSpan: json['levelSpan'] as int,
        rank: Rank.fromJson(json['rank'] as Map<String, dynamic>),
        nextRank: json['nextRank'] == null
            ? null
            : Rank.fromJson(json['nextRank'] as Map<String, dynamic>),
        nextRankAtLevel: json['nextRankAtLevel'] as int?,
        ladder: (json['ladder'] as List<dynamic>)
            .map((e) => RankState.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  final int exp;
  final int level;
  final int intoLevel;
  final int levelSpan;
  final Rank rank;
  final Rank? nextRank;
  final int? nextRankAtLevel;
  final List<RankState> ladder;

  /// Bar fill, 0-1. Derived here rather than sent: it is presentation.
  double get progress => levelSpan == 0 ? 0 : intoLevel / levelSpan;
}

class LedgerEntry {
  const LedgerEntry({
    required this.id,
    required this.label,
    required this.occurredAt,
    required this.host,
    required this.amount,
    required this.currency,
    required this.exp,
    required this.kind,
    required this.sourceRef,
  });

  factory LedgerEntry.fromJson(Map<String, dynamic> json) => LedgerEntry(
        id: json['id'] as String,
        label: json['label'] as String,
        occurredAt: DateTime.parse(json['occurredAt'] as String),
        host: json['host'] as String,
        amount: json['amount'] as int,
        currency: Currency.parse(json['currency'] as String),
        exp: json['exp'] as int,
        kind: json['kind'] as String,
        sourceRef: json['sourceRef'] as String,
      );

  final String id;
  final String label;
  final DateTime occurredAt;

  /// Every entry names the host that verified it. Non-negotiable for trust.
  final String host;

  /// Signed. Positive credits, negative debits.
  final int amount;
  final Currency currency;

  /// EXP granted. Zero on a debit: spending is not progress lost.
  final int exp;
  final String kind;
  final String sourceRef;

  bool get isCredit => amount >= 0;
}

class Wallet {
  const Wallet({
    required this.balances,
    required this.progression,
    required this.ledger,
  });

  factory Wallet.fromJson(Map<String, dynamic> json) => Wallet(
        balances: Balances.fromJson(json['balances'] as Map<String, dynamic>),
        progression: Progression.fromJson(json['progression'] as Map<String, dynamic>),
        ledger: (json['ledger'] as List<dynamic>)
            .map((e) => LedgerEntry.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  final Balances balances;
  final Progression progression;
  final List<LedgerEntry> ledger;
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

class PlaceMetrics {
  const PlaceMetrics({
    required this.crowdDensity,
    required this.aqi,
    required this.safetyIndex,
    required this.walkability,
  });

  factory PlaceMetrics.fromJson(Map<String, dynamic> json) => PlaceMetrics(
        crowdDensity: (json['crowdDensity'] as num).toDouble(),
        aqi: (json['aqi'] as num).toDouble(),
        safetyIndex: (json['safetyIndex'] as num).toDouble(),
        walkability: (json['walkability'] as num).toDouble(),
      );

  final double crowdDensity;
  final double aqi;
  final double safetyIndex;
  final double walkability;
}

/// One line of the Healthy Score explanation.
///
/// The score is never a black box: every component says what it measured, how
/// it was weighted for this reader, and how fresh the reading is.
class ScoreComponent {
  const ScoreComponent({
    required this.key,
    required this.label,
    required this.display,
    required this.subScore,
    required this.weight,
    required this.provenance,
  });

  factory ScoreComponent.fromJson(Map<String, dynamic> json) => ScoreComponent(
        key: json['key'] as String,
        label: Bilingual.fromJson(json['label'] as Map<String, dynamic>),
        display: json['display'] as String,
        subScore: (json['subScore'] as num).toDouble(),
        weight: (json['weight'] as num).toDouble(),
        provenance: json['provenance'] as String,
      );

  final String key;
  final Bilingual label;
  final String display;
  final double subScore;
  final double weight;

  /// live | daily | estimated | stale.
  final String provenance;
}

class ScoreBreakdown {
  const ScoreBreakdown({
    required this.total,
    required this.components,
    required this.profileApplied,
  });

  factory ScoreBreakdown.fromJson(Map<String, dynamic> json) => ScoreBreakdown(
        total: (json['total'] as num).toDouble(),
        components: (json['components'] as List<dynamic>)
            .map((e) => ScoreComponent.fromJson(e as Map<String, dynamic>))
            .toList(),
        profileApplied: json['profileApplied'] as String,
      );

  final double total;
  final List<ScoreComponent> components;
  final String profileApplied;
}

class ReviewSummary {
  const ReviewSummary({
    required this.count,
    required this.average,
    required this.distribution,
  });

  factory ReviewSummary.fromJson(Map<String, dynamic> json) => ReviewSummary(
        count: json['count'] as int,
        // Null, never zero. Zero is a rating, and a place nobody has been to
        // has not scored badly.
        average: (json['average'] as num?)?.toDouble(),
        distribution: (json['distribution'] as List<dynamic>).cast<int>(),
      );

  final int count;
  final double? average;
  final List<int> distribution;
}

class Place {
  const Place({
    required this.id,
    required this.name,
    required this.short,
    required this.layer,
    required this.lat,
    required this.lng,
    required this.meta,
    required this.blurb,
    required this.tags,
    required this.photoUrl,
    required this.metrics,
    required this.healthyScore,
    required this.breakdown,
    required this.reviews,
  });

  factory Place.fromJson(Map<String, dynamic> json) => Place(
        id: json['id'] as String,
        name: Bilingual.fromJson(json['name'] as Map<String, dynamic>),
        short: json['short'] as String,
        layer: json['layer'] as String,
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
        meta: json['meta'] as String,
        blurb: Bilingual.fromJson(json['blurb'] as Map<String, dynamic>),
        tags: (json['tags'] as List<dynamic>).cast<String>(),
        photoUrl: json['photoUrl'] as String?,
        metrics: PlaceMetrics.fromJson(json['metrics'] as Map<String, dynamic>),
        healthyScore: (json['healthyScore'] as num).toDouble(),
        breakdown: ScoreBreakdown.fromJson(json['breakdown'] as Map<String, dynamic>),
        reviews: ReviewSummary.fromJson(json['reviews'] as Map<String, dynamic>),
      );

  final String id;
  final Bilingual name;
  final String short;
  final String layer;
  final double lat;
  final double lng;
  final String meta;
  final Bilingual blurb;
  final List<String> tags;
  final String? photoUrl;
  final PlaceMetrics metrics;
  final double healthyScore;
  final ScoreBreakdown breakdown;

  /// Traveller ratings, deliberately OUTSIDE healthyScore — see docs/12.
  final ReviewSummary reviews;
}

// ---------------------------------------------------------------------------
// Quests, reviews, vouchers
// ---------------------------------------------------------------------------

class QuestHost {
  const QuestHost({required this.id, required this.name, required this.type});

  factory QuestHost.fromJson(Map<String, dynamic> json) => QuestHost(
        id: json['id'] as String,
        name: json['name'] as String,
        type: json['type'] as String,
      );

  final String id;
  final String name;
  final String type;
}

class Quest {
  const Quest({
    required this.id,
    required this.code,
    required this.name,
    required this.where,
    required this.duration,
    required this.rewardPoints,
    required this.rewardCurrency,
    required this.host,
    required this.kind,
    required this.lat,
    required this.lng,
    required this.geofenceRadiusM,
  });

  factory Quest.fromJson(Map<String, dynamic> json) => Quest(
        id: json['id'] as String,
        code: json['code'] as String,
        name: Bilingual.fromJson(json['name'] as Map<String, dynamic>),
        where: json['where'] as String,
        duration: json['duration'] as String,
        rewardPoints: json['rewardPoints'] as int,
        rewardCurrency: Currency.parse(json['rewardCurrency'] as String),
        host: QuestHost.fromJson(json['host'] as Map<String, dynamic>),
        kind: json['kind'] as String,
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
        geofenceRadiusM: json['geofenceRadiusM'] as int,
      );

  final String id;

  /// Two letters and a number, shown in the ink square. Not an icon.
  final String code;
  final Bilingual name;
  final String where;
  final String duration;
  final int rewardPoints;

  /// Which currency this pays. A property of the quest, never of the caller.
  final Currency rewardCurrency;
  final QuestHost host;
  final String kind;
  final double lat;
  final double lng;
  final int geofenceRadiusM;
}

class PlaceReview {
  const PlaceReview({
    required this.id,
    required this.placeId,
    required this.authorId,
    required this.authorName,
    required this.rating,
    required this.body,
    required this.language,
    required this.visitedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory PlaceReview.fromJson(Map<String, dynamic> json) => PlaceReview(
        id: json['id'] as String,
        placeId: json['placeId'] as String,
        authorId: json['authorId'] as String,
        authorName: json['authorName'] as String,
        rating: json['rating'] as int,
        body: json['body'] as String?,
        language: json['language'] as String,
        visitedAt: DateTime.parse(json['visitedAt'] as String),
        createdAt: DateTime.parse(json['createdAt'] as String),
        updatedAt: json['updatedAt'] == null
            ? null
            : DateTime.parse(json['updatedAt'] as String),
      );

  final String id;
  final String placeId;
  final String authorId;
  final String authorName;
  final int rating;
  final String? body;

  /// The language it was WRITTEN in. Label it; never auto-translate it.
  final String language;

  /// When they were THERE, from the check-in. Not when they wrote.
  final DateTime visitedAt;
  final DateTime createdAt;
  final DateTime? updatedAt;
}

class Voucher {
  const Voucher({
    required this.id,
    required this.offerId,
    required this.userId,
    required this.merchant,
    required this.code,
    required this.costPoints,
    required this.issuedAt,
    required this.expiresAt,
    required this.redeemedAt,
    required this.status,
  });

  factory Voucher.fromJson(Map<String, dynamic> json) => Voucher(
        id: json['id'] as String,
        offerId: json['offerId'] as String,
        userId: json['userId'] as String,
        merchant: json['merchant'] as String,
        code: json['code'] as String,
        costPoints: json['costPoints'] as int,
        issuedAt: DateTime.parse(json['issuedAt'] as String),
        expiresAt: DateTime.parse(json['expiresAt'] as String),
        redeemedAt: json['redeemedAt'] == null
            ? null
            : DateTime.parse(json['redeemedAt'] as String),
        status: json['status'] as String,
      );

  final String id;
  final String offerId;
  final String userId;
  final String merchant;

  /// The code the merchant scans.
  final String code;
  final int costPoints;
  final DateTime issuedAt;
  final DateTime expiresAt;
  final DateTime? redeemedAt;
  final String status;
}

class Offer {
  const Offer({
    required this.id,
    required this.category,
    required this.name,
    required this.merchant,
    required this.merchantShort,
    required this.costPoints,
    required this.currency,
    required this.imageUrl,
    required this.available,
  });

  factory Offer.fromJson(Map<String, dynamic> json) => Offer(
        id: json['id'] as String,
        category: json['category'] as String,
        name: json['name'] as String,
        merchant: json['merchant'] as String,
        merchantShort: json['merchantShort'] as String,
        costPoints: json['costPoints'] as int,
        currency: Currency.parse(json['currency'] as String),
        imageUrl: json['imageUrl'] as String?,
        available: json['available'] as bool,
      );

  final String id;
  final String category;
  final String name;
  final String merchant;
  final String merchantShort;
  final int costPoints;

  /// Which purse pays. A Green reward must not be buyable with Trip points.
  final Currency currency;
  final String? imageUrl;
  final bool available;
}

class CheckinResult {
  const CheckinResult({
    required this.placeId,
    required this.placeName,
    required this.awarded,
    required this.pointsAwarded,
    required this.balances,
    required this.exp,
    required this.distanceM,
  });

  factory CheckinResult.fromJson(Map<String, dynamic> json) => CheckinResult(
        placeId: json['placeId'] as String,
        placeName: json['placeName'] as String,
        awarded: json['awarded'] as bool,
        pointsAwarded: json['pointsAwarded'] as int,
        balances: Balances.fromJson(json['balances'] as Map<String, dynamic>),
        exp: json['exp'] as int,
        distanceM: json['distanceM'] as int,
      );

  final String placeId;
  final String placeName;

  /// False when they are here but already checked in today. NOT an error.
  final bool awarded;
  final int pointsAwarded;
  final Balances balances;
  final int exp;
  final int distanceM;
}

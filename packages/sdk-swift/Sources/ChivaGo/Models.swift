import Foundation

/// A bilingual string. The app shows BOTH; a push shows one.
public struct Bilingual: Codable, Sendable, Equatable {
    public let en: String
    public let th: String
}

/// The two spendable currencies.
///
/// They differ in EVIDENCE, not in colour: green is host-verified work, trip is
/// self-verified exploration. Only one of them belongs in an impact claim.
public enum Currency: String, Codable, Sendable {
    case trip
    case green
}

public struct Balances: Codable, Sendable {
    public let trip: Int
    public let green: Int
}

public struct Rank: Codable, Sendable {
    public let index: Int
    public let key: String
    public let label: Bilingual
}

public struct RankState: Codable, Sendable {
    public let index: Int
    public let key: String
    public let label: Bilingual
    public let fromLevel: Int
    public let earned: Bool
}

/// Lifetime progress. NOT derived from a balance — spending must never demote.
public struct Progression: Codable, Sendable {
    public let exp: Int
    public let level: Int
    public let intoLevel: Int
    public let levelSpan: Int
    public let rank: Rank
    public let nextRank: Rank?
    public let nextRankAtLevel: Int?
    public let ladder: [RankState]

    /// Bar fill, 0–1. Derived here rather than sent: it is presentation.
    public var progress: Double {
        levelSpan == 0 ? 0 : Double(intoLevel) / Double(levelSpan)
    }
}

public struct LedgerEntry: Codable, Sendable {
    public let id: String
    public let label: String
    public let occurredAt: Date

    /// Every entry names the host that verified it. Non-negotiable for trust.
    public let host: String

    /// Signed. Positive credits, negative debits.
    public let amount: Int
    public let currency: Currency

    /// EXP granted. Zero on a debit: spending is not progress lost.
    public let exp: Int
    public let kind: String
    public let sourceRef: String

    public var isCredit: Bool { amount >= 0 }
}

public struct Wallet: Codable, Sendable {
    public let balances: Balances
    public let progression: Progression
    public let ledger: [LedgerEntry]
}

// MARK: - Places

public struct PlaceMetrics: Codable, Sendable {
    public let crowdDensity: Double
    public let aqi: Double
    public let safetyIndex: Double
    public let walkability: Double
}

/// One line of the Healthy Score explanation.
///
/// The score is never a black box: every component says what it measured, how
/// it was weighted for this reader, and how fresh the reading is.
public struct ScoreComponent: Codable, Sendable {
    public let key: String
    public let label: Bilingual
    public let display: String
    public let subScore: Double
    public let weight: Double

    /// live | daily | estimated | stale.
    public let provenance: String
}

public struct ScoreBreakdown: Codable, Sendable {
    public let total: Double
    public let components: [ScoreComponent]
    public let profileApplied: String
}

public struct ReviewSummary: Codable, Sendable {
    public let count: Int

    /// Null, never zero. Zero is a rating, and a place nobody has been to has
    /// not scored badly.
    public let average: Double?
    public let distribution: [Int]
}

public struct Place: Codable, Sendable {
    public let id: String
    public let name: Bilingual
    public let short: String
    public let layer: String
    public let lat: Double
    public let lng: Double
    public let meta: String
    public let blurb: Bilingual
    public let tags: [String]
    public let photoUrl: String?
    public let metrics: PlaceMetrics
    public let healthyScore: Double
    public let breakdown: ScoreBreakdown

    /// Traveller ratings, deliberately OUTSIDE healthyScore.
    public let reviews: ReviewSummary
}

// MARK: - Quests, reviews, vouchers

public struct QuestHost: Codable, Sendable {
    public let id: String
    public let name: String
    public let type: String
}

public struct Quest: Codable, Sendable {
    public let id: String

    /// Two letters and a number, shown in the ink square. Not an icon.
    public let code: String
    public let name: Bilingual
    public let `where`: String
    public let duration: String
    public let rewardPoints: Int

    /// Which currency this pays. A property of the quest, never of the caller.
    public let rewardCurrency: Currency
    public let host: QuestHost
    public let kind: String
    public let lat: Double
    public let lng: Double
    public let geofenceRadiusM: Int
}

public struct PlaceReview: Codable, Sendable {
    public let id: String
    public let placeId: String
    public let authorId: String
    public let authorName: String
    public let rating: Int
    public let body: String?

    /// The language it was WRITTEN in. Label it; never auto-translate it.
    public let language: String

    /// When they were THERE, from the check-in. Not when they wrote.
    public let visitedAt: Date
    public let createdAt: Date
    public let updatedAt: Date?
}

public struct Voucher: Codable, Sendable {
    public let id: String
    public let offerId: String
    public let userId: String
    public let merchant: String

    /// The code the merchant scans.
    public let code: String
    public let costPoints: Int
    public let issuedAt: Date
    public let expiresAt: Date
    public let redeemedAt: Date?
    public let status: String
}

public struct Offer: Codable, Sendable {
    public let id: String
    public let category: String
    public let name: String
    public let merchant: String
    public let merchantShort: String
    public let costPoints: Int

    /// Which purse pays. A Green reward must not be buyable with Trip points.
    public let currency: Currency
    public let imageUrl: String?
    public let available: Bool
}

public struct CheckinResult: Codable, Sendable {
    public let placeId: String
    public let placeName: String

    /// False when they are here but already checked in today. NOT an error.
    public let awarded: Bool
    public let pointsAwarded: Int
    public let balances: Balances
    public let exp: Int
    public let distanceM: Int
}

// MARK: - Envelope

/// Every response arrives in this shape.
struct Envelope<T: Decodable>: Decodable {
    let ok: Bool
    let data: T?
    let error: String?
    let code: String?
}

/// A refusal the API returned deliberately, with a code the caller can branch on.
public struct ApiError: Error, Sendable {
    /// Machine-readable: OUTSIDE_GEOFENCE, NEVER_VISITED, INSUFFICIENT_POINTS…
    public let code: String

    /// Written for a person to read. Show this; do not rewrite it.
    public let message: String
    public let status: Int
}

extension ApiError: LocalizedError {
    public var errorDescription: String? { message }
}

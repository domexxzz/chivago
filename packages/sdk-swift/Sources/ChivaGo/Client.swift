import Foundation

/// The client.
///
/// Errors are thrown rather than returned, unlike the Dart client's `Result`.
/// Swift's `async throws` is the idiom callers already write `do`/`catch`
/// around, and a `Result` here would fight the language rather than help.
///
/// The distinction that matters is preserved either way: `ApiError` is the API
/// declining, with a code you can branch on. A `URLError` is the socket, and
/// pretending those are the same thing loses exactly what the caller needs.
public final class ChivagoClient: @unchecked Sendable {
    public let baseURL: URL

    /// Who the caller is. Informational once `deviceKey` is set: the server
    /// resolves identity from the key and ignores this header.
    public let userID: String

    /// This device's credential, from `registerDevice`. Without it the server
    /// answers 401 to everything except registration the moment ANY account
    /// exists - which every phone running the app has, because it registers
    /// on first launch. The bare `x-chivago-user` header was the pilot's
    /// escape hatch and it closed itself.
    public let deviceKey: String?

    private let session: URLSession
    private let decoder: JSONDecoder

    public init(baseURL: URL, userID: String, deviceKey: String? = nil, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.userID = userID
        self.deviceKey = deviceKey
        self.session = session
        self.decoder = ChivagoClient.makeDecoder()
    }

    // MARK: - Account

    /// Register this device and receive its key - ONCE. Only a hash is stored
    /// server-side. Unauthenticated by necessity and rate-limited per address.
    /// Build the client you will keep from the result.
    public static func registerDevice(
        baseURL: URL,
        label: String? = nil,
        locale: String? = nil,
        session: URLSession = .shared
    ) async throws -> RegisteredDevice {
        let bootstrap = ChivagoClient(baseURL: baseURL, userID: "", session: session)
        return try await bootstrap.post(
            "/devices",
            body: NewDevice(label: label, locale: locale),
            as: RegisteredDevice.self
        )
    }

    /// Who this key belongs to, and which phones share the account.
    public func account() async throws -> Account {
        try await get("/account", as: Account.self)
    }

    /// A decoder that copes with the timestamps this API actually sends.
    ///
    /// `.iso8601` alone does NOT parse fractional seconds, and every timestamp
    /// here has them: `2026-08-31T12:00:00.000Z`. A decoder without this throws
    /// on the very first response, which is the kind of thing that is obvious
    /// in five minutes with a compiler and invisible without one.
    static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]

        decoder.dateDecodingStrategy = .custom { inner in
            let raw = try inner.singleValueContainer().decode(String.self)
            if let date = withFraction.date(from: raw) { return date }
            if let date = plain.date(from: raw) { return date }
            throw DecodingError.dataCorrupted(
                DecodingError.Context(
                    codingPath: inner.codingPath,
                    debugDescription: "Not an ISO-8601 instant: \(raw)"
                )
            )
        }
        return decoder
    }

    private func send<T: Decodable>(
        _ method: String,
        _ path: String,
        body: (any Encodable)? = nil,
        as type: T.Type
    ) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue(userID, forHTTPHeaderField: "x-chivago-user")
        if let deviceKey {
            request.setValue(deviceKey, forHTTPHeaderField: "x-chivago-device-key")
        }
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        if let body {
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }

        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let envelope = try decoder.decode(Envelope<T>.self, from: data)

        guard envelope.ok, let value = envelope.data else {
            throw ApiError(
                code: envelope.code ?? "UNKNOWN",
                message: envelope.error ?? "Request failed",
                status: status
            )
        }
        return value
    }

    private func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        try await send("GET", path, body: nil, as: type)
    }

    private func post<T: Decodable>(
        _ path: String,
        body: (any Encodable)? = nil,
        as type: T.Type
    ) async throws -> T {
        try await send("POST", path, body: body ?? EmptyBody(), as: type)
    }

    // MARK: - Places

    public func places() async throws -> [Place] {
        try await get("/places", as: [Place].self)
    }

    public func place(_ id: String) async throws -> Place {
        try await get("/places/\(id)", as: Place.self)
    }

    /// Check in. The SERVER decides whether you are close enough — a client that
    /// judges its own geofence is a client that can be told to lie.
    ///
    /// `awarded == false` means you are here and already checked in today. That
    /// is a success, not a refusal.
    public func checkIn(placeID: String, lat: Double, lng: Double, accuracyM: Double? = nil) async throws -> CheckinResult {
        try await post(
            "/places/\(placeID)/checkin",
            body: Coordinates(lat: lat, lng: lng, accuracyM: accuracyM),
            as: CheckinResult.self
        )
    }

    public func checkinsToday() async throws -> [String] {
        try await get("/checkins/today", as: [String].self)
    }

    // MARK: Recorded, not scored

    /// Stamps the traveller issued themselves, and how many the year still allows.
    public func selfVisits() async throws -> SelfVisits {
        try await get("/visits/self", as: SelfVisits.self)
    }

    /// Verified and self-reported provinces, kept apart, plus the companions' evidence.
    public func passport() async throws -> Passport {
        try await get("/passport", as: Passport.self)
    }

    // MARK: - Quests

    public func quests() async throws -> [Quest] {
        try await get("/quests", as: QuestList.self).quests
    }

    // MARK: - Wallet

    public func wallet() async throws -> Wallet {
        try await get("/wallet", as: Wallet.self)
    }

    public func offers() async throws -> [Offer] {
        try await get("/offers", as: [Offer].self)
    }

    public func vouchers() async throws -> [Voucher] {
        try await get("/vouchers", as: [Voucher].self)
    }

    /// Redeem. Throws INSUFFICIENT_POINTS naming the currency that was short —
    /// with two purses, "not enough points" is not an answer.
    public func redeem(offerID: String) async throws -> Voucher {
        try await post("/offers/\(offerID)/redeem", as: RedeemResponse.self).voucher
    }

    // MARK: - Reviews

    /// Every review here is from somebody the server confirmed was at the place.
    /// Not because it filters — because an unverified one cannot be written.
    public func reviews(placeID: String) async throws -> [PlaceReview] {
        try await get("/places/\(placeID)/reviews", as: ReviewList.self).reviews
    }

    public func writeReview(
        placeID: String,
        rating: Int,
        body: String? = nil
    ) async throws -> PlaceReview {
        try await post(
            "/places/\(placeID)/reviews",
            body: NewReview(rating: rating, body: body),
            as: WriteReviewResponse.self
        ).review
    }

    /// Report a review. This hides NOTHING: it puts the review in front of a
    /// moderator, and no count anywhere trips a switch.
    public func reportReview(_ reviewID: String, reason: String, note: String? = nil) async throws {
        _ = try await post("/reviews/\(reviewID)/report", body: NewReport(reason: reason, note: note), as: ReportResponse.self)
    }
}

// MARK: - Request and wrapper bodies

/// `accuracyM` is the fix's own error radius; a fix wider than the fence is refused.
struct Coordinates: Encodable { let lat: Double; let lng: Double; let accuracyM: Double? }
struct NewDevice: Encodable { let label: String?; let locale: String? }
struct NewReview: Encodable { let rating: Int; let body: String? }
struct NewReport: Encodable { let reason: String; let note: String? }
struct EmptyBody: Encodable {}

struct QuestList: Decodable { let quests: [Quest] }
struct ReviewList: Decodable { let reviews: [PlaceReview] }
struct WriteReviewResponse: Decodable { let review: PlaceReview }
struct RedeemResponse: Decodable { let voucher: Voucher }
struct ReportResponse: Decodable { let id: String }

/// Erases an `Encodable` so one `send` can take any body.
///
/// The stored closure is deliberately NOT called `encode`: with that name it
/// and `encode(to:)` are both in scope inside the method, `try encode(encoder)`
/// resolves to the method, and it calls itself until the stack runs out.
struct AnyEncodable: Encodable {
    private let write: (Encoder) throws -> Void

    init(_ wrapped: any Encodable) {
        write = { encoder in try wrapped.encode(to: encoder) }
    }

    func encode(to encoder: Encoder) throws { try write(encoder) }
}

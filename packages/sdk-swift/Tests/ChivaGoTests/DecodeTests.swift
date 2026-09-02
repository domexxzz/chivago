import XCTest
@testable import ChivaGo

/// Decoding tests against REAL responses captured from the running API.
///
/// The same payloads the Dart SDK decodes - `api-samples.json` here is a copy
/// of the tracked `contract/api-samples.json` at the repository root, and the
/// two are expected to match - so the two clients are proven against
/// identical evidence rather than against each author's imagination.
///
/// The package was written on a machine with no Swift toolchain and went
/// forty commits uncompiled. It now builds under Swift 6.3 and these
/// assertions pass against both the original capture and a fresh one; CI runs
/// `swift test` on every push.
final class DecodeTests: XCTestCase {

    private func samples() throws -> [String: Any] {
        guard let url = Bundle.module.url(forResource: "api-samples", withExtension: "json") else {
            XCTFail("api-samples.json missing from the test bundle")
            return [:]
        }
        let data = try Data(contentsOf: url)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func decode<T: Decodable>(_ key: String, as type: T.Type) throws -> T {
        let all = try samples()
        let value = try XCTUnwrap(all[key], "no sample captured for \(key)")
        let data = try JSONSerialization.data(withJSONObject: value)
        return try ChivagoClient.makeDecoder().decode(T.self, from: data)
    }

    func testPlaceCarriesItsProvinceAndACreditedPhoto() throws {
        // The two fields the API grew after the SDKs were written, and that
        // the SDKs decoded as nothing for forty commits. A photograph is a
        // record with a credit, never a bare URL.
        let places = try decode("places", as: [Place].self)
        XCTAssertEqual(places.count, 5)
        for place in places {
            XCTAssertTrue(place.province.hasPrefix("TH-"), place.id)
        }
        let chaweng = try XCTUnwrap(places.first { $0.id == "chaweng" })
        let photo = try XCTUnwrap(chaweng.photo, "Chaweng has a public-domain photograph")
        XCTAssertFalse(photo.credit.isEmpty)
        XCTAssertFalse(photo.licence.isEmpty)
        XCTAssertNil(places.first { $0.id == "mangrove" }?.photo, "no photograph exists of the mangrove")
    }

    func testWalletCarriesBothPursesAndTheLadder() throws {
        let wallet = try decode("wallet", as: Wallet.self)
        XCTAssertGreaterThan(wallet.balances.green, 0)
        XCTAssertGreaterThanOrEqual(wallet.progression.level, 1)
        XCTAssertEqual(wallet.progression.ladder.count, 5)
        XCTAssertFalse(wallet.progression.rank.label.th.isEmpty)
        XCTAssertFalse(wallet.ledger.isEmpty)
    }

    func testSpendingGrantedNoExp() throws {
        let wallet = try decode("wallet", as: Wallet.self)
        let debits = wallet.ledger.filter { !$0.isCredit }
        XCTAssertFalse(debits.isEmpty, "the capture redeems an offer")
        for debit in debits {
            // THE invariant of the whole economy, checked from a third language.
            XCTAssertEqual(debit.exp, 0, "a debit must never cost progress")
        }
    }

    func testDatesDecodeIncludingFractionalSeconds() throws {
        let wallet = try decode("wallet", as: Wallet.self)
        let entry = try XCTUnwrap(wallet.ledger.first)
        // `.iso8601` alone does NOT parse "2026-08-31T12:00:00.000Z", and every
        // timestamp this API sends has fractional seconds. A decoder without
        // the custom strategy throws on the very first response.
        XCTAssertGreaterThan(entry.occurredAt.timeIntervalSince1970, 0)
    }

    func testPlaceScoreIsExplainableAndRatingsStayOutsideIt() throws {
        let place = try decode("place", as: Place.self)
        XCTAssertFalse(place.name.th.isEmpty)
        XCTAssertFalse(place.breakdown.components.isEmpty)
        for component in place.breakdown.components {
            XCTAssertFalse(component.provenance.isEmpty, "every component names its freshness")
            XCTAssertFalse(component.display.isEmpty)
        }
        XCTAssertEqual(place.reviews.distribution.count, 5)
    }

    func testAirObservedAtIsARealInstant() throws {
        // Open-Meteo answers in local Bangkok time with no offset and no
        // seconds. That used to be passed straight through, which is exactly
        // the value that would throw here and take the whole response with it.
        let place = try decode("place", as: Place.self)
        XCTAssertNotNil(place.metrics.aqi)
    }

    func testQuestsCarryTheCurrencyTheyPayIn() throws {
        let list = try decode("quests", as: QuestList.self)
        XCTAssertFalse(list.quests.isEmpty)
        let currencies = Set(list.quests.map(\.rewardCurrency))
        // Both must be represented, or the seed has quietly become
        // single-currency again and the deck's claim is false.
        XCTAssertEqual(currencies.count, 2)
    }

    func testCheckinIncludingTheNotAwardedCase() throws {
        let result = try decode("checkin", as: CheckinResult.self)
        XCTAssertEqual(result.placeId, "chaweng")
        // The capture checks in during warm-up, so the recorded call is the
        // second that day: awarded false, and that is a 200.
        XCTAssertFalse(result.awarded)
        XCTAssertEqual(result.pointsAwarded, 0)
    }

    func testVouchersAnswerInCamelCase() throws {
        let vouchers = try decode("vouchers", as: [Voucher].self)
        XCTAssertFalse(vouchers.isEmpty)
        XCTAssertTrue(vouchers[0].code.hasPrefix("CG-"))
        // This endpoint used to return raw database rows, so `costPoints`
        // decoded as nil and this test is the one that would have caught it.
        XCTAssertGreaterThan(vouchers[0].costPoints, 0)
    }

    func testOffersAndReviews() throws {
        let offers = try decode("offers", as: [Offer].self)
        XCTAssertEqual(Set(offers.map(\.currency)).count, 2)

        let reviews = try decode("reviews", as: ReviewList.self)
        XCTAssertFalse(reviews.reviews.isEmpty)
    }
}
